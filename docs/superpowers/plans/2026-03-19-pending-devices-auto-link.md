# Pending Devices Auto-Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow customers to register devices by IMEI (from label), while the gateway auto-captures unknown serials as "pending devices" that can be linked via the dashboard with one click.

**Architecture:** Add a `pending_devices` table where the gateway upserts unknown device serials. Add `serial_number` to `devices` for dual lookup. The web dashboard shows pending devices with a "Link" button that associates a serial to a registered device. Once linked, the gateway reloads its cache and starts processing data.

**Tech Stack:** PostgreSQL migration, Go gateway changes, Next.js server actions + React components.

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `supabase/migrations/20260319_add_serial_and_pending_devices.sql` | DB schema: serial_number column + pending_devices table + RLS |
| Modify | `gateway/internal/storage/writer.go` | Dual lookup (imei OR serial_number), load serial_number into cache |
| Create | `gateway/internal/storage/pending.go` | PendingWriter: upsert unknown serials into pending_devices |
| Modify | `gateway/cmd/gateway/main.go` | Wire PendingWriter, call on unregistered device |
| Modify | `gateway/internal/server/tcp.go` | Remove IsRegistered from interface, pass RemoteAddr to Position |
| Modify | `gateway/internal/server/tcp_test.go` | Update mockHandler and tests for new interface |
| Create | `gateway/internal/storage/pending_test.go` | Unit tests for PendingWriter |
| Modify | `gateway/internal/storage/writer_test.go` | Update tests for dual lookup |
| Create | `web/src/lib/actions/pending-devices.ts` | Server actions: getPendingDevices, linkPendingDevice, dismissPendingDevice |
| Create | `web/src/components/devices/pending-devices-table.tsx` | Table component showing pending devices with Link button |
| Modify | `web/src/app/(dashboard)/devices/page.tsx` | Add PendingDevicesTable above device table |
| Modify | `web/src/types/database.ts` | Regenerate types after migration |

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260319_add_serial_and_pending_devices.sql`

- [ ] **Step 1: Write migration SQL**

```sql
-- Add serial_number to devices (the binary protocol ID sent by the device)
ALTER TABLE devices ADD COLUMN serial_number TEXT;
CREATE UNIQUE INDEX idx_devices_serial_number ON devices(serial_number) WHERE serial_number IS NOT NULL;

-- Table for unknown devices that connect but aren't registered
CREATE TABLE pending_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  serial TEXT NOT NULL UNIQUE,
  protocol device_protocol NOT NULL DEFAULT 'suntech',
  ip_address TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  message_count INT NOT NULL DEFAULT 1,
  linked_device_id UUID REFERENCES devices(id) ON DELETE SET NULL
);

-- RLS: gateway writes via direct connection (bypasses RLS)
-- Note: pending_devices has no tenant_id (unknown until linked).
-- All authenticated users can see/manage pending devices.
-- This is acceptable because serials are not sensitive data.
ALTER TABLE pending_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_pending" ON pending_devices
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "admin_manage_pending" ON pending_devices
  FOR ALL USING (public.is_platform_admin());

CREATE POLICY "client_delete_pending" ON pending_devices
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- Backfill: set serial_number for the existing ST310U device
UPDATE devices SET serial_number = '007075134' WHERE imei = '007075134';
-- Restore original IMEI from label
UPDATE devices SET imei = '356430071495757' WHERE serial_number = '007075134';
```

- [ ] **Step 2: Push migration**

Run: `make db-push`
Expected: Migration applied successfully.

- [ ] **Step 3: Regenerate TypeScript types**

Run: `make db-types`
Expected: `web/src/types/database.ts` updated with `pending_devices` table and `serial_number` column on devices.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260319_add_serial_and_pending_devices.sql web/src/types/database.ts
git commit -m "feat(db): add serial_number to devices and pending_devices table"
```

---

### Task 2: Gateway — Dual Lookup by IMEI or Serial

**Files:**
- Modify: `gateway/internal/storage/writer.go`
- Modify: `gateway/internal/storage/writer_test.go`

- [ ] **Step 1: Update LoadDevices to populate both IMEI and serial keys**

In `writer.go`, update `LoadDevices` to query `serial_number` and populate the **same** `devices` map with both IMEI and serial_number keys pointing to the same `DeviceInfo`. This ensures `buildBatchInsert` (which does `devices[pos.IMEI]`) works regardless of whether the position came in via IMEI or serial.

