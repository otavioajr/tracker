# Vehicle ID in Positions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tie GPS position history to the vehicle (not just the device) so history stays with the vehicle when equipment is swapped.

**Architecture:** Add `vehicle_id UUID` column to `positions` table. Gateway resolves vehicle from its device cache at insert time. Web history queries filter by `vehicle_id` instead of `device_id`.

**Tech Stack:** PostgreSQL (partitioned table), Go 1.24 (gateway), Next.js 16 / TypeScript (web), Supabase

**Spec:** `docs/superpowers/specs/2026-03-18-vehicle-id-in-positions-design.md`

---

### Task 1: Database migration — add vehicle_id column, index, and backfill

**Files:**
- Create: `supabase/migrations/<timestamp>_add_vehicle_id_to_positions.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Add vehicle_id to positions table
ALTER TABLE positions ADD COLUMN vehicle_id UUID;

-- Composite index for history queries by vehicle
CREATE INDEX idx_positions_vehicle_time ON positions(vehicle_id, server_time DESC);

-- Backfill existing data per partition (avoids long locks)
UPDATE positions_2026_03 p
SET vehicle_id = v.id
FROM vehicles v
WHERE v.device_id = p.device_id
  AND p.vehicle_id IS NULL;

UPDATE positions_2026_04 p
SET vehicle_id = v.id
FROM vehicles v
WHERE v.device_id = p.device_id
  AND p.vehicle_id IS NULL;
```

- [ ] **Step 2: Push migration to Supabase**

Run: `make db-push`
Expected: Migration applied successfully, no errors.

- [ ] **Step 3: Verify column exists**

Run via Supabase SQL editor or CLI:
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'positions' AND column_name = 'vehicle_id';
```
Expected: `vehicle_id | uuid | YES`

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/*_add_vehicle_id_to_positions.sql
git commit -m "feat(db): add vehicle_id column to positions table with backfill"
```

---

### Task 2: Gateway — expand DeviceInfo cache with VehicleID

**Files:**
- Modify: `gateway/internal/storage/writer.go:16-20` (DeviceInfo struct)
- Modify: `gateway/internal/storage/writer.go:66-89` (LoadDevices)
- Modify: `gateway/internal/storage/writer_test.go` (existing tests)

- [ ] **Step 1: Update the test data to include VehicleID**

In `gateway/internal/storage/writer_test.go`, update the `TestBuildBatchSQL` test's `devices` map to include `VehicleID`. This test will fail to compile until we update the struct.

```go
func ptrStr(s string) *string { return &s }

func TestBuildBatchSQL(t *testing.T) {
	positions := []*protocol.Position{
		{
			IMEI:       "123456789012345",
			Latitude:   -23.55,
			Longitude:  -46.63,
			Speed:      60.0,
			Heading:    180.0,
			Satellites: 10,
			Ignition:   true,
			DeviceTime: time.Date(2026, 3, 18, 10, 0, 0, 0, time.UTC),
			RawData:    "raw1",
		},
		{
			IMEI:       "123456789012346",
			Latitude:   -23.56,
			Longitude:  -46.64,
			Speed:      0.0,
			Heading:    0.0,
			Satellites: 8,
			Ignition:   false,
			DeviceTime: time.Date(2026, 3, 18, 10, 1, 0, 0, time.UTC),
			RawData:    "raw2",
		},
	}

	devices := map[string]DeviceInfo{
		"123456789012345": {DeviceID: "d0000000-0000-0000-0000-000000000001", TenantID: "a0000000-0000-0000-0000-000000000001", VehicleID: ptrStr("v0000000-0000-0000-0000-000000000001")},
		"123456789012346": {DeviceID: "d0000000-0000-0000-0000-000000000002", TenantID: "a0000000-0000-0000-0000-000000000001", VehicleID: nil},
	}

	sql, args := buildBatchInsert(positions, devices)

	if sql == "" {
		t.Fatal("expected non-empty SQL")
	}
	// 2 positions × 12 args each = 24 args
	if len(args) != 24 {
		t.Errorf("expected 24 args, got %d", len(args))
	}
}
```

