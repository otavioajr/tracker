# Dashboard Map Rotation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar rotação efêmera ao mapa principal do dashboard com `Ctrl + drag` no desktop, dois dedos no touch, botão "Norte" condicional, preservação do follow durante rotação e rollback via feature flag.

**Architecture:** Mantém Leaflet 1.9 + react-leaflet 5 e adiciona um `MapRotationController` irmão do `MapController` atual, atrás da flag `NEXT_PUBLIC_ENABLE_MAP_ROTATION`. Um ref compartilhado (`rotationInteractionRef`) sinaliza "gesture de rotação ativa" para o `MapController` não cancelar follow. Bearing é puramente local — nada persiste.

**Tech Stack:** Next.js App Router 16, React 19, Leaflet 1.9, react-leaflet 5, `leaflet-rotate` plugin, Vitest + Testing Library, npm.

---

## File Structure

### Modified files

- `web/package.json`
  Purpose: registra dependência `leaflet-rotate`.
- `web/package-lock.json`
  Purpose: lock da dependência.
- `web/.env.local.example`
  Purpose: documenta a flag `NEXT_PUBLIC_ENABLE_MAP_ROTATION` desligada por padrão.
- `web/src/app/(dashboard)/dashboard-map.tsx`
  Purpose: lê a flag, mantém `mapBearing` e `resetRotationTrigger`, renderiza o botão "Norte" condicional, propaga props para `TrackingMap`.
- `web/src/app/(dashboard)/dashboard-map.test.tsx`
  Purpose: cobre flag off/on e o fluxo do botão "Norte" via `TrackingMapStub` com props de rotação.
- `web/src/components/map/tracking-map.tsx`
  Purpose: aceita props de rotação, cria `rotationInteractionRef`, monta `MapRotationController` como irmão do `MapController` e passa o ref para ambos.
- `web/src/components/map/map-controller.tsx`
  Purpose: aceita `interactionStateRef`, consulta `isRotating` no handler de `dragstart`, preserva bearing em `fitBounds`.
- `web/src/components/map/map-controller.test.ts`
  Purpose: cobre a guarda `shouldCancelFollowOnMapDrag`.

### New files

- `web/src/lib/map/map-rotation-feature.ts`
  Purpose: parser puro da env var `NEXT_PUBLIC_ENABLE_MAP_ROTATION`.
- `web/src/lib/map/map-rotation-feature.test.ts`
  Purpose: cobre truthy/falsey do parser.
- `web/src/components/map/map-rotation-controller.tsx`
  Purpose: integra `leaflet-rotate`, expõe `normalizeMapBearing`, `supportsMapRotation`, `bindRotationHandlers` e o componente `MapRotationController`.
- `web/src/components/map/map-rotation-controller.test.ts`
  Purpose: cobre `normalizeMapBearing`, `supportsMapRotation` e `bindRotationHandlers` com mapa stub.

---

## Task 1: Validate plugin, install, add feature flag helper

**Files:**
- Modify: `web/package.json`
- Modify: `web/package-lock.json`
- Modify: `web/.env.local.example`
- Create: `web/src/lib/map/map-rotation-feature.ts`
- Create: `web/src/lib/map/map-rotation-feature.test.ts`

- [ ] **Step 1: Validate plugin metadata before installing**

Rodar a partir de `web/`:

```bash
npm view leaflet-rotate name version license repository.url
```

Esperado: saída contém nome do pacote, uma versão real, uma licença permissiva (MIT/BSD/Apache) e URL do repositório acessível. Se a licença for incompatível (GPL, proprietária) ou o pacote estiver claramente abandonado, **pare e volte à spec** — não tente rotação via CSS.

- [ ] **Step 2: Install the dependency**

Rodar a partir de `web/`:

```bash
npm install leaflet-rotate --save
```

Esperado: `package.json` e `package-lock.json` atualizados com `leaflet-rotate` em `dependencies`.