```go
// In LoadDevices, change query to:
`SELECT d.id, d.tenant_id, d.imei, d.serial_number, v.id
 FROM devices d
 LEFT JOIN vehicles v ON v.device_id = d.id
 WHERE d.active = true`

// Scan serial_number as *string, populate same map with both keys:
var id, tenantID, imei string
var serialNumber, vehicleID *string
if err := rows.Scan(&id, &tenantID, &imei, &serialNumber, &vehicleID); err != nil { ... }

info := DeviceInfo{DeviceID: id, TenantID: tenantID, VehicleID: vehicleID}
devices[imei] = info
if serialNumber != nil && *serialNumber != "" {
    devices[*serialNumber] = info
}
```

Note: `LookupDevice` stays unchanged — it already does a simple map lookup. Now it matches either key.

- [ ] **Step 2: Update writer_test.go for dual lookup**

Add test cases:
- Lookup by IMEI → found
- Lookup by serial_number → found
- Lookup by unknown → not found

```go
func TestLookupDevice_DualKey(t *testing.T) {
    info := DeviceInfo{DeviceID: "d1", TenantID: "t1"}
    w := &Writer{
        devices: map[string]DeviceInfo{
            "imei123":    info,
            "serial456":  info,
        },
    }
    // lookup by IMEI
    got, ok := w.LookupDevice("imei123")
    if !ok { t.Fatal("expected found by IMEI") }
    if got.DeviceID != "d1" { t.Errorf("got %s", got.DeviceID) }
    // lookup by serial
    _, ok = w.LookupDevice("serial456")
    if !ok { t.Fatal("expected found by serial") }
    // lookup unknown
    _, ok = w.LookupDevice("unknown")
    if ok { t.Fatal("expected not found") }
}
```

- [ ] **Step 4: Run tests**

Run: `cd gateway && go test ./internal/storage/ -v -run TestLookup`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add gateway/internal/storage/writer.go gateway/internal/storage/writer_test.go
git commit -m "feat(gateway): dual device lookup by IMEI or serial_number"
```

---

### Task 3: Gateway — PendingWriter for Unknown Devices

**Files:**
- Create: `gateway/internal/storage/pending.go`
- Create: `gateway/internal/storage/pending_test.go`

- [ ] **Step 1: Create PendingWriter**

`pending.go` — upserts into `pending_devices` when an unknown serial connects. Uses a local dedup cache to avoid hammering the DB on every message from the same unknown device.

```go
package storage

import (
    "context"
    "log/slog"
    "sync"
    "time"

    "github.com/jackc/pgx/v5/pgxpool"
)

type PendingWriter struct {
    pool   *pgxpool.Pool
    seen   map[string]time.Time // serial → last upserted
    mu     sync.Mutex
    logger *slog.Logger
}

func NewPendingWriter(pool *pgxpool.Pool, logger *slog.Logger) *PendingWriter {
    return &PendingWriter{
        pool:   pool,
        seen:   make(map[string]time.Time),
        logger: logger,
    }
}

// Track upserts a pending device. Deduplicates by serial (max once per 5 minutes).
func (pw *PendingWriter) Track(ctx context.Context, serial, protocol, ipAddress string) {
    pw.mu.Lock()
    if last, ok := pw.seen[serial]; ok && time.Since(last) < 5*time.Minute {
        pw.mu.Unlock()
        return
    }
    pw.seen[serial] = time.Now()
    pw.mu.Unlock()

    _, err := pw.pool.Exec(ctx,
        `INSERT INTO pending_devices (serial, protocol, ip_address, first_seen_at, last_seen_at, message_count)
         VALUES ($1, $2::device_protocol, $3, now(), now(), 1)
         ON CONFLICT (serial) DO UPDATE SET
           last_seen_at = now(),
           ip_address = EXCLUDED.ip_address,
           message_count = pending_devices.message_count + 1`,
        serial, protocol, ipAddress,
    )
    if err != nil {
        pw.logger.Error("failed to track pending device", "serial", serial, "error", err)
    } else {
        pw.logger.Info("pending device tracked", "serial", serial, "ip", ipAddress)
    }
}
```

- [ ] **Step 2: Write test for dedup logic**

```go
func TestPendingWriter_Dedup(t *testing.T) {
    pw := &PendingWriter{
        seen:   make(map[string]time.Time),
        logger: slog.Default(),
    }
    // First call: not seen → should be tracked (seen map updated)
    pw.seen["serial1"] = time.Now()
    // Second call within 5min: should be deduped
    pw.mu.Lock()
    last, ok := pw.seen["serial1"]
    isDedup := ok && time.Since(last) < 5*time.Minute
    pw.mu.Unlock()
    if !isDedup {
        t.Error("expected dedup within 5 minutes")
    }
}
```

- [ ] **Step 3: Run tests**

Run: `cd gateway && go test ./internal/storage/ -v -run TestPending`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add gateway/internal/storage/pending.go gateway/internal/storage/pending_test.go
git commit -m "feat(gateway): add PendingWriter for unknown device tracking"
```

