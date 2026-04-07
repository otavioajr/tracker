# Per-Vehicle Realtime Trail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um toggle por veículo no painel de despacho para desenhar e limpar um rastro realtime no mapa sem criar carga nova no backend.

**Architecture:** O rastro será efêmero e 100% cliente. `DashboardMap` passa a controlar os veículos com rastro ativo, o cursor de cada trilha e os pontos acumulados; `TrackingMap` só recebe as trilhas prontas e renderiza uma `Polyline` por veículo. O card do veículo deixa de ser um único `button` para permitir um toggle acessível separado da ação principal de seleção.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, Testing Library, Leaflet/react-leaflet

---

## File Structure

- Modify: `web/src/components/map/types.ts`
  Responsabilidade: declarar os tipos compartilhados do rastro (`DashboardTrailPoint`, `DashboardVehicleTrail`).
- Create: `web/src/lib/map/dashboard-trails.ts`
  Responsabilidade: lógica pura para ativar, limpar e acumular pontos de trilha com limite por veículo.
- Create: `web/src/lib/map/dashboard-trails.test.ts`
  Responsabilidade: testar as regras de negócio da trilha sem depender de React.
- Modify: `web/src/components/map/dashboard-vehicle-list-item.tsx`
  Responsabilidade: separar a área clicável de seleção do toggle `Mostrar rastro`.
- Modify: `web/src/components/map/dashboard-vehicle-browser.tsx`
  Responsabilidade: propagar estado e callback do toggle para cada card.
- Modify: `web/src/components/map/dashboard-vehicle-browser.test.tsx`
  Responsabilidade: cobrir renderização e interação do toggle sem regressão de seleção.
- Modify: `web/src/app/(dashboard)/dashboard-map.tsx`
  Responsabilidade: integrar os helpers de trilha ao estado do mapa e passar as trilhas ativas ao `TrackingMap`.
- Modify: `web/src/app/(dashboard)/dashboard-map.test.tsx`
  Responsabilidade: validar o wiring entre lista, estado do mapa e props enviadas ao `TrackingMap`.
- Modify: `web/src/components/map/tracking-map.tsx`
  Responsabilidade: receber as trilhas ativas e renderizar a camada de linhas.
- Create: `web/src/components/map/vehicle-trail-layer.tsx`
  Responsabilidade: encapsular a `Polyline` de cada trilha para manter `TrackingMap` legível.
- Create: `web/src/components/map/vehicle-trail-layer.test.tsx`
  Responsabilidade: garantir que a camada monta a linha com os pontos e estilo esperados.

### Constantes a introduzir

- `const DASHBOARD_TRAIL_POINT_LIMIT = 300;` em `web/src/lib/map/dashboard-trails.ts`
- `const DASHBOARD_TRAIL_COLOR = "#13d392";` em `web/src/components/map/vehicle-trail-layer.tsx`

### Estado recomendado para o mapa

```ts
type DashboardTrailState = {
  activeTrailDeviceIds: Set<string>;
  trailCursors: Record<string, string>;
  trails: Record<string, DashboardTrailPoint[]>;
};
```

### Tipos a introduzir

```ts
export type DashboardTrailPoint = {
  latitude: number;
  longitude: number;
  server_time: string;
};

export type DashboardVehicleTrail = {
  deviceId: string;
  points: DashboardTrailPoint[];
};
```

## Task 1: UI do toggle no card do veículo

**Files:**
- Modify: `web/src/components/map/types.ts`
- Modify: `web/src/components/map/dashboard-vehicle-list-item.tsx`
- Modify: `web/src/components/map/dashboard-vehicle-browser.tsx`
- Test: `web/src/components/map/dashboard-vehicle-browser.test.tsx`

- [ ] **Step 1: Write the failing browser test for the new toggle**