- [ ] **Step 3: Document the feature flag in the env example**

Editar `web/.env.local.example` adicionando ao final:

```dotenv

# Map rotation (0 = disabled, 1 = enabled)
NEXT_PUBLIC_ENABLE_MAP_ROTATION=0
```

Esperado: linha de comentário + linha com o valor default `0`.

- [ ] **Step 4: Write the failing feature-flag test**

Criar `web/src/lib/map/map-rotation-feature.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { isDashboardMapRotationEnabled } from "./map-rotation-feature";

describe("isDashboardMapRotationEnabled", () => {
  it.each([undefined, "", "0", "false", "FALSE", "off", "no"])(
    "returns false for %p",
    (value) => {
      expect(isDashboardMapRotationEnabled(value)).toBe(false);
    }
  );

  it.each(["1", "true", "TRUE", "on", "yes", "YES"])(
    "returns true for %p",
    (value) => {
      expect(isDashboardMapRotationEnabled(value)).toBe(true);
    }
  );
});
```

- [ ] **Step 5: Run the feature-flag test to verify it fails**

Rodar a partir de `web/`:

```bash
npm test -- src/lib/map/map-rotation-feature.test.ts
```

Esperado: FAIL com "Cannot find module './map-rotation-feature'".

- [ ] **Step 6: Implement the feature-flag helper**

Criar `web/src/lib/map/map-rotation-feature.ts`:

```ts
const ENABLED_VALUES = new Set(["1", "true", "on", "yes"]);

export function isDashboardMapRotationEnabled(
  rawValue: string | undefined = process.env.NEXT_PUBLIC_ENABLE_MAP_ROTATION
) {
  return ENABLED_VALUES.has((rawValue ?? "").trim().toLowerCase());
}
```

- [ ] **Step 7: Run the feature-flag test to verify it passes**

Rodar a partir de `web/`:

```bash
npm test -- src/lib/map/map-rotation-feature.test.ts
```

Esperado: PASS em todos os casos truthy/falsey.

- [ ] **Step 8: Commit the dependency and flag groundwork**

Rodar a partir da raiz do repositório:

```bash
git add web/package.json web/package-lock.json web/.env.local.example \
  web/src/lib/map/map-rotation-feature.ts \
  web/src/lib/map/map-rotation-feature.test.ts
git commit -m "chore: adiciona dependencia e flag da rotacao do mapa"
```

---

## Task 2: Build the rotation controller in isolation (TDD)

**Files:**
- Create: `web/src/components/map/map-rotation-controller.tsx`
- Create: `web/src/components/map/map-rotation-controller.test.ts`

- [ ] **Step 1: Write the failing controller helper tests**

Criar `web/src/components/map/map-rotation-controller.test.ts`:

