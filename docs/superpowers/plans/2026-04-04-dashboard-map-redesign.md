# Dashboard Map Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesenhar a tela principal do mapa para priorizar busca, seleção e follow de veículos sem depender do popup do marker.

**Architecture:** A página continua mapa-first, mas passa a ter um trilho lateral recolhível no desktop e um bottom sheet no mobile usando os mesmos dados filtrados. O estado fica centralizado em `dashboard-map.tsx`, a lógica derivada vai para helpers puros testáveis, e os componentes de apresentação do painel/follow ficam separados para evitar concentrar toda a UI em um único arquivo.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind CSS v4, Base UI/shadcn components, react-leaflet/Leaflet, Vitest para helpers puros

---

## File Structure

### Create

- `web/vitest.config.ts` — configuração mínima do Vitest para rodar helpers TypeScript do `web`
- `web/src/lib/map/dashboard-map-utils.ts` — helpers puros de status, rótulo, tempo relativo e filtragem da lista
- `web/src/lib/map/dashboard-map-utils.test.ts` — testes dos helpers do mapa
- `web/src/components/map/types.ts` — tipo compartilhado de posição de veículo e enumeração de status operacional
- `web/src/components/map/dashboard-follow-bar.tsx` — barra compacta de veículo seguido sobre o mapa
- `web/src/components/map/dashboard-vehicle-list-item.tsx` — linha enxuta da lista de veículos
- `web/src/components/map/dashboard-vehicle-browser.tsx` — conteúdo compartilhado de busca, filtros, lista e estados vazios
- `web/src/components/map/dashboard-mobile-sheet.tsx` — bottom sheet mobile com estados `collapsed | peek | expanded`

### Modify

- `web/package.json` — script de teste e dependência mínima do Vitest
- `web/src/app/(dashboard)/page.tsx` — ajustes finos do container do mapa para acomodar o novo layout
- `web/src/app/(dashboard)/dashboard-map.tsx` — estado da tela, derivação de lista, integração desktop/mobile e follow
- `web/src/components/map/tracking-map.tsx` — props de seleção, destaque visual e callbacks do mapa
- `web/src/components/map/vehicle-marker.tsx` — seleção via marker, destaque do marker selecionado e popup menos central
- `web/src/components/map/map-controller.tsx` — distinção entre seleção/follow/fit-all preservando o cancelamento por drag
- `web/src/app/globals.css` — pequenos ajustes de superfície/Leaflet popup se o visual precisar de alinhamento com o redesign

---

### Task 1: Add testable dashboard-map helpers

**Files:**
- Create: `web/vitest.config.ts`
- Create: `web/src/lib/map/dashboard-map-utils.ts`
- Create: `web/src/lib/map/dashboard-map-utils.test.ts`
- Modify: `web/package.json`

- [ ] **Step 1: Add a minimal Vitest setup to `web/package.json`**

Add a minimal script and dev dependency:

```json
{
  "scripts": {
    "test": "vitest run"
  },
  "devDependencies": {
    "vitest": "^3.2.4"
  }
}
```

Then install it:

Run: `cd web && npm install`
Expected: `vitest` added to `package-lock.json` without touching runtime deps.

- [ ] **Step 2: Create `web/vitest.config.ts`**

Use a minimal node-environment config because the first test target is a pure helper module:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: Write the failing helper tests**

Create `web/src/lib/map/dashboard-map-utils.test.ts` with focused scenarios for:

- status mapping;
- display label fallback;
- relative time formatting;
- text/status filtering.

Use fixed timestamps so the test is deterministic:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  filterDashboardVehicles,
  formatLastSignalRelative,
  getVehicleDisplayLabel,
  getVehicleOperationalStatus,
} from "./dashboard-map-utils";