Also update `TestBuildBatchSQL_SkipsUnknownDevices` — no struct change needed there since it uses an empty map.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gateway && go test ./internal/storage/ -v -run TestBuildBatch`
Expected: Compilation error — `DeviceInfo` has no field `VehicleID`.

- [ ] **Step 3: Add VehicleID to DeviceInfo struct**

In `gateway/internal/storage/writer.go`, update the struct at line 17-20:

```go
// DeviceInfo maps an IMEI to its database IDs.
type DeviceInfo struct {
	DeviceID  string
	TenantID  string
	VehicleID *string
}
```

- [ ] **Step 4: Update LoadDevices query and scan**

In `gateway/internal/storage/writer.go`, replace the `LoadDevices` method (lines 66-89):

```go
// LoadDevices fetches all active devices from the database and caches them.
func (w *Writer) LoadDevices(ctx context.Context) error {
	rows, err := w.pool.Query(ctx,
		`SELECT d.id, d.tenant_id, d.imei, v.id
		 FROM devices d
		 LEFT JOIN vehicles v ON v.device_id = d.id
		 WHERE d.active = true`)
	if err != nil {
		return fmt.Errorf("storage: failed to load devices: %w", err)
	}
	defer rows.Close()

	devices := make(map[string]DeviceInfo)
	for rows.Next() {
		var id, tenantID, imei string
		var vehicleID *string
		if err := rows.Scan(&id, &tenantID, &imei, &vehicleID); err != nil {
			return fmt.Errorf("storage: failed to scan device: %w", err)
		}
		devices[imei] = DeviceInfo{DeviceID: id, TenantID: tenantID, VehicleID: vehicleID}
	}

	w.mu.Lock()
	w.devices = devices
	w.mu.Unlock()

	w.logger.Info("loaded devices", "count", len(devices))
	return nil
}
```

- [ ] **Step 5: Update buildBatchInsert to include vehicle_id**

In `gateway/internal/storage/writer.go`, replace the `buildBatchInsert` function (lines 176-215):

```go
// buildBatchInsert constructs a multi-row INSERT statement.
func buildBatchInsert(positions []*protocol.Position, devices map[string]DeviceInfo) (string, []any) {
	var values []string
	var args []any
	paramIdx := 1

	for _, pos := range positions {
		info, ok := devices[pos.IMEI]
		if !ok {
			continue
		}

		rawJSON, _ := json.Marshal(map[string]string{"raw": pos.RawData})

		values = append(values, fmt.Sprintf(
			"($%d, $%d, $%d, ST_SetSRID(ST_MakePoint($%d, $%d), 4326), $%d, $%d, $%d, $%d, $%d, $%d::jsonb, $%d, now())",
			paramIdx, paramIdx+1, paramIdx+2, paramIdx+3, paramIdx+4,
			paramIdx+5, paramIdx+6, paramIdx+7, paramIdx+8,
			paramIdx+9, paramIdx+10, paramIdx+11,
		))
		args = append(args,
			info.DeviceID, info.TenantID, info.VehicleID,
			pos.Longitude, pos.Latitude,
			pos.Speed, pos.Heading, pos.Ignition, pos.Altitude,
			pos.Satellites, string(rawJSON), pos.DeviceTime,
		)
		paramIdx += 12
	}

	if len(values) == 0 {
		return "", nil
	}

	sql := fmt.Sprintf(
		"INSERT INTO positions (device_id, tenant_id, vehicle_id, location, speed, heading, ignition, altitude, satellites, raw_data, device_time, server_time) VALUES %s",
		strings.Join(values, ", "),
	)

	return sql, args
}
```

Key detail: `info.VehicleID` is `*string`. When it's `nil`, pgx sends SQL `NULL`. When it's a valid pointer, pgx sends the UUID string. No special handling needed.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd gateway && go test ./internal/storage/ -v -run TestBuildBatch`
Expected: Both tests PASS. `TestBuildBatchSQL` expects 24 args (was 22). `TestBuildBatchSQL_SkipsUnknownDevices` still expects 0 args.

- [ ] **Step 7: Commit**

```bash
git add gateway/internal/storage/writer.go gateway/internal/storage/writer_test.go
git commit -m "feat(gateway): include vehicle_id in position inserts"
```

---

### Task 3: Web — update position history to query by vehicle

**Files:**
- Modify: `web/src/lib/actions/positions.ts:5-14` (VehiclePosition type)
- Modify: `web/src/lib/actions/positions.ts:72-108` (getPositionHistory)

- [ ] **Step 1: Add vehicle_id to VehiclePosition type**

In `web/src/lib/actions/positions.ts`, update the type (lines 5-14):

```typescript
export type VehiclePosition = {
  device_id: string;
  vehicle_id?: string;
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
  ignition: boolean;
  device_time: string;
  plate?: string;
};
```

- [ ] **Step 2: Update getPositionHistory to filter by vehicle_id**

In `web/src/lib/actions/positions.ts`, replace the `getPositionHistory` function (lines 72-108):

```typescript
export async function getPositionHistory(
  vehicleId: string,
  startDate: string,
  endDate: string
): Promise<VehiclePosition[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("positions")
    .select("device_id, vehicle_id, location, speed, heading, ignition, device_time")
    .eq("vehicle_id", vehicleId)
    .gte("device_time", startDate)
    .lte("device_time", endDate)
    .order("device_time", { ascending: true });

  if (error) throw new Error(error.message);
  if (!data) return [];

  return data
    .map((pos) => {
      const location = pos.location as GeoJsonPoint;
      if (!location || location.type !== "Point") return null;

      const [longitude, latitude] = location.coordinates;

      return {
        device_id: pos.device_id,
        vehicle_id: pos.vehicle_id ?? undefined,
        latitude,
        longitude,
        speed: pos.speed ?? 0,
        heading: pos.heading ?? 0,
        ignition: pos.ignition ?? false,
        device_time: pos.device_time,
      };
    })
    .filter((p): p is VehiclePosition => p !== null);
}
```