---

### Task 4: Gateway — Wire PendingWriter into Main

**Files:**
- Modify: `gateway/cmd/gateway/main.go`

- [ ] **Step 1: Add PendingWriter to gateway struct and initialization**

```go
// In main(), after writer creation:
pendingWriter := storage.NewPendingWriter(pool, logger)

// In gateway struct, add:
pending *storage.PendingWriter

// Wire it:
gw := &gateway{
    writer:      writer,
    alertEngine: alertEngine,
    pending:     pendingWriter,
    pool:        pool,
    metrics:     m,
    logger:      logger,
}
```

- [ ] **Step 2: Add RemoteAddr to protocol.Position**

In `gateway/internal/protocol/protocol.go`, add a field so the TCP handler can pass the client IP:

```go
type Position struct {
    // ... existing fields ...
    RemoteAddr string // client IP:port, set by TCP handler
}
```

- [ ] **Step 3: Update HandlePosition to track pending devices with IP**

```go
func (g *gateway) HandlePosition(pos *protocol.Position) {
    g.metrics.PositionsReceived.Add(1)

    info, ok := g.writer.LookupDevice(pos.IMEI)
    if !ok {
        // Unknown device — track as pending
        g.pending.Track(context.Background(), pos.IMEI, "suntech", pos.RemoteAddr)
        return
    }

    g.writer.Enqueue(pos)

    triggered := g.alertEngine.Evaluate(pos, info.DeviceID, info.TenantID)
    for _, alert := range triggered {
        g.metrics.AlertsTriggered.Add(1)
        g.saveAlert(alert)
    }
}
```

Also remove the now-unused `IsRegistered` method from gateway.

Note: `Enqueue` is moved after the lookup — intentional behavior change to avoid wasting batch capacity on unknown devices.

- [ ] **Step 4: Update tcp.go — remove IsRegistered, pass RemoteAddr**

In `server/tcp.go`:

1. Remove `IsRegistered` from the `PositionHandler` interface:
```go
type PositionHandler interface {
    HandlePosition(pos *protocol.Position)
}
```

2. Remove the `IsRegistered` check from `handleConnection`. Set `RemoteAddr` on the position before calling `HandlePosition`:
```go
// Remove these lines:
// if !s.handler.IsRegistered(pos.IMEI) { ... }

// Add before HandlePosition:
pos.RemoteAddr = remoteAddr
s.handler.HandlePosition(pos)
```

- [ ] **Step 5: Update tcp_test.go — fix mockHandler and tests**

In `gateway/internal/server/tcp_test.go`:

1. Remove `IsRegistered` from `mockHandler` (it no longer implements that method).
2. Rewrite `TestTCPServer_RejectsUnknownDevice` → rename to `TestTCPServer_PassesAllPositions` and assert that unknown device positions DO reach `HandlePosition` (filtering now happens there, not in TCP handler):

```go
type mockHandler struct {
    positions []*protocol.Position
}

func (m *mockHandler) HandlePosition(pos *protocol.Position) {
    m.positions = append(m.positions, pos)
}

func TestTCPServer_PassesAllPositions(t *testing.T) {
    handler := &mockHandler{}
    registry := protocol.NewRegistry(protocol.NewSuntechParser())
    srv := New(Config{Port: 0, ReadTimeout: 5 * time.Second, IdleTimeout: 10 * time.Second}, registry, handler)
    go srv.Start()
    defer srv.Stop()
    time.Sleep(100 * time.Millisecond)

    conn, err := net.Dial("tcp", srv.Addr())
    if err != nil { t.Fatalf("failed to connect: %v", err) }
    defer conn.Close()

    // Send position from any IMEI — should reach handler
    msg := "ST300STT;999999999999999;04;374;20260318;10:30:00;0CD4A;-23.55;-046.63;0;0;11;1;0;12.24\r\n"
    conn.Write([]byte(msg))
    time.Sleep(200 * time.Millisecond)

    if len(handler.positions) != 1 {
        t.Errorf("expected 1 position (all pass through), got %d", len(handler.positions))
    }
}
```

- [ ] **Step 6: Build and run tests**

Run: `cd gateway && go build ./cmd/gateway/ && go test ./... -v`
Expected: All tests pass, build succeeds.

- [ ] **Step 7: Commit**