describe("dashboard-map-utils", () => {
  it("classifies moving, stopped and offline vehicles", () => {
    const now = new Date("2026-04-04T15:00:00.000Z");
    vi.setSystemTime(now);

    expect(getVehicleOperationalStatus({ ignition: true, speed: 40, server_time: now.toISOString() })).toBe("moving");
    expect(getVehicleOperationalStatus({ ignition: true, speed: 0, server_time: now.toISOString() })).toBe("stopped");
    expect(getVehicleOperationalStatus({ ignition: false, speed: 0, server_time: "2026-04-04T13:00:00.000Z" })).toBe("offline");
  });
});
```

- [ ] **Step 4: Run the tests to confirm they fail**

Run: `cd web && npm test -- dashboard-map-utils`
Expected: FAIL because `dashboard-map-utils.ts` does not exist yet.

- [ ] **Step 5: Implement `dashboard-map-utils.ts`**

Export helpers that keep rule logic out of the React tree:

```ts
export type DashboardVehicleFilter = "all" | "moving" | "stopped" | "offline";

export function getVehicleDisplayLabel(position: VehiclePosition) {
  return position.vehicle_name || position.plate || position.device_id;
}

export function getVehicleOperationalStatus(position: Pick<VehiclePosition, "ignition" | "speed" | "server_time">) {
  const minutesAgo = (Date.now() - new Date(position.server_time).getTime()) / 60000;
  if (minutesAgo > 30) return "offline";
  if (position.ignition && position.speed > 2) return "moving";
  return "stopped";
}
```

Also implement:

- `formatLastSignalRelative()`
- `filterDashboardVehicles()`
- status label/color metadata reused by the list and follow bar

Keep the threshold logic identical to the current marker color rules.

- [ ] **Step 6: Run the helper tests and confirm they pass**

Run: `cd web && npm test -- dashboard-map-utils`
Expected: PASS with all helper scenarios green.

- [ ] **Step 7: Commit**

```bash
git add web/package.json web/package-lock.json web/vitest.config.ts web/src/lib/map/dashboard-map-utils.ts web/src/lib/map/dashboard-map-utils.test.ts
git commit -m "test(web): adiciona helpers testados para o mapa do dashboard"
```

---

### Task 2: Prepare shared map types and interaction primitives

**Files:**
- Create: `web/src/components/map/types.ts`
- Modify: `web/src/components/map/tracking-map.tsx`
- Modify: `web/src/components/map/vehicle-marker.tsx`
- Modify: `web/src/components/map/map-controller.tsx`
- Modify: `web/src/app/globals.css`

- [ ] **Step 1: Extract the repeated vehicle type to `web/src/components/map/types.ts`**

Create a shared file with:

```ts
export type VehiclePosition = {
  device_id: string;
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
  ignition: boolean;
  device_time: string;
  server_time: string;
  plate?: string;
  vehicle_name?: string;
  vehicle_model?: string;
};
```

Also export the UI-facing status union:

```ts
export type VehicleOperationalStatus = "moving" | "stopped" | "offline";
```

- [ ] **Step 2: Update `vehicle-marker.tsx` to support selection from the map**

Replace the local type definition with the shared one and add props:

```ts
selected?: boolean;
onSelect?: (deviceId: string) => void;
```

Behavior changes:

- clicking the marker selects the vehicle;
- clicking the follow CTA continues to work;
- selected marker gets a stronger visual treatment than non-selected ones.

Prefer a subtle visual change to the icon (ring/stroke/shadow) over a different shape.

- [ ] **Step 3: Update `tracking-map.tsx` to pass selection state through**

Add props:

```ts
selectedDeviceId: string | null;
onSelect: (deviceId: string) => void;
```

Pass `selected={pos.device_id === selectedDeviceId}` and `onSelect={onSelect}` to every marker.

- [ ] **Step 4: Update `map-controller.tsx` so drag only cancels follow**

Keep the existing `dragstart` behavior, but make sure the controller only clears `followedDeviceId`; it must not clear the selected vehicle managed by `dashboard-map.tsx`.

Document that split with a short comment above the drag effect:

```ts
// Drag exits follow mode, but selection stays in the dashboard state.
```

- [ ] **Step 5: Align the Leaflet popup look with the new dashboard surfaces**

If the existing inline popup styles clash with the new UI, add small global overrides in `web/src/app/globals.css` for:

- popup container background;
- border color;
- close button hover;
- content spacing.

Do not rewrite all Leaflet styles; only patch what the redesigned popup needs.

- [ ] **Step 6: Verify marker selection manually**

Run: `cd web && npm run dev`

Manual checks:

- clicking a marker triggers selection;
- selected marker is visually distinguishable;
- dragging the map still exits follow;
- the popup still opens and remains usable.

- [ ] **Step 7: Commit**

```bash
git add web/src/components/map/types.ts web/src/components/map/tracking-map.tsx web/src/components/map/vehicle-marker.tsx web/src/components/map/map-controller.tsx web/src/app/globals.css
git commit -m "feat(web): prepara selecao de veiculos no mapa"
```

---

### Task 3: Build the new map-side UI components

**Files:**
- Create: `web/src/components/map/dashboard-follow-bar.tsx`
- Create: `web/src/components/map/dashboard-vehicle-list-item.tsx`
- Create: `web/src/components/map/dashboard-vehicle-browser.tsx`
- Create: `web/src/components/map/dashboard-mobile-sheet.tsx`

- [ ] **Step 1: Build `dashboard-follow-bar.tsx`**

This component should render the compact follow state over the map with:

- display label;
- status badge;
- current speed with `tabular-nums`;
- action to stop following.

Suggested interface:

```ts
type DashboardFollowBarProps = {
  vehicle: VehiclePosition;
  status: VehicleOperationalStatus;
  onExitFollow: () => void;
};
```

- [ ] **Step 2: Build `dashboard-vehicle-list-item.tsx`**

This component should own the list row craft:

- primary row: name/plate;
- secondary row: status, speed, last signal;
- active state for selected vehicle;
- click target covering the full row.

Suggested prop shape:

```ts
type DashboardVehicleListItemProps = {
  vehicle: VehiclePosition;
  status: VehicleOperationalStatus;
  lastSignalLabel: string;
  selected: boolean;
  onSelect: () => void;
};
```

- [ ] **Step 3: Build `dashboard-vehicle-browser.tsx`**

This component should contain the shared content used both by the desktop rail and the mobile sheet:

- search input;
- filter chips/pills;
- count summary;
- scrollable list;
- empty/loading states.

It should receive derived props from `dashboard-map.tsx`, not fetch or compute business rules internally.

- [ ] **Step 4: Build `dashboard-mobile-sheet.tsx` with explicit snap states**

Do not use the generic `Sheet` for the main interaction because the spec requires three useful states, not just open/closed.

Use a controlled component:

```ts
export type DashboardMobileSheetState = "collapsed" | "peek" | "expanded";
```

Implement it as a fixed bottom container with CSS transitions and state-driven heights/transforms. The handle should be clickable and selection should be able to force the sheet back to `peek`.

- [ ] **Step 5: Run lint on the new components**

Run: `cd web && npm run lint -- src/components/map/dashboard-follow-bar.tsx src/components/map/dashboard-vehicle-list-item.tsx src/components/map/dashboard-vehicle-browser.tsx src/components/map/dashboard-mobile-sheet.tsx`
Expected: no ESLint errors.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/map/dashboard-follow-bar.tsx web/src/components/map/dashboard-vehicle-list-item.tsx web/src/components/map/dashboard-vehicle-browser.tsx web/src/components/map/dashboard-mobile-sheet.tsx
git commit -m "feat(web): adiciona componentes do novo painel do mapa"
```