```ts
// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import {
  bindRotationHandlers,
  normalizeMapBearing,
  supportsMapRotation,
} from "./map-rotation-controller";

function createRotationMapStub() {
  const handlers = new Map<string, Set<() => void>>();
  const map = {
    dragRotate: { enable: vi.fn(), disable: vi.fn() },
    touchRotate: { enable: vi.fn(), disable: vi.fn() },
    getBearing: vi.fn(() => -90),
    setBearing: vi.fn(),
    on: vi.fn((event: string, handler: () => void) => {
      const current = handlers.get(event) ?? new Set<() => void>();
      current.add(handler);
      handlers.set(event, current);
      return map;
    }),
    off: vi.fn((event: string, handler: () => void) => {
      handlers.get(event)?.delete(handler);
      return map;
    }),
    emit(event: string) {
      handlers.get(event)?.forEach((handler) => handler());
    },
  };

  return map;
}

describe("map-rotation-controller helpers", () => {
  it("normalizes negative and overflow bearings to the 0-360 range", () => {
    expect(normalizeMapBearing(-90)).toBe(270);
    expect(normalizeMapBearing(-450)).toBe(270);
    expect(normalizeMapBearing(0)).toBe(0);
    expect(normalizeMapBearing(360)).toBe(0);
    expect(normalizeMapBearing(450)).toBe(90);
  });

  it("detects maps missing any of the rotation primitives", () => {
    expect(supportsMapRotation({})).toBe(false);
    expect(
      supportsMapRotation({
        dragRotate: { enable() {}, disable() {} },
        getBearing() {
          return 0;
        },
        setBearing() {},
      })
    ).toBe(false);
    expect(
      supportsMapRotation({
        dragRotate: { enable() {}, disable() {} },
        touchRotate: { enable() {}, disable() {} },
        getBearing() {
          return 0;
        },
        setBearing() {},
      })
    ).toBe(true);
  });

  it("tracks rotation state and reports normalized bearings via bindRotationHandlers", () => {
    const map = createRotationMapStub();
    const interactionStateRef = { current: { isRotating: false } };
    const onBearingChange = vi.fn();

    const cleanup = bindRotationHandlers({
      map,
      interactionStateRef,
      onBearingChange,
    });

    map.emit("rotatestart");
    expect(interactionStateRef.current.isRotating).toBe(true);

    map.emit("rotate");
    expect(onBearingChange).toHaveBeenLastCalledWith(270);

    map.emit("rotateend");
    expect(interactionStateRef.current.isRotating).toBe(false);
    expect(onBearingChange).toHaveBeenLastCalledWith(270);

    cleanup();
    expect(map.off).toHaveBeenCalledTimes(3);
  });
});
```

- [ ] **Step 2: Run the controller tests to verify they fail**

Rodar a partir de `web/`:

```bash
npm test -- src/components/map/map-rotation-controller.test.ts
```

Esperado: FAIL com "Cannot find module './map-rotation-controller'".

- [ ] **Step 3: Implement the rotation controller**

Criar `web/src/components/map/map-rotation-controller.tsx`:

```tsx
"use client";

import "leaflet-rotate";

import { useEffect } from "react";
import { useMap } from "react-leaflet";

type RotationInteractionRef = {
  current: {
    isRotating: boolean;
  };
};

type RotatableMap = {
  dragRotate?: { enable(): void; disable(): void };
  touchRotate?: { enable(): void; disable(): void };
  getBearing?: () => number;
  setBearing?: (bearing: number) => void;
  on: (event: string, handler: () => void) => unknown;
  off: (event: string, handler: () => void) => unknown;
};

export function normalizeMapBearing(rawBearing: number) {
  const normalized = rawBearing % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

export function supportsMapRotation(map: Partial<RotatableMap>) {
  return Boolean(
    map.dragRotate &&
      map.touchRotate &&
      typeof map.getBearing === "function" &&
      typeof map.setBearing === "function"
  );
}

export function bindRotationHandlers({
  map,
  interactionStateRef,
  onBearingChange,
}: {
  map: RotatableMap;
  interactionStateRef: RotationInteractionRef;
  onBearingChange: (bearing: number) => void;
}) {
  const handleRotationStart = () => {
    interactionStateRef.current.isRotating = true;
  };

  const handleRotation = () => {
    onBearingChange(normalizeMapBearing(map.getBearing?.() ?? 0));
  };

  const handleRotationEnd = () => {
    interactionStateRef.current.isRotating = false;
    onBearingChange(normalizeMapBearing(map.getBearing?.() ?? 0));
  };

  map.on("rotatestart", handleRotationStart);
  map.on("rotate", handleRotation);
  map.on("rotateend", handleRotationEnd);

  return () => {
    map.off("rotatestart", handleRotationStart);
    map.off("rotate", handleRotation);
    map.off("rotateend", handleRotationEnd);
  };
}

export function MapRotationController({
  enabled,
  resetRotationTrigger,
  interactionStateRef,
  onBearingChange,
}: {
  enabled: boolean;
  resetRotationTrigger: number;
  interactionStateRef: RotationInteractionRef;
  onBearingChange: (bearing: number) => void;
}) {
  const map = useMap() as unknown as RotatableMap;

  useEffect(() => {
    if (!enabled || !supportsMapRotation(map)) {
      interactionStateRef.current.isRotating = false;
      onBearingChange(0);
      return;
    }

    map.dragRotate?.enable();
    map.touchRotate?.enable();

    const cleanup = bindRotationHandlers({
      map,
      interactionStateRef,
      onBearingChange,
    });

    onBearingChange(normalizeMapBearing(map.getBearing?.() ?? 0));

    return () => {
      cleanup();
      map.dragRotate?.disable();
      map.touchRotate?.disable();
      interactionStateRef.current.isRotating = false;
      onBearingChange(0);
    };
  }, [enabled, interactionStateRef, map, onBearingChange]);

  useEffect(() => {
    if (!enabled || resetRotationTrigger <= 0 || !supportsMapRotation(map)) {
      return;
    }

    map.setBearing?.(0);
    onBearingChange(0);
  }, [enabled, map, onBearingChange, resetRotationTrigger]);

  return null;
}
```