```tsx
it("renders the trail toggle per vehicle and does not select on toggle click", () => {
  const handleSelectVehicle = vi.fn();
  const handleToggleTrail = vi.fn();

  render(
    <DashboardVehicleBrowser
      vehicles={vehicles}
      selectedDeviceId={null}
      query=""
      statusFilter="all"
      summaryLabel="2 veículos visíveis"
      activeTrailDeviceIds={new Set(["van-2"])}
      onQueryChange={vi.fn()}
      onStatusFilterChange={vi.fn()}
      onSelectVehicle={handleSelectVehicle}
      onToggleVehicleTrail={handleToggleTrail}
    />
  );

  const inactiveToggle = screen.getByRole("switch", {
    name: /mostrar rastro do Truck 01/i,
  });
  const activeToggle = screen.getByRole("switch", {
    name: /mostrar rastro do Van 02/i,
  });

  expect(inactiveToggle).toHaveAttribute("aria-checked", "false");
  expect(activeToggle).toHaveAttribute("aria-checked", "true");

  fireEvent.click(inactiveToggle);

  expect(handleToggleTrail).toHaveBeenCalledWith("truck-1");
  expect(handleSelectVehicle).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/otavioajr/Documents/Projetos/tracker/web && npm run test -- src/components/map/dashboard-vehicle-browser.test.tsx`

Expected: FAIL because `DashboardVehicleBrowser` does not accept `activeTrailDeviceIds`/`onToggleVehicleTrail` and no `switch` is rendered.

- [ ] **Step 3: Add the shared trail types**

```ts
export type DashboardTrailPoint = {
  latitude: number;
  longitude: number;
  server_time: string;
};

export type DashboardVehicleTrail = {
  deviceId: string;
  points: DashboardTrailPoint[];
};
```

- [ ] **Step 4: Refactor the list item markup so selection and toggle are sibling controls**

```tsx
type DashboardVehicleListItemProps = {
  vehicle: DashboardVehicleListEntry;
  selected: boolean;
  trailActive: boolean;
  onSelect: () => void;
  onToggleTrail: () => void;
};

return (
  <div
    data-selected={selected}
    className={cn(
      "rounded-2xl border px-3 py-3 transition-all",
      selected
        ? "border-primary/30 bg-primary/10 text-foreground shadow-[0_20px_35px_-28px_rgba(19,211,146,0.6)]"
        : "border-white/8 bg-black/15 text-foreground hover:border-white/14 hover:bg-white/4"
    )}
  >
    <button
      type="button"
      aria-label={`Selecionar ${vehicle.displayLabel}`}
      onClick={onSelect}
      className="flex w-full flex-col gap-2 text-left"
    >
      {/* conteúdo atual do cabeçalho + telemetria */}
    </button>

    <div className="mt-3 border-t border-white/8 pt-3">
      <button
        type="button"
        role="switch"
        aria-checked={trailActive}
        aria-label={`Mostrar rastro do ${vehicle.displayLabel}`}
        onClick={onToggleTrail}
        className="flex w-full items-center justify-between rounded-2xl border border-white/8 bg-white/4 px-3 py-2 text-left"
      >
        <span>
          <span className="block text-xs font-semibold text-foreground">
            Mostrar rastro
          </span>
          <span className="block text-[11px] text-muted-foreground">
            Acumula apenas novas posições enquanto estiver ativo.
          </span>
        </span>
        <span
          aria-hidden="true"
          className={cn(
            "relative h-6 w-10 rounded-full transition-colors",
            trailActive ? "bg-primary" : "bg-white/12"
          )}
        />
      </button>
    </div>
  </div>
);
```

- [ ] **Step 5: Thread the new props through the browser**

```tsx
type DashboardVehicleBrowserProps = {
  vehicles: DashboardVehicleListEntry[];
  selectedDeviceId: string | null;
  query: string;
  statusFilter: DashboardVehicleFilter;
  summaryLabel: string;
  activeTrailDeviceIds: Set<string>;
  onQueryChange: (value: string) => void;
  onStatusFilterChange: (filter: DashboardVehicleFilter) => void;
  onSelectVehicle: (deviceId: string) => void;
  onToggleVehicleTrail: (deviceId: string) => void;
};

<DashboardVehicleListItem
  key={vehicle.device_id}
  vehicle={vehicle}
  selected={vehicle.device_id === selectedDeviceId}
  trailActive={activeTrailDeviceIds.has(vehicle.device_id)}
  onSelect={() => onSelectVehicle(vehicle.device_id)}
  onToggleTrail={() => onToggleVehicleTrail(vehicle.device_id)}
/>;
```

- [ ] **Step 6: Run the browser test to verify it passes**

Run: `cd /Users/otavioajr/Documents/Projetos/tracker/web && npm run test -- src/components/map/dashboard-vehicle-browser.test.tsx`

Expected: PASS

- [ ] **Step 7: Commit the UI contract**

