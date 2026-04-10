# Pending Device Linking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the pending-device `Vincular` dialog so operators can reuse an existing device, create a new available device, bind a new device to an existing vehicle, or create a new vehicle already bound to the new device.

**Architecture:** Keep the current devices page structure intact and evolve the pending panel in place. The page will now load eligible vehicles, the dialog will switch between four modes, and new server actions in `pending-devices.ts` will create the device and optional vehicle association before removing the pending row.

**Tech Stack:** Next.js App Router, React 19 client dialog state, Supabase server actions, Vitest + Testing Library

---

## File Structure

### Modified files

- `web/src/app/(dashboard)/devices/page.tsx`
  Purpose: load available vehicles and pass them to the pending panel.
- `web/src/app/(dashboard)/devices/page.test.tsx`
  Purpose: assert the page wires eligible vehicles into the pending panel.
- `web/src/components/devices/pending-devices-table.tsx`
  Purpose: replace the single-purpose link dialog with four modes and mode-specific forms.
- `web/src/components/devices/pending-devices-table.test.tsx`
  Purpose: lock in the four dialog paths and their loading states.
- `web/src/lib/actions/pending-devices.ts`
  Purpose: preserve legacy link behavior and add create-device / create-vehicle flows for pending rows.

## Task 1: Expand Page Wiring for Available Vehicles

**Files:**
- Modify: `web/src/app/(dashboard)/devices/page.tsx`
- Modify: `web/src/app/(dashboard)/devices/page.test.tsx`

- [ ] **Step 1: Write the failing page test for vehicles passed to the pending panel**

```tsx
vi.mock("@/lib/actions/vehicles", () => ({
  getVehicles: vi.fn(),
}));

vi.mock("@/components/devices/pending-devices-table", () => ({
  PendingDevicesTable: ({
    pending,
    devices,
    vehicles,
  }: {
    pending: unknown[];
    devices: unknown[];
    vehicles: unknown[];
  }) => (
    <div data-testid="pending-devices-table">
      pending:{pending.length} devices:{devices.length} vehicles:{vehicles.length}
    </div>
  ),
}));
```

- [ ] **Step 2: Run the page test to verify it fails**

Run: `npm test -- src/app/'(dashboard)'/devices/page.test.tsx`

Expected: FAIL because `DevicesPage` does not load vehicles or pass a `vehicles` prop.

- [ ] **Step 3: Implement the minimal page wiring**

```tsx
const [devices, pending, vehicles] = await Promise.all([
  getDevices(),
  getPendingDevices(),
  getVehicles(),
]);

<PendingDevicesTable
  pending={pending}
  devices={...}
  vehicles={vehicles
    .filter((vehicle) => !vehicle.device_id)
    .map((vehicle) => ({
      id: vehicle.id,
      plate: vehicle.plate,
      name: vehicle.name,
    }))}
/>
```

- [ ] **Step 4: Run the page test to verify it passes**

Run: `npm test -- src/app/'(dashboard)'/devices/page.test.tsx`

Expected: PASS with the pending panel receiving the expected `vehicles` count.

## Task 2: Lock In the New Pending Dialog Modes

**Files:**
- Modify: `web/src/components/devices/pending-devices-table.test.tsx`

- [ ] **Step 1: Write failing tests for the three new flows**

```tsx
const {
  dismissPendingDevice,
  linkPendingDevice,
  createDeviceFromPending,
  createDeviceAndAssignVehicleFromPending,
  createDeviceAndVehicleFromPending,
} = vi.hoisted(() => ({
  dismissPendingDevice: vi.fn(),
  linkPendingDevice: vi.fn(),
  createDeviceFromPending: vi.fn(),
  createDeviceAndAssignVehicleFromPending: vi.fn(),
  createDeviceAndVehicleFromPending: vi.fn(),
}));

it("creates a new available device from a pending serial", async () => {
  fireEvent.click(screen.getByRole("button", { name: /vincular/i }));
  fireEvent.click(screen.getByRole("button", { name: /novo dispositivo/i }));
  fireEvent.change(screen.getByLabelText(/imei/i), { target: { value: "861234567890123" } });
  fireEvent.submit(screen.getByRole("form", { name: /novo dispositivo/i }));
  expect(createDeviceFromPending).toHaveBeenCalled();
});
```

Add matching tests for:

- selecting an existing vehicle and calling `createDeviceAndAssignVehicleFromPending("pending-1", "vehicle-1", formData)`;
- filling the new vehicle fields and calling `createDeviceAndVehicleFromPending("pending-1", formData)`.

- [ ] **Step 2: Run the component tests to verify they fail**

Run: `npm test -- src/components/devices/pending-devices-table.test.tsx`

Expected: FAIL because the component only supports the legacy device list.

- [ ] **Step 3: Implement the minimal dialog state and forms**