- [ ] **Step 4: Run the controller tests to verify they pass**

Rodar a partir de `web/`:

```bash
npm test -- src/components/map/map-rotation-controller.test.ts
```

Esperado: PASS em normalização, detecção de capacidade e bind/cleanup dos handlers.

- [ ] **Step 5: Commit the isolated rotation controller**

Rodar a partir da raiz do repositório:

```bash
git add web/src/components/map/map-rotation-controller.tsx \
  web/src/components/map/map-rotation-controller.test.ts
git commit -m "feat: adiciona controlador isolado de rotacao do mapa"
```

---

## Task 3: Wire rotation state and reset button through the dashboard map

**Files:**
- Modify: `web/src/app/(dashboard)/dashboard-map.tsx`
- Modify: `web/src/app/(dashboard)/dashboard-map.test.tsx`
- Modify: `web/src/components/map/tracking-map.tsx`

- [ ] **Step 1: Extend the dashboard map test with rotation-state expectations**

Editar `web/src/app/(dashboard)/dashboard-map.test.tsx`. Substituir o `TrackingMapStub` existente por esta versão que aceita as novas props:

```tsx
function TrackingMapStub({
  followedDeviceId,
  selectedDeviceId,
  trails,
  onCancelFollow,
  onSelect,
  onBearingChange,
  resetRotationTrigger,
  rotationEnabled,
}: {
  followedDeviceId: string | null;
  selectedDeviceId: string | null;
  trails?: {
    deviceId: string;
    points: { latitude: number; longitude: number; server_time: string }[];
  }[];
  onCancelFollow: () => void;
  onSelect?: (deviceId: string) => void;
  onBearingChange?: (bearing: number) => void;
  resetRotationTrigger?: number;
  rotationEnabled?: boolean;
}) {
  return (
    <div data-testid="tracking-map-stub">
      <span>followed:{followedDeviceId ?? "none"}</span>
      <span>selected:{selectedDeviceId ?? "none"}</span>
      <span>rotation-enabled:{rotationEnabled ? "yes" : "no"}</span>
      <span>reset-rotation:{resetRotationTrigger ?? 0}</span>
      <span>trails:{trails?.map((trail) => trail.deviceId).join(",") || "none"}</span>
      <span>
        trail-points:
        {trails?.map((trail) => `${trail.deviceId}:${trail.points.length}`).join(",") ||
          "none"}
      </span>
      <button type="button" onClick={() => onSelect?.("van-2")}>
        Marker Van 02
      </button>
      <button type="button" onClick={() => onBearingChange?.(90)}>
        Report bearing 90
      </button>
      <button type="button" onClick={() => onBearingChange?.(0)}>
        Report bearing 0
      </button>
      <button type="button" onClick={onCancelFollow}>
        Cancel follow
      </button>
    </div>
  );
}
```