```bash
cd /Users/otavioajr/Documents/Projetos/tracker
git add web/src/components/map/types.ts \
  web/src/components/map/dashboard-vehicle-list-item.tsx \
  web/src/components/map/dashboard-vehicle-browser.tsx \
  web/src/components/map/dashboard-vehicle-browser.test.tsx
git commit -m "feat: adiciona toggle de rastro na lista do mapa"
```

## Task 2: Estado e regras de acumulo do rastro

**Files:**
- Create: `web/src/lib/map/dashboard-trails.ts`
- Test: `web/src/lib/map/dashboard-trails.test.ts`
- Modify: `web/src/app/(dashboard)/dashboard-map.tsx`
- Test: `web/src/app/(dashboard)/dashboard-map.test.tsx`

- [ ] **Step 1: Write failing tests for the pure trail helpers**

```ts
import { describe, expect, it } from "vitest";

import {
  activateTrailForVehicle,
  clearTrailForVehicle,
  ingestRealtimeTrailPositions,
} from "./dashboard-trails";

describe("dashboard-trails", () => {
  it("starts empty and stores the current cursor when a trail is activated", () => {
    const result = activateTrailForVehicle({
      deviceId: "truck-1",
      currentServerTime: "2026-04-07T12:00:00.000Z",
      activeTrailDeviceIds: new Set<string>(),
      trailCursors: {},
      trails: {},
    });

    expect(result.activeTrailDeviceIds.has("truck-1")).toBe(true);
    expect(result.trails["truck-1"]).toEqual([]);
    expect(result.trailCursors["truck-1"]).toBe("2026-04-07T12:00:00.000Z");
  });

  it("appends only new realtime points for active vehicles and trims by limit", () => {
    const result = ingestRealtimeTrailPositions({
      positions: [
        {
          device_id: "truck-1",
          latitude: -23.551,
          longitude: -46.631,
          speed: 42,
          heading: 0,
          ignition: true,
          device_time: "2026-04-07T12:01:00.000Z",
          server_time: "2026-04-07T12:01:00.000Z",
        },
      ],
      activeTrailDeviceIds: new Set(["truck-1"]),
      trailCursors: { "truck-1": "2026-04-07T12:00:00.000Z" },
      trails: {
        "truck-1": [
          { latitude: -23.55, longitude: -46.63, server_time: "2026-04-07T11:59:00.000Z" },
        ],
      },
      pointLimit: 1,
    });

    expect(result.trails["truck-1"]).toEqual([
      { latitude: -23.551, longitude: -46.631, server_time: "2026-04-07T12:01:00.000Z" },
    ]);
    expect(result.trailCursors["truck-1"]).toBe("2026-04-07T12:01:00.000Z");
  });

  it("clears only the requested vehicle when a trail is disabled", () => {
    const result = clearTrailForVehicle({
      deviceId: "truck-1",
      activeTrailDeviceIds: new Set(["truck-1", "van-2"]),
      trailCursors: {
        "truck-1": "2026-04-07T12:00:00.000Z",
        "van-2": "2026-04-07T12:00:00.000Z",
      },
      trails: {
        "truck-1": [{ latitude: -23.55, longitude: -46.63, server_time: "2026-04-07T12:00:00.000Z" }],
        "van-2": [{ latitude: -23.56, longitude: -46.64, server_time: "2026-04-07T12:00:00.000Z" }],
      },
    });

    expect(result.activeTrailDeviceIds.has("truck-1")).toBe(false);
    expect(result.trails["truck-1"]).toBeUndefined();
    expect(result.trails["van-2"]).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the helper tests to verify they fail**

Run: `cd /Users/otavioajr/Documents/Projetos/tracker/web && npm run test -- src/lib/map/dashboard-trails.test.ts`

Expected: FAIL because `dashboard-trails.ts` does not exist.

- [ ] **Step 3: Implement the pure helper module**

```ts
import type { VehiclePosition } from "@/components/map/types";
import type { DashboardTrailPoint } from "@/components/map/types";

export const DASHBOARD_TRAIL_POINT_LIMIT = 300;

type TrailState = {
  activeTrailDeviceIds: Set<string>;
  trailCursors: Record<string, string>;
  trails: Record<string, DashboardTrailPoint[]>;
};