---

### Task 4: Integrate the redesigned layout in `dashboard-map.tsx`

**Files:**
- Modify: `web/src/app/(dashboard)/dashboard-map.tsx`
- Modify: `web/src/app/(dashboard)/page.tsx`
- Modify: `web/src/components/map/tracking-map.tsx`

- [ ] **Step 1: Refactor dashboard state around selection, filters and responsive chrome**

In `dashboard-map.tsx`, replace the current minimal state with:

```ts
const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
const [followedDeviceId, setFollowedDeviceId] = useState<string | null>(null);
const [searchQuery, setSearchQuery] = useState("");
const [statusFilter, setStatusFilter] = useState<DashboardVehicleFilter>("all");
const [desktopRailOpen, setDesktopRailOpen] = useState(true);
const [mobileSheetState, setMobileSheetState] =
  useState<DashboardMobileSheetState>("peek");
```

Keep `fitAllTrigger` as the explicit viewport reset mechanism.

- [ ] **Step 2: Derive filtered vehicles and selected vehicle via helpers**

Use the helper module for all derived data:

```ts
const filteredPositions = filterDashboardVehicles(positions, {
  query: searchQuery,
  status: statusFilter,
});

const selectedVehicle =
  positions.find((position) => position.device_id === selectedDeviceId) ?? null;
```