Adicionar os casos de rotação dentro do bloco `describe("DashboardMap", ...)`:

```tsx
it("keeps rotation disabled when the feature flag is off", async () => {
  vi.stubEnv("NEXT_PUBLIC_ENABLE_MAP_ROTATION", "0");
  renderDashboardMap();
  expect(await screen.findByText("rotation-enabled:no")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /resetar norte/i })).toBeNull();
});

it("shows the reset-to-north button only after the map reports a non-zero bearing", async () => {
  vi.stubEnv("NEXT_PUBLIC_ENABLE_MAP_ROTATION", "1");
  renderDashboardMap();

  expect(await screen.findByText("rotation-enabled:yes")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /resetar norte/i })).toBeNull();

  fireEvent.click(await screen.findByRole("button", { name: "Report bearing 90" }));
  expect(await screen.findByRole("button", { name: /resetar norte/i })).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: /resetar norte/i }));
  expect(await screen.findByText("reset-rotation:1")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Report bearing 0" }));
  await waitFor(() => {
    expect(screen.queryByRole("button", { name: /resetar norte/i })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the dashboard map test to verify it fails**

Rodar a partir de `web/`:

```bash
npm test -- 'src/app/(dashboard)/dashboard-map.test.tsx'
```

Esperado: FAIL — `rotation-enabled:no` não renderiza e não existe botão "Resetar norte".

- [ ] **Step 3: Implement rotation state and the reset button in DashboardMap**

Editar `web/src/app/(dashboard)/dashboard-map.tsx`.

Atualizar os imports no topo do arquivo:

```tsx
import { Compass, MapPinned, PanelRightClose } from "lucide-react";

import { isDashboardMapRotationEnabled } from "@/lib/map/map-rotation-feature";
```

Dentro de `DashboardMap`, logo após os `useState` existentes (a sequência atual termina em `setFitAllTrigger`), adicionar:

```tsx
const rotationEnabled = isDashboardMapRotationEnabled();
const [mapBearing, setMapBearing] = useState(0);
const [resetRotationTrigger, setResetRotationTrigger] = useState(0);
const showResetRotation = rotationEnabled && Math.abs(mapBearing) > 0.5;
```

Substituir o bloco `<TrackingMap ... />` atual por este, adicionando três props novas:

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
  rotationEnabled={rotationEnabled}
  onBearingChange={setMapBearing}
  resetRotationTrigger={resetRotationTrigger}
/>
```

Logo abaixo do botão `"Ver todos"` (fim do JSX onde o botão com `onClick={handleFitAll}` é renderizado), adicionar o botão de reset condicional:

```tsx
{showResetRotation ? (
  <button
    type="button"
    aria-label="Resetar norte"
    onClick={() => setResetRotationTrigger((value) => value + 1)}
    className="absolute right-3 bottom-36 z-[1000] flex items-center gap-2 rounded-2xl border border-white/10 bg-background/88 px-4 py-2.5 text-xs font-semibold text-foreground shadow-[0_20px_40px_-24px_rgba(0,0,0,0.75)] backdrop-blur-xl transition-all active:scale-95 lg:bottom-16"
  >
    <Compass size={14} strokeWidth={2.5} />
    Norte
  </button>
) : null}
```

- [ ] **Step 4: Extend TrackingMap to wire the rotation controller**

Editar `web/src/components/map/tracking-map.tsx`.

Atualizar os imports:

```tsx
"use client";

import "leaflet/dist/leaflet.css";
import dynamic from "next/dynamic";
import { useRef } from "react";
import type { DashboardVehicleTrail, VehiclePosition } from "./types";
```

Logo abaixo dos outros `dynamic(...)` existentes (depois de `MapControllerDynamic`), adicionar o import dinâmico do novo controlador:

```tsx
const MapRotationControllerDynamic = dynamic(
  () =>
    import("./map-rotation-controller").then((m) => m.MapRotationController),
  { ssr: false }
);
```

Estender `TrackingMapProps`:

```tsx
export type TrackingMapProps = {
  positions: VehiclePosition[];
  trails: DashboardVehicleTrail[];
  className?: string;
  selectedDeviceId: string | null;
  followedDeviceId: string | null;
  onSelect: (deviceId: string) => void;
  onFollow: (deviceId: string) => void;
  onCancelFollow: () => void;
  fitAllTrigger: number;
  rotationEnabled: boolean;
  onBearingChange: (bearing: number) => void;
  resetRotationTrigger: number;
};
```

Atualizar a desestruturação e o corpo do componente. Substituir a assinatura atual por:

```tsx
export function TrackingMap({
  positions,
  trails,
  className,
  selectedDeviceId,
  followedDeviceId,
  onSelect,
  onFollow,
  onCancelFollow,
  fitAllTrigger,
  rotationEnabled,
  onBearingChange,
  resetRotationTrigger,
}: TrackingMapProps) {
  const center: [number, number] =
    positions.length > 0
      ? [positions[0].latitude, positions[0].longitude]
      : SAO_PAULO;

  const rotationInteractionRef = useRef({ isRotating: false });
```

Atualizar a chamada do `MapControllerDynamic` para passar o ref:

```tsx
<MapControllerDynamic
  followedDeviceId={followedDeviceId}
  positions={positions}
  fitAllTrigger={fitAllTrigger}
  onCancelFollow={onCancelFollow}
  interactionStateRef={rotationInteractionRef}
/>
```

Logo abaixo do `MapControllerDynamic`, adicionar o novo controlador:

```tsx
<MapRotationControllerDynamic
  enabled={rotationEnabled}
  resetRotationTrigger={resetRotationTrigger}
  interactionStateRef={rotationInteractionRef}
  onBearingChange={onBearingChange}
/>
```

- [ ] **Step 5: Run the dashboard map test to verify it passes**

Rodar a partir de `web/`:

```bash
npm test -- 'src/app/(dashboard)/dashboard-map.test.tsx'
```

Esperado: PASS — flag off esconde botão, flag on mostra o botão só após bearing ≠ 0, clicar avança `resetRotationTrigger`, voltar bearing a 0 esconde o botão.

- [ ] **Step 6: Commit the dashboard integration**

Rodar a partir da raiz do repositório:

```bash
git add 'web/src/app/(dashboard)/dashboard-map.tsx' \
  'web/src/app/(dashboard)/dashboard-map.test.tsx' \
  web/src/components/map/tracking-map.tsx
git commit -m "feat: integra bearing e botao norte no dashboard"
```

---

## Task 4: Preserve follow during rotation and keep bearing on fit all

**Files:**
- Modify: `web/src/components/map/map-controller.tsx`
- Modify: `web/src/components/map/map-controller.test.ts`

- [ ] **Step 1: Add the failing drag-cancel guard test**

Editar `web/src/components/map/map-controller.test.ts`. Adicionar este import e teste ao final do arquivo, antes do fechamento do `describe`:

```ts
import { shouldCancelFollowOnMapDrag } from "./map-controller";
```

Adicionar, ainda dentro do `describe("map-controller", ...)`:

```ts
it("only cancels follow when no rotation gesture is active", () => {
  expect(shouldCancelFollowOnMapDrag(false)).toBe(true);
  expect(shouldCancelFollowOnMapDrag(true)).toBe(false);
});
```

- [ ] **Step 2: Run the map controller test to verify it fails**

Rodar a partir de `web/`:

```bash
npm test -- src/components/map/map-controller.test.ts
```

Esperado: FAIL — `shouldCancelFollowOnMapDrag` não existe.

- [ ] **Step 3: Implement the drag-cancel guard and the shared interaction ref**

Editar `web/src/components/map/map-controller.tsx`.