export function activateTrailForVehicle({
  deviceId,
  currentServerTime,
  activeTrailDeviceIds,
  trailCursors,
  trails,
}: {
  deviceId: string;
  currentServerTime?: string;
} & TrailState): TrailState {
  const nextActive = new Set(activeTrailDeviceIds);
  nextActive.add(deviceId);

  return {
    activeTrailDeviceIds: nextActive,
    trailCursors: {
      ...trailCursors,
      [deviceId]: currentServerTime ?? "",
    },
    trails: {
      ...trails,
      [deviceId]: [],
    },
  };
}

export function clearTrailForVehicle({
  deviceId,
  activeTrailDeviceIds,
  trailCursors,
  trails,
}: {
  deviceId: string;
} & TrailState): TrailState {
  const nextActive = new Set(activeTrailDeviceIds);
  nextActive.delete(deviceId);

  const { [deviceId]: _removedCursor, ...nextCursors } = trailCursors;
  const { [deviceId]: _removedTrail, ...nextTrails } = trails;

  return {
    activeTrailDeviceIds: nextActive,
    trailCursors: nextCursors,
    trails: nextTrails,
  };
}

export function ingestRealtimeTrailPositions({
  positions,
  activeTrailDeviceIds,
  trailCursors,
  trails,
  pointLimit = DASHBOARD_TRAIL_POINT_LIMIT,
}: {
  positions: VehiclePosition[];
  pointLimit?: number;
} & TrailState): Pick<TrailState, "trailCursors" | "trails"> {
  const nextCursors = { ...trailCursors };
  const nextTrails = { ...trails };

  for (const position of positions) {
    if (!activeTrailDeviceIds.has(position.device_id)) continue;

    const currentCursor = nextCursors[position.device_id] ?? "";
    if (position.server_time <= currentCursor) continue;

    const nextPoint: DashboardTrailPoint = {
      latitude: position.latitude,
      longitude: position.longitude,
      server_time: position.server_time,
    };

    const previousTrail = nextTrails[position.device_id] ?? [];
    nextTrails[position.device_id] = [...previousTrail, nextPoint].slice(-pointLimit);
    nextCursors[position.device_id] = position.server_time;
  }

  return {
    trailCursors: nextCursors,
    trails: nextTrails,
  };
}
```

- [ ] **Step 4: Run the helper tests to verify they pass**

Run: `cd /Users/otavioajr/Documents/Projetos/tracker/web && npm run test -- src/lib/map/dashboard-trails.test.ts`

Expected: PASS

- [ ] **Step 5: Write the failing dashboard wiring test**

```tsx
it("passes active trails to the map and clears only the toggled vehicle", async () => {
  render(<DashboardMap initialPositions={positions} />);

  fireEvent.click(
    (await screen.findAllByRole("switch", {
      name: /mostrar rastro do Truck 01/i,
    }))[0]
  );

  expect(await screen.findByText("trails:truck-1")).toBeTruthy();

  fireEvent.click(
    (await screen.findAllByRole("switch", {
      name: /mostrar rastro do Truck 01/i,
    }))[0]
  );

  expect(await screen.findByText("trails:none")).toBeTruthy();
});
```

Add this to the `TrackingMapStub` in the same test file:

```tsx
function TrackingMapStub({
  followedDeviceId,
  selectedDeviceId,
  trails,
  onCancelFollow,
  onSelect,
}: {
  followedDeviceId: string | null;
  selectedDeviceId: string | null;
  trails?: { deviceId: string; points: { latitude: number; longitude: number; server_time: string }[] }[];
  onCancelFollow: () => void;
  onSelect?: (deviceId: string) => void;
}) {
  return (
    <div data-testid="tracking-map-stub">
      <span>followed:{followedDeviceId ?? "none"}</span>
      <span>selected:{selectedDeviceId ?? "none"}</span>
      <span>
        trails:{trails?.map((trail) => trail.deviceId).join(",") || "none"}
      </span>
      <button type="button" onClick={() => onSelect?.("van-2")}>
        Marker Van 02
      </button>
      <button type="button" onClick={onCancelFollow}>
        Cancel follow
      </button>
    </div>
  );
}
```

- [ ] **Step 6: Run the dashboard test to verify it fails**

Run: `cd /Users/otavioajr/Documents/Projetos/tracker/web && npm run test -- src/app/'(dashboard)'/dashboard-map.test.tsx`

Expected: FAIL because `DashboardMap` does not manage trail state or pass `trails` to `TrackingMap`.

- [ ] **Step 7: Integrate the helper module into `DashboardMap`**

```tsx
const [trailState, setTrailState] = useState<DashboardTrailState>(() => ({
  activeTrailDeviceIds: new Set(),
  trailCursors: {},
  trails: {},
}));