```bash
git add gateway/cmd/gateway/main.go gateway/internal/server/tcp.go gateway/internal/server/tcp_test.go gateway/internal/protocol/protocol.go
git commit -m "feat(gateway): wire PendingWriter, pass RemoteAddr, remove IsRegistered"
```

---

### Task 5: Web — Server Actions for Pending Devices

**Files:**
- Create: `web/src/lib/actions/pending-devices.ts`

- [ ] **Step 1: Create server actions**

```typescript
"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function getPendingDevices() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pending_devices")
    .select("*")
    .is("linked_device_id", null)
    .order("last_seen_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}

export async function linkPendingDevice(pendingId: string, deviceId: string) {
  const supabase = await createClient();

  // Get the pending device serial
  const { data: pending, error: pendingError } = await supabase
    .from("pending_devices")
    .select("serial")
    .eq("id", pendingId)
    .single();

  if (pendingError || !pending) return { error: "Dispositivo pendente não encontrado" };

  // Set serial_number on the target device
  const { error: updateError } = await supabase
    .from("devices")
    .update({ serial_number: pending.serial })
    .eq("id", deviceId);

  if (updateError) return { error: updateError.message };

  // Remove from pending
  await supabase.from("pending_devices").delete().eq("id", pendingId);

  revalidatePath("/devices");
  return { success: true };
}

export async function dismissPendingDevice(pendingId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("pending_devices")
    .delete()
    .eq("id", pendingId);

  if (error) return { error: error.message };

  revalidatePath("/devices");
  return { success: true };
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/lib/actions/pending-devices.ts
git commit -m "feat(web): server actions for pending device management"
```

---

### Task 6: Web — Pending Devices Table Component

**Files:**
- Create: `web/src/components/devices/pending-devices-table.tsx`

- [ ] **Step 1: Create the component**

A table showing pending devices with: serial, protocol, IP, first seen, last seen, message count, and a "Link" button that opens a select dialog to choose which registered device to associate.

```tsx
"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link2, X } from "lucide-react";
import { useState } from "react";
import { linkPendingDevice, dismissPendingDevice } from "@/lib/actions/pending-devices";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type PendingDevice = {
  id: string;
  serial: string;
  protocol: string;
  ip_address: string | null;
  first_seen_at: string;
  last_seen_at: string;
  message_count: number;
};

type Device = {
  id: string;
  imei: string;
  model: string | null;
  serial_number: string | null;
};

export function PendingDevicesTable({
  pending,
  devices,
}: {
  pending: PendingDevice[];
  devices: Device[];
}) {
  const [linking, setLinking] = useState<string | null>(null);

  if (pending.length === 0) return null;

  // Only show devices that don't already have a serial_number
  const unlinkedDevices = devices.filter((d) => !d.serial_number);

  async function handleLink(pendingId: string, deviceId: string) {
    setLinking(pendingId);
    await linkPendingDevice(pendingId, deviceId);
    setLinking(null);
  }

  async function handleDismiss(pendingId: string) {
    if (!confirm("Ignorar este dispositivo pendente?")) return;
    await dismissPendingDevice(pendingId);
  }

  function formatDate(value: string): string {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">Dispositivos Pendentes</h2>
        <Badge variant="secondary">{pending.length}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        Dispositivos que se conectaram ao servidor mas ainda não foram associados a um cadastro.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Serial</TableHead>
            <TableHead>Protocolo</TableHead>
            <TableHead>IP</TableHead>
            <TableHead>Primeira conexão</TableHead>
            <TableHead>Última conexão</TableHead>
            <TableHead>Mensagens</TableHead>
            <TableHead className="w-32">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pending.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-mono">{p.serial}</TableCell>
              <TableCell>
                <Badge variant="outline">{p.protocol}</Badge>
              </TableCell>
              <TableCell className="font-mono text-sm">{p.ip_address ?? "—"}</TableCell>
              <TableCell>{formatDate(p.first_seen_at)}</TableCell>
              <TableCell>{formatDate(p.last_seen_at)}</TableCell>
              <TableCell>{p.message_count}</TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Dialog>
                    <DialogTrigger render={<Button variant="outline" size="sm" disabled={linking === p.id} />}>
                      <Link2 size={14} className="mr-1" /> Vincular
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Vincular serial {p.serial}</DialogTitle>
                      </DialogHeader>
                      <p className="text-sm text-muted-foreground">
                        Selecione o dispositivo cadastrado para associar a este serial:
                      </p>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {unlinkedDevices.length === 0 ? (
                          <p className="text-sm text-muted-foreground py-4 text-center">
                            Todos os dispositivos já possuem serial vinculado.
                          </p>
                        ) : (
                          unlinkedDevices.map((d) => (
                            <Button
                              key={d.id}
                              variant="outline"
                              className="w-full justify-start"
                              onClick={() => handleLink(p.id, d.id)}
                            >
                              <span className="font-mono">{d.imei}</span>
                              {d.model && (
                                <span className="ml-2 text-muted-foreground">({d.model})</span>
                              )}
                            </Button>
                          ))
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>
                  <Button variant="ghost" size="sm" onClick={() => handleDismiss(p.id)}>
                    <X size={14} className="text-muted-foreground" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/devices/pending-devices-table.tsx
git commit -m "feat(web): pending devices table component with link dialog"
```