```tsx
type LinkMode =
  | "existing-device"
  | "new-device"
  | "existing-vehicle"
  | "new-vehicle";

const [mode, setMode] = useState<LinkMode>("existing-device");
const [openFor, setOpenFor] = useState<string | null>(null);
const [error, setError] = useState<string | null>(null);
```

Render:

- a segmented set of buttons for the four modes;
- the legacy device list when `mode === "existing-device"`;
- a small `<form>` for `new-device`;
- a `<form>` with vehicle selector for `existing-vehicle`;
- a combined `<form>` for `new-vehicle`.

- [ ] **Step 4: Run the component tests to verify they pass**

Run: `npm test -- src/components/devices/pending-devices-table.test.tsx`

Expected: PASS for the legacy path and all three new flows.

## Task 3: Add Pending Device Creation Actions

**Files:**
- Modify: `web/src/lib/actions/pending-devices.ts`

- [ ] **Step 1: Implement shared pending lookup and device payload creation**

```ts
async function getPendingSerialOrError(pendingId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pending_devices")
    .select("id, serial")
    .eq("id", pendingId)
    .single();

  if (error || !data) {
    return { supabase, error: "Dispositivo pendente não encontrado" as const };
  }

  return { supabase, pending: data };
}
```

- [ ] **Step 2: Add the new create-device action**

```ts
export async function createDeviceFromPending(pendingId: string, formData: FormData) {
  const tenantId = await getTenantId();
  const result = await getPendingSerialOrError(pendingId);
  if ("error" in result) return { error: result.error };

  const { supabase, pending } = result;
  const { data: device, error } = await supabase
    .from("devices")
    .insert({
      tenant_id: tenantId,
      imei: formData.get("imei") as string,
      protocol: "suntech",
      model: (formData.get("model") as string) || null,
      serial_number: pending.serial,
    })
    .select("id")
    .single();

  if (error || !device) return { error: error?.message ?? "Não foi possível criar o dispositivo" };
  await supabase.from("pending_devices").delete().eq("id", pendingId);
  revalidatePath("/devices");
  return { success: true, deviceId: device.id };
}
```

- [ ] **Step 3: Add the existing-vehicle and new-vehicle flows**

```ts
export async function createDeviceAndAssignVehicleFromPending(
  pendingId: string,
  vehicleId: string,
  formData: FormData,
) {
  const deviceResult = await createDeviceFromPending(pendingId, formData);
  if (deviceResult.error || !deviceResult.deviceId) return deviceResult;

  const supabase = await createClient();
  const { data: vehicle, error: vehicleError } = await supabase
    .from("vehicles")
    .select("id, device_id")
    .eq("id", vehicleId)
    .single();

  if (vehicleError || !vehicle || vehicle.device_id) {
    return { error: "Veículo indisponível para vínculo" };
  }

  const { error } = await supabase
    .from("vehicles")
    .update({ device_id: deviceResult.deviceId })
    .eq("id", vehicleId);

  if (error) return { error: error.message };
  revalidatePath("/vehicles");
  return { success: true };
}
```

Add `createDeviceAndVehicleFromPending` with the same device creation plus:

```ts
await supabase.from("vehicles").insert({
  tenant_id,
  plate: formData.get("plate") as string,
  name: (formData.get("name") as string) || null,
  brand: (formData.get("brand") as string) || null,
  model: (formData.get("vehicle_model") as string) || null,
  year: formData.get("year") ? Number(formData.get("year")) : null,
  color: (formData.get("color") as string) || null,
  device_id: deviceResult.deviceId,
});
```

- [ ] **Step 4: Run focused component and page tests against the real action signatures**

Run: `npm test -- src/components/devices/pending-devices-table.test.tsx src/app/'(dashboard)'/devices/page.test.tsx`

Expected: PASS with the new action names and prop wiring.

## Task 4: Full Verification

**Files:**
- Modify: `web/src/app/(dashboard)/devices/page.tsx`
- Modify: `web/src/app/(dashboard)/devices/page.test.tsx`
- Modify: `web/src/components/devices/pending-devices-table.tsx`
- Modify: `web/src/components/devices/pending-devices-table.test.tsx`
- Modify: `web/src/lib/actions/pending-devices.ts`

- [ ] **Step 1: Run the focused device-flow tests**

Run:

```bash
npm test -- \
  src/components/devices/pending-devices-table.test.tsx \
  src/app/'(dashboard)'/devices/page.test.tsx
```

Expected: PASS

- [ ] **Step 2: Run the full web test suite**

Run: `npm test`

Expected: PASS with no regressions in the existing 18 test files.

- [ ] **Step 3: Review the diff before commit**

Run:

```bash
git status --short
git diff -- web/src/app/'(dashboard)'/devices/page.tsx \
  web/src/app/'(dashboard)'/devices/page.test.tsx \
  web/src/components/devices/pending-devices-table.tsx \
  web/src/components/devices/pending-devices-table.test.tsx \
  web/src/lib/actions/pending-devices.ts
```

Expected: only the pending-linking feature files are changed.