const handleToggleVehicleTrail = useCallback((deviceId: string) => {
  const currentPosition = positions.find((position) => position.device_id === deviceId);

  setTrailState((prev) => {
    if (prev.activeTrailDeviceIds.has(deviceId)) {
      return clearTrailForVehicle({
        deviceId,
        activeTrailDeviceIds: prev.activeTrailDeviceIds,
        trailCursors: prev.trailCursors,
        trails: prev.trails,
      });
    }

    return activateTrailForVehicle({
      deviceId,
      currentServerTime: currentPosition?.server_time,
      activeTrailDeviceIds: prev.activeTrailDeviceIds,
      trailCursors: prev.trailCursors,
      trails: prev.trails,
    });
  });
}, [positions]);

useEffect(() => {
  setTrailState((prev) => {
    const next = ingestRealtimeTrailPositions({
      positions,
      activeTrailDeviceIds: prev.activeTrailDeviceIds,
      trailCursors: prev.trailCursors,
      trails: prev.trails,
    });

    return {
      ...prev,
      trailCursors: next.trailCursors,
      trails: next.trails,
    };
  });
}, [positions]);

const trails = Array.from(trailState.activeTrailDeviceIds).map((deviceId) => ({
  deviceId,
  points: trailState.trails[deviceId] ?? [],
}));
```

Pass the new props to both browser instances and to `TrackingMap`:

```tsx
<TrackingMap
  positions={positions}
  trails={trails}
  className="h-full w-full"
  selectedDeviceId={selectedDeviceId}
  followedDeviceId={followedDeviceId}
  onSelect={handleSelectVehicle}
  onFollow={handleSelectVehicle}
  onCancelFollow={handleCancelFollow}
  fitAllTrigger={fitAllTrigger}
/>
```

- [ ] **Step 8: Run the focused dashboard tests to verify they pass**

Run: `cd /Users/otavioajr/Documents/Projetos/tracker/web && npm run test -- src/app/'(dashboard)'/dashboard-map.test.tsx src/lib/map/dashboard-trails.test.ts`

Expected: PASS

- [ ] **Step 9: Commit the state layer**

```bash
cd /Users/otavioajr/Documents/Projetos/tracker
git add web/src/lib/map/dashboard-trails.ts \
  web/src/lib/map/dashboard-trails.test.ts \
  web/src/app/'(dashboard)'/dashboard-map.tsx \
  web/src/app/'(dashboard)'/dashboard-map.test.tsx
git commit -m "feat: controla rastro em tempo real no dashboard"
```

## Task 3: Renderizacao das trilhas no mapa

**Files:**
- Modify: `web/src/components/map/tracking-map.tsx`
- Create: `web/src/components/map/vehicle-trail-layer.tsx`
- Test: `web/src/components/map/vehicle-trail-layer.test.tsx`

- [ ] **Step 1: Write the failing trail layer test**

```tsx
// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const polylineSpy = vi.fn(() => null);

vi.mock("react-leaflet", () => ({
  Polyline: (props: unknown) => {
    polylineSpy(props);
    return null;
  },
}));

import { VehicleTrailLayer } from "./vehicle-trail-layer";

describe("VehicleTrailLayer", () => {
  it("renders a polyline with the trail coordinates and shared style", () => {
    render(
      <VehicleTrailLayer
        trail={{
          deviceId: "truck-1",
          points: [
            { latitude: -23.55, longitude: -46.63, server_time: "2026-04-07T12:00:00.000Z" },
            { latitude: -23.551, longitude: -46.631, server_time: "2026-04-07T12:01:00.000Z" },
          ],
        }}
      />
    );

    expect(polylineSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        positions: [
          [-23.55, -46.63],
          [-23.551, -46.631],
        ],
        pathOptions: expect.objectContaining({
          color: "#13d392",
          weight: 4,
          opacity: 0.8,
        }),
      })
    );
  });
});
```

- [ ] **Step 2: Run the trail layer test to verify it fails**

Run: `cd /Users/otavioajr/Documents/Projetos/tracker/web && npm run test -- src/components/map/vehicle-trail-layer.test.tsx`

Expected: FAIL because `vehicle-trail-layer.tsx` does not exist.

- [ ] **Step 3: Implement the trail layer component**

```tsx
"use client";