---

### Task 7: Web — Integrate into Devices Page

**Files:**
- Modify: `web/src/app/(dashboard)/devices/page.tsx`

- [ ] **Step 1: Add pending devices to the page**

```tsx
import { getDevices } from "@/lib/actions/devices";
import { getPendingDevices } from "@/lib/actions/pending-devices";
import { DeviceTable } from "@/components/devices/device-table";
import { DeviceDialog } from "@/components/devices/device-dialog";
import { PendingDevicesTable } from "@/components/devices/pending-devices-table";

export default async function DevicesPage() {
  const [devices, pending] = await Promise.all([
    getDevices(),
    getPendingDevices(),
  ]);

  return (
    <div className="space-y-6">
      <PendingDevicesTable
        pending={pending}
        devices={devices.map((d) => ({
          id: d.id,
          imei: d.imei,
          model: d.model,
          serial_number: d.serial_number,
        }))}
      />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dispositivos</h1>
        <DeviceDialog />
      </div>
      <DeviceTable devices={devices} />
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd web && npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add web/src/app/\(dashboard\)/devices/page.tsx
git commit -m "feat(web): show pending devices on devices page"
```

---

### Task 8: Gateway — Reload Cache on Link

**Files:**
- Modify: `gateway/internal/storage/writer.go`

- [ ] **Step 1: Add periodic device cache reload**

Currently `LoadDevices` runs once at startup. Add a periodic reload so that when a pending device is linked in the web UI, the gateway picks it up without restart.

In `writer.go`, add a `StartDeviceReloader` method:

```go
func (w *Writer) StartDeviceReloader(ctx context.Context, interval time.Duration) {
    ticker := time.NewTicker(interval)
    defer ticker.Stop()
    for {
        select {
        case <-ctx.Done():
            return
        case <-ticker.C:
            if err := w.LoadDevices(ctx); err != nil {
                w.logger.Error("failed to reload devices", "error", err)
            }
        }
    }
}
```

- [ ] **Step 2: Wire in main.go**

Add `"time"` to the imports in `main.go` (if not already present). Then add after `go writer.StartFlusher(ctx)`:

```go
go writer.StartDeviceReloader(ctx, 30*time.Second)
```

- [ ] **Step 3: Build and test**

Run: `cd gateway && go build ./cmd/gateway/ && go test ./... -v`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add gateway/internal/storage/writer.go gateway/cmd/gateway/main.go
git commit -m "feat(gateway): periodic device cache reload every 30s"
```

---

### Task 9: Deploy and Verify End-to-End

- [ ] **Step 1: Push migration to Supabase**

Run: `make db-push`

- [ ] **Step 2: Cross-compile and deploy gateway**

```bash
cd gateway && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o bin/gateway-linux ./cmd/gateway
scp -i ~/.ssh/id_ed25519 bin/gateway-linux ubuntu@137.131.168.96:~/tracker/gateway-binary
ssh ubuntu@137.131.168.96 "kill \$(pgrep gateway-binary); sleep 2; cd ~/tracker && chmod +x gateway-binary && source gateway/.env && nohup env DATABASE_URL=\$DATABASE_URL TCP_PORT=5001 METRICS_PORT=9090 ./gateway-binary > gateway.log 2>&1 &"
```

- [ ] **Step 3: Verify pending device appears**

Check gateway logs for "pending device tracked" message. Check the web dashboard `/devices` page for the pending device entry.

- [ ] **Step 4: Link the device via dashboard**

Click "Vincular" on the pending device, select the registered device. Verify serial_number is set on the device and the pending entry disappears.

- [ ] **Step 5: Verify positions are now being processed**

Wait 30s for cache reload. Check gateway logs for "flushed positions". Query the positions table for new entries with correct coordinates.

- [ ] **Step 6: Commit any final adjustments**

```bash
git add -A
git commit -m "feat: pending devices auto-link complete"
```