Adicionar, entre `import type { VehiclePosition } from "./types";` e a declaração de `MapControllerProps`, a função pura:

```tsx
export function shouldCancelFollowOnMapDrag(isRotationGestureActive: boolean) {
  return !isRotationGestureActive;
}

type MapInteractionRef = {
  current: {
    isRotating: boolean;
  };
};
```

Estender `MapControllerProps` com o novo campo:

```tsx
type MapControllerProps = {
  followedDeviceId: string | null;
  positions: VehiclePosition[];
  fitAllTrigger: number;
  onCancelFollow: () => void;
  interactionStateRef: MapInteractionRef;
};
```

Atualizar a desestruturação da função `MapController`:

```tsx
export function MapController({
  followedDeviceId,
  positions,
  fitAllTrigger,
  onCancelFollow,
  interactionStateRef,
}: MapControllerProps) {
```

Substituir o `useEffect` que faz bind do `dragstart` por esta versão com guarda:

```tsx
// Drag exits follow mode unless the user is currently rotating the map.
useEffect(() => {
  const handler = () => {
    if (!shouldCancelFollowOnMapDrag(interactionStateRef.current.isRotating)) {
      return;
    }
    handleCancelFollow();
  };
  map.on("dragstart", handler);
  return () => {
    map.off("dragstart", handler);
  };
}, [map, interactionStateRef]);
```

No `useEffect` do fit all (o que chama `map.fitBounds(...)`), adicionar save/restore de bearing como rede de proteção. Substituir o bloco:

```tsx
if (action.type === "fit-bounds") {
  map.fitBounds(L.latLngBounds(action.bounds), {
    padding: FITALL_PADDING,
    animate: true,
  });
}
```

por:

```tsx
if (action.type === "fit-bounds") {
  const rotatableMap = map as unknown as {
    getBearing?: () => number;
    setBearing?: (bearing: number) => void;
  };
  const previousBearing =
    typeof rotatableMap.getBearing === "function"
      ? rotatableMap.getBearing()
      : 0;

  map.fitBounds(L.latLngBounds(action.bounds), {
    padding: FITALL_PADDING,
    animate: true,
  });

  if (
    previousBearing !== 0 &&
    typeof rotatableMap.setBearing === "function"
  ) {
    rotatableMap.setBearing(previousBearing);
  }
}
```

- [ ] **Step 4: Run the targeted tests and lint to verify the full slice**

Rodar a partir de `web/`:

```bash
npm test -- src/lib/map/map-rotation-feature.test.ts \
  src/components/map/map-rotation-controller.test.ts \
  src/components/map/map-controller.test.ts \
  'src/app/(dashboard)/dashboard-map.test.tsx'
```

Esperado: todos PASS.

Rodar lint:

```bash
npm run lint -- src/lib/map/map-rotation-feature.ts \
  src/components/map/map-rotation-controller.tsx \
  src/components/map/map-controller.tsx \
  src/components/map/tracking-map.tsx \
  'src/app/(dashboard)/dashboard-map.tsx'
```

Esperado: finaliza sem novos erros nos arquivos tocados.

- [ ] **Step 5: Commit the follow-safe rotation behavior**

Rodar a partir da raiz do repositório:

```bash
git add web/src/components/map/map-controller.tsx \
  web/src/components/map/map-controller.test.ts
git commit -m "fix: preserva follow durante rotacao e bearing em fit all"
```

---

## Task 5: Manual verification

**Files:** nenhuma alteração de código.

- [ ] **Step 1: Start dev server with the flag off and confirm the baseline**

Em `web/.env.local`, garantir ausência ou valor `0`:

```dotenv
NEXT_PUBLIC_ENABLE_MAP_ROTATION=0
```

Rodar a partir de `web/`:

```bash
npm run dev
```

Abrir o dashboard e confirmar que o mapa se comporta exatamente como hoje: pan com drag, follow cancela no drag, "Ver todos" funciona, não aparece botão "Norte".