import { Polyline } from "react-leaflet";

import type { DashboardVehicleTrail } from "./types";

export const DASHBOARD_TRAIL_COLOR = "#13d392";

type VehicleTrailLayerProps = {
  trail: DashboardVehicleTrail;
};

export function VehicleTrailLayer({ trail }: VehicleTrailLayerProps) {
  if (trail.points.length < 2) {
    return null;
  }

  return (
    <Polyline
      positions={trail.points.map((point) => [point.latitude, point.longitude] as [number, number])}
      pathOptions={{
        color: DASHBOARD_TRAIL_COLOR,
        weight: 4,
        opacity: 0.8,
      }}
    />
  );
}
```

- [ ] **Step 4: Wire the new layer into `TrackingMap`**

```tsx
const VehicleTrailLayerDynamic = dynamic(
  () => import("./vehicle-trail-layer").then((m) => m.VehicleTrailLayer),
  { ssr: false }
);

type TrackingMapProps = {
  positions: VehiclePosition[];
  trails: DashboardVehicleTrail[];
  className?: string;
  selectedDeviceId: string | null;
  followedDeviceId: string | null;
  onSelect: (deviceId: string) => void;
  onFollow: (deviceId: string) => void;
  onCancelFollow: () => void;
  fitAllTrigger: number;
};

{trails.map((trail) => (
  <VehicleTrailLayerDynamic key={trail.deviceId} trail={trail} />
))}
```

- [ ] **Step 5: Run the trail layer test to verify it passes**

Run: `cd /Users/otavioajr/Documents/Projetos/tracker/web && npm run test -- src/components/map/vehicle-trail-layer.test.tsx`

Expected: PASS

- [ ] **Step 6: Commit the map rendering**

```bash
cd /Users/otavioajr/Documents/Projetos/tracker
git add web/src/components/map/tracking-map.tsx \
  web/src/components/map/vehicle-trail-layer.tsx \
  web/src/components/map/vehicle-trail-layer.test.tsx
git commit -m "feat: renderiza rastro dos veiculos no mapa"
```

## Task 4: Regressao focada e verificacao manual

**Files:**
- No code changes required unless a regression is found

- [ ] **Step 1: Run the focused automated suite**

Run:

```bash
cd /Users/otavioajr/Documents/Projetos/tracker/web
npm run test -- \
  src/components/map/dashboard-vehicle-browser.test.tsx \
  src/lib/map/dashboard-trails.test.ts \
  src/app/'(dashboard)'/dashboard-map.test.tsx \
  src/components/map/vehicle-trail-layer.test.tsx \
  src/components/map/map-controller.test.ts
```

Expected: PASS

- [ ] **Step 2: Run lint for the touched area**

Run: `cd /Users/otavioajr/Documents/Projetos/tracker/web && npm run lint -- src/components/map/dashboard-vehicle-browser.tsx src/components/map/dashboard-vehicle-list-item.tsx src/components/map/tracking-map.tsx src/components/map/vehicle-trail-layer.tsx src/app/'(dashboard)'/dashboard-map.tsx src/lib/map/dashboard-trails.ts`

Expected: PASS

- [ ] **Step 3: Manually verify the map flow**

Run:

```bash
cd /Users/otavioajr/Documents/Projetos/tracker
make web-dev
```

Checklist:

- ligar `Mostrar rastro` em um veículo parado não desenha linha até chegar uma nova posição;
- ligar `Mostrar rastro` em um veículo em movimento começa vazio e só cresce com novos updates;
- selecionar outro veículo não apaga a trilha já ativa;
- desligar o toggle remove a linha imediatamente;
- dois veículos com toggle ligado exibem duas trilhas ao mesmo tempo;
- `Ver todos`, seleção e follow continuam funcionando.

- [ ] **Step 4: If any manual-verification fixes were needed, commit them**

```bash
cd /Users/otavioajr/Documents/Projetos/tracker
git status --short
git add <only-files-adjusted-during-verification>
git commit -m "fix: ajusta fluxo do rastro em tempo real"
```