- [ ] **Step 3: Verify build**

Run: `cd web && npm run build`

Note: The parameter rename from `deviceId` to `vehicleId` is not a type-breaking change in TypeScript (parameter names are not part of the call-site contract — both are `string`). The build should succeed. If it doesn't, proceed to Task 4 which fixes the call site.

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/actions/positions.ts
git commit -m "feat(web): update position history to query by vehicle_id"
```

---

### Task 4: Web — update history player to select by vehicle

**Files:**
- Modify: `web/src/components/map/history-player.tsx` (full component update)

- [ ] **Step 1: Update imports**

In `web/src/components/map/history-player.tsx`, replace lines 5-6:

From:
```typescript
import { getDevices } from "@/lib/actions/devices";
import { getPositionHistory, VehiclePosition } from "@/lib/actions/positions";
```

To:
```typescript
import { getVehicles } from "@/lib/actions/vehicles";
import { getPositionHistory, VehiclePosition } from "@/lib/actions/positions";
```

- [ ] **Step 2: Update the Vehicle type and state**

Replace the `Device` type and state declarations (lines 43-52):

From:
```typescript
type Device = {
  id: string;
  imei: string;
  vehicles: { id: string; plate: string } | { id: string; plate: string }[] | null;
};

export function HistoryPlayer() {
  const [mounted, setMounted] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceId, setDeviceId] = useState("");
```

To:
```typescript
type Vehicle = {
  id: string;
  plate: string;
};

export function HistoryPlayer() {
  const [mounted, setMounted] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState("");
```

Note: `getVehicles()` returns all columns via `select("*")`. The local `Vehicle` type only picks what we need (`id`, `plate`). The `as Vehicle[]` cast is safe since TypeScript structural typing allows extra fields.

- [ ] **Step 3: Update the data loading useEffect**

Replace the loading useEffect (lines 62-70):

From:
```typescript
  useEffect(() => {
    setMounted(true);
    getDevices()
      .then((data) => {
        setDevices((data as Device[]) ?? []);
        if (data && data.length > 0) setDeviceId(data[0].id);
      })
      .catch(() => setError("Erro ao carregar dispositivos"));
  }, []);
```

To:
```typescript
  useEffect(() => {
    setMounted(true);
    getVehicles()
      .then((data) => {
        setVehicles((data as Vehicle[]) ?? []);
        if (data && data.length > 0) setVehicleId(data[0].id);
      })
      .catch(() => setError("Erro ao carregar veiculos"));
  }, []);
```

- [ ] **Step 4: Update handleSearch**

In `handleSearch` (lines 91-113), two token replacements:
- Line 92: `!deviceId` → `!vehicleId`
- Line 105: `getPositionHistory(deviceId,` → `getPositionHistory(vehicleId,`

The rest of the function body stays identical.

- [ ] **Step 5: Remove getDeviceLabel and update selector UI**

First, delete the `getDeviceLabel` function (lines 142-148):
```typescript
  function getDeviceLabel(device: Device): string {
    const vehicles = device.vehicles;
    const plate = Array.isArray(vehicles)
      ? vehicles[0]?.plate
      : vehicles?.plate;
    return plate ? `${plate} (${device.imei})` : device.imei;
  }
```

Then replace the selector `<div>` block (lines 154-168):

From:
```tsx
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-muted-foreground">
            Dispositivo
          </label>
          <select
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {getDeviceLabel(d)}
              </option>
            ))}
          </select>
        </div>
```

To:
```tsx
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-muted-foreground">
            Veiculo
          </label>
          <select
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.plate}
              </option>
            ))}
          </select>
        </div>
```

- [ ] **Step 6: Verify build**

Run: `cd web && npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 7: Commit**

```bash
git add web/src/components/map/history-player.tsx
git commit -m "feat(web): switch history player from device to vehicle selector"
```

---

### Task 5: Regenerate Supabase types

**Files:**
- Modify: `web/src/types/database.ts` (auto-generated)

- [ ] **Step 1: Regenerate types**

Run: `make db-types`
Expected: `web/src/types/database.ts` updated with `vehicle_id` in the `positions` table type.

- [ ] **Step 2: Verify vehicle_id appears in the generated types**

Run: `grep vehicle_id web/src/types/database.ts`
Expected: `vehicle_id` appears in the `positions` Row/Insert/Update types.

- [ ] **Step 3: Verify build still passes**

Run: `cd web && npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add web/src/types/database.ts
git commit -m "chore(web): regenerate supabase types with vehicle_id column"
```

---

### Task 6: Full verification

- [ ] **Step 1: Run gateway tests**

Run: `cd gateway && go test ./... -v`
Expected: All tests pass.

- [ ] **Step 2: Run web build**

Run: `cd web && npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Run web lint**

Run: `cd web && npm run lint`
Expected: No errors.