Important: selection lookup should use `positions`, not `filteredPositions`, so the selected vehicle survives temporary filter mismatches.

- [ ] **Step 3: Wire list selection and marker selection into the same callback**

Add a single handler:

```ts
const handleSelectVehicle = useCallback((deviceId: string) => {
  setSelectedDeviceId(deviceId);
  setFollowedDeviceId(deviceId);
  setMobileSheetState("peek");
}, []);
```

Pass it to:

- desktop rail list items;
- mobile sheet list items;
- `TrackingMap` markers.

- [ ] **Step 4: Replace the old overlays with the new UI**

Remove the current:

- floating follow pill;
- drag hint chip;
- simple vehicle count badge.

Replace them with:

- `DashboardFollowBar` when `followedDeviceId` exists;
- desktop rail on `lg+`;
- `DashboardMobileSheet` below `lg`;
- refined `Ver todos` and count overlays that match the new surface treatment.

- [ ] **Step 5: Adjust the page container only if the new rail/sheet needs it**

Update `web/src/app/(dashboard)/page.tsx` only as much as needed to support the redesigned composition, for example:

```tsx
return (
  <div className="h-full -m-4 -mb-24 lg:-m-6 lg:-mb-6">
    <DashboardMap initialPositions={positions} />
  </div>
);
```

If the existing wrapper already works, leave it alone. Do not invent a new page shell.

- [ ] **Step 6: Run manual responsive verification**

Run: `cd web && npm run dev`

Check:

- desktop with rail open/closed;
- search and filter interactions;
- select from list -> follow on map;
- select from marker -> highlight row in list;
- mobile collapsed/peek/expanded sheet states;
- selecting from mobile list returns sheet to `peek`.

- [ ] **Step 7: Commit**

```bash
git add web/src/app/\(dashboard\)/dashboard-map.tsx web/src/app/\(dashboard\)/page.tsx web/src/components/map/tracking-map.tsx
git commit -m "feat(web): integra redesign da tela de mapa"
```

---

### Task 5: Final polish and release verification

**Files:**
- Modify: any files from Tasks 1-4 only if verification exposes a concrete defect

- [ ] **Step 1: Run the automated verification suite**

Run:

```bash
cd web && npm test
cd web && npm run lint
cd web && npm run build
```

Expected:

- Vitest green
- ESLint clean
- Next.js production build succeeds

- [ ] **Step 2: Verify the spec acceptance criteria manually**

Manual checklist:

- find and follow a vehicle without opening the popup;
- selected vehicle stays selected after drag cancels follow;
- `Ver todos` restores fleet context;
- desktop rail feels secondary to the map, not the opposite;
- mobile bottom sheet keeps the map visible by default.

- [ ] **Step 3: Fix only defects found in verification**

If verification fails, patch only the specific problem and rerun the smallest relevant command first:

- helper bug -> `cd web && npm test -- dashboard-map-utils`
- lint bug -> `cd web && npm run lint`
- build bug -> `cd web && npm run build`
- interaction bug -> `cd web && npm run dev`

- [ ] **Step 4: Create the final implementation commit**

```bash
git add web/package.json web/package-lock.json web/vitest.config.ts web/src/lib/map/dashboard-map-utils.ts web/src/lib/map/dashboard-map-utils.test.ts web/src/components/map/types.ts web/src/components/map/dashboard-follow-bar.tsx web/src/components/map/dashboard-vehicle-list-item.tsx web/src/components/map/dashboard-vehicle-browser.tsx web/src/components/map/dashboard-mobile-sheet.tsx web/src/app/\(dashboard\)/dashboard-map.tsx web/src/app/\(dashboard\)/page.tsx web/src/components/map/tracking-map.tsx web/src/components/map/vehicle-marker.tsx web/src/components/map/map-controller.tsx web/src/app/globals.css
git commit -m "feat(web): redesenha tela de mapa do dashboard"
```