- [ ] **Step 2: Turn the flag on and walk the happy path**

Parar o servidor, editar `web/.env.local`:

```dotenv
NEXT_PUBLIC_ENABLE_MAP_ROTATION=1
```

Rodar `npm run dev` novamente e verificar na ordem:

```text
1. Desktop: segurar Ctrl e arrastar com botão esquerdo rotaciona o mapa.
2. Desktop: drag simples (sem Ctrl) continua fazendo pan, não rotaciona.
3. Botao "Norte" aparece assim que o bearing sai de 0 e some quando volta.
4. Clicar "Norte" volta o mapa para north-up.
5. Mobile/touch emulator: dois dedos girando rotacionam o mapa.
6. Mobile: um dedo continua fazendo pan; pinca continua fazendo zoom.
7. Selecionar um veiculo, entrar em follow, rotacionar: follow permanece ativo,
   recentros de nova posicao continuam funcionando.
8. "Ver todos" com o mapa rotacionado: centro e zoom se ajustam, bearing preservado.
9. Markers clicaveis, popups abrindo e fechando com mapa rotacionado.
10. Trilhas ativas continuam alinhadas ao mapa rotacionado.
11. Recarregar a pagina: mapa abre em north-up.
```

Se algum dos pontos falhar, abrir issue de follow-up ou voltar à spec — não forçar ajustes ad-hoc.

- [ ] **Step 2a: Verify safe fallback when the plugin fails to load**

Simular falha temporariamente removendo o import do plugin: comentar a linha `import "leaflet-rotate";` em `web/src/components/map/map-rotation-controller.tsx`, recarregar o dashboard com a flag ligada e confirmar que o mapa ainda sobe em north-up, o botão "Norte" nunca aparece, e nada quebra.

Restaurar o import após a verificação. Não commitar a simulação.

- [ ] **Step 3: Turn the flag back off for default commits**

Antes de encerrar, restaurar `web/.env.local`:

```dotenv
NEXT_PUBLIC_ENABLE_MAP_ROTATION=0
```

Esperado: ambiente default permanece em comportamento atual, a rotação só é ligada explicitamente.

---

## Self-Review

- **Spec coverage:**
  - "Desktop Ctrl+drag" e "Mobile dois dedos" → Task 2 (controller) + Task 3 (integração) + Task 5 (verificação).
  - "Botão Norte só com bearing ≠ 0" → Task 3 (`showResetRotation` com tolerância 0.5°).
  - "Rotação não cancela follow" → Task 4 (`shouldCancelFollowOnMapDrag` + ref compartilhado).
  - "Ver todos mantém bearing" → Task 4 (save/restore em `fitBounds`).
  - "Reload volta para norte" → bearing é `useState(0)` em `DashboardMap`, não há leitura de `localStorage` (Task 3).
  - "Flag por env var com fallback silencioso" → Task 1 (helper + env example), Task 2 (`supportsMapRotation`), Task 5 step 2a (verificação de fallback).
  - "Plugin isolado, rollback simples" → Task 2 mantém `import "leaflet-rotate"` contido no controller; remover o componente desfaz tudo sem mexer no resto.

- **Placeholder scan:** nenhum "TBD", "TODO", "handle appropriately" ou "similar to Task N" — cada step tem código ou comando explícito.

- **Type consistency:** nomes `rotationEnabled`, `resetRotationTrigger`, `onBearingChange`, `interactionStateRef` e `isRotating` batem entre `DashboardMap`, `TrackingMap`, `MapRotationController`, `MapController` e os testes. `normalizeMapBearing`, `supportsMapRotation` e `bindRotationHandlers` são exportados e consumidos com as mesmas assinaturas em Task 2 e Task 3.

- **Escopo:** um único feature slice (mapa principal do dashboard), entregue de forma incremental e com cobertura de rollback explícito via flag.
