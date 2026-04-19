# Dashboard Map Rotation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar rotação efêmera ao mapa principal do dashboard com `Ctrl + drag` no desktop, dois dedos no touch, botão "Norte" condicional, preservação do follow durante rotação e rollback via feature flag.

**Architecture:** Substitui o pacote `leaflet` pelo fork `leaflet-rotate-map` (BSD-2-Clause, mesmo Leaflet 1.9 com `rotate: true`, `getBearing`/`setBearing` e evento `rotate`) via alias npm, para não quebrar `react-leaflet`. Os gestos (Ctrl+drag e 2 dedos) são implementados no próprio `MapRotationController`, irmão do `MapController`. Um ref compartilhado (`rotationInteractionRef`) marca "gesture ativa" para o `MapController` não cancelar follow. Bearing é 100% local e volta a zero no reload.

**Tech Stack:** Next.js App Router 16, React 19, Leaflet 1.9 (via fork), react-leaflet 5, Vitest + Testing Library, npm.

## Update 2026-04-19

- O gesto touch deixou de interceptar `touchstart` imediatamente. A decisão entre pinch e rotação agora acontece no primeiro `touchmove` com 2 toques.
- A heurística final ficou: rotação só entra quando `|Δθ| >= 8deg` e a variação angular domina a variação relativa de distância por um fator de `1.2`; se a distância passar de `15%` primeiro, o gesto fica travado como pinch até terminar.

---

## File Structure

### Modified files

- `web/package.json`
  Purpose: aliasa `leaflet` para `npm:leaflet-rotate-map@0.3.1`.
- `web/package-lock.json`
  Purpose: lock do alias.
- `web/.env.local.example`
  Purpose: documenta `NEXT_PUBLIC_ENABLE_MAP_ROTATION` desligada por padrão.
- `web/src/app/(dashboard)/dashboard-map.tsx`
  Purpose: lê flag, mantém `mapBearing` e `resetRotationTrigger`, renderiza botão "Norte" condicional, propaga props.
- `web/src/app/(dashboard)/dashboard-map.test.tsx`
  Purpose: cobre flag off/on e fluxo do botão "Norte" via stub.
- `web/src/components/map/tracking-map.tsx`
  Purpose: passa `rotate={rotationEnabled}` ao `MapContainer`, cria `rotationInteractionRef`, monta `MapRotationController`.
- `web/src/components/map/map-controller.tsx`
  Purpose: aceita `interactionStateRef`, consulta `isRotating` no handler de `dragstart`, preserva bearing em `fitBounds`.
- `web/src/components/map/map-controller.test.ts`
  Purpose: cobre `shouldCancelFollowOnMapDrag`.

### New files

- `web/src/lib/map/map-rotation-feature.ts`
  Purpose: parser puro de `NEXT_PUBLIC_ENABLE_MAP_ROTATION`.
- `web/src/lib/map/map-rotation-feature.test.ts`
  Purpose: cobre truthy/falsey do parser.
- `web/src/components/map/map-rotation-controller.tsx`
  Purpose: integra o fork, expõe helpers puros e o componente `MapRotationController` com gestos customizados.
- `web/src/components/map/map-rotation-controller.test.ts`
  Purpose: cobre `normalizeMapBearing`, `supportsMapRotation`, `angleBetweenPoints`, `angleDelta`, `attachCtrlDragRotation`, `attachTouchRotation`.

---

## Task 1: Install the Leaflet rotation fork via npm alias and add the feature flag helper

**Files:**
- Modify: `web/package.json`
- Modify: `web/package-lock.json`
- Modify: `web/.env.local.example`
- Create: `web/src/lib/map/map-rotation-feature.ts`
- Create: `web/src/lib/map/map-rotation-feature.test.ts`

- [ ] **Step 1: Install the fork as an alias for `leaflet`**

Nota: a licença do fork já foi validada em 2026-04-18 (BSD-2-Clause, `leaflet-rotate-map@0.3.1`). O fork é o próprio Leaflet 1.9 com a branch `rotate` integrada, então substituir o pacote `leaflet` por ele mantém a API pública e preserva o `react-leaflet` 5.

Rodar a partir de `web/`:

```bash
npm install leaflet@npm:leaflet-rotate-map@0.3.1 --save-exact
```

Esperado: `package.json` mostra `"leaflet": "npm:leaflet-rotate-map@0.3.1"` e `package-lock.json` atualizado.

- [ ] **Step 2: Smoke test que o fork expõe a API de rotação**

Rodar a partir de `web/`:

```bash
node -e "const L = require('leaflet'); console.log({ proto: !!L.Map.prototype.setBearing && !!L.Map.prototype.getBearing });"
```

Esperado: `{ proto: true }`. Se falhar, reportar BLOCKED — sem a API não há como seguir.

- [ ] **Step 3: Document the feature flag in the env example**

Editar `web/.env.local.example` acrescentando ao final:

```dotenv

# Map rotation (0 = disabled, 1 = enabled)
NEXT_PUBLIC_ENABLE_MAP_ROTATION=0
```

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

```bash
npm test -- src/lib/map/map-rotation-feature.test.ts
```

Esperado: PASS.

- [ ] **Step 8: Commit the groundwork**

Rodar a partir da raiz do repositório:

```bash
git add web/package.json web/package-lock.json web/.env.local.example \
  web/src/lib/map/map-rotation-feature.ts \
  web/src/lib/map/map-rotation-feature.test.ts
git commit -m "chore: aliasa leaflet para fork com rotacao e adiciona flag"
```

---

## Task 2: Build the rotation controller with custom gesture handlers (TDD)

**Files:**
- Create: `web/src/components/map/map-rotation-controller.tsx`
- Create: `web/src/components/map/map-rotation-controller.test.ts`

- [ ] **Step 1: Write the failing controller helper tests**

Criar `web/src/components/map/map-rotation-controller.test.ts`:

```ts
// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import {
  angleBetweenPoints,
  angleDelta,
  attachCtrlDragRotation,
  attachTouchRotation,
  normalizeMapBearing,
  supportsMapRotation,
} from "./map-rotation-controller";

function createMapStub() {
  let bearing = 0;
  const container = document.createElement("div");
  Object.defineProperty(container, "getBoundingClientRect", {
    value: () => ({ left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200, x: 0, y: 0, toJSON: () => ({}) }),
  });
  document.body.appendChild(container);

  const map = {
    getContainer: () => container,
    getBearing: vi.fn(() => bearing),
    setBearing: vi.fn((value: number) => {
      bearing = value;
    }),
  };

  return { map, container };
}

describe("map-rotation-controller helpers", () => {
  it("normalizes bearings to the 0-360 range", () => {
    expect(normalizeMapBearing(-90)).toBe(270);
    expect(normalizeMapBearing(-450)).toBe(270);
    expect(normalizeMapBearing(0)).toBe(0);
    expect(normalizeMapBearing(360)).toBe(0);
    expect(normalizeMapBearing(450)).toBe(90);
  });

  it("detects maps missing getBearing or setBearing", () => {
    expect(supportsMapRotation({})).toBe(false);
    expect(
      supportsMapRotation({
        getBearing() {
          return 0;
        },
      })
    ).toBe(false);
    expect(
      supportsMapRotation({
        getBearing() {
          return 0;
        },
        setBearing() {},
      })
    ).toBe(true);
  });

  it("computes the angle between a point and the container center in degrees", () => {
    const center = { x: 100, y: 100 };
    expect(angleBetweenPoints(center, { x: 200, y: 100 })).toBeCloseTo(0);
    expect(angleBetweenPoints(center, { x: 100, y: 200 })).toBeCloseTo(90);
    expect(angleBetweenPoints(center, { x: 0, y: 100 })).toBeCloseTo(180);
    expect(angleBetweenPoints(center, { x: 100, y: 0 })).toBeCloseTo(-90);
  });

  it("wraps angle deltas into the -180..180 range", () => {
    expect(angleDelta(10, 20)).toBeCloseTo(10);
    expect(angleDelta(350, 10)).toBeCloseTo(20);
    expect(angleDelta(10, 350)).toBeCloseTo(-20);
    expect(angleDelta(-170, 170)).toBeCloseTo(-20);
  });

  it("tracks ctrl+drag rotation gestures end-to-end", () => {
    const { map, container } = createMapStub();
    const interactionStateRef = { current: { isRotating: false } };
    const onBearingChange = vi.fn();

    const cleanup = attachCtrlDragRotation({
      map,
      interactionStateRef,
      onBearingChange,
    });

    const down = new MouseEvent("mousedown", {
      clientX: 200,
      clientY: 100,
      button: 0,
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    container.dispatchEvent(down);
    expect(interactionStateRef.current.isRotating).toBe(true);

    const move = new MouseEvent("mousemove", {
      clientX: 100,
      clientY: 200,
      bubbles: true,
    });
    document.dispatchEvent(move);
    expect(map.setBearing).toHaveBeenLastCalledWith(expect.any(Number));
    expect(onBearingChange).toHaveBeenLastCalledWith(expect.any(Number));
    expect(onBearingChange.mock.lastCall?.[0]).toBeGreaterThan(0);

    const up = new MouseEvent("mouseup", { bubbles: true });
    document.dispatchEvent(up);
    expect(interactionStateRef.current.isRotating).toBe(false);

    cleanup();
    container.remove();
  });

  it("ignores mousedown without Ctrl or on non-primary buttons", () => {
    const { map, container } = createMapStub();
    const interactionStateRef = { current: { isRotating: false } };
    const onBearingChange = vi.fn();

    const cleanup = attachCtrlDragRotation({
      map,
      interactionStateRef,
      onBearingChange,
    });

    container.dispatchEvent(
      new MouseEvent("mousedown", {
        clientX: 200,
        clientY: 100,
        button: 0,
        ctrlKey: false,
        bubbles: true,
      })
    );
    expect(interactionStateRef.current.isRotating).toBe(false);

    container.dispatchEvent(
      new MouseEvent("mousedown", {
        clientX: 200,
        clientY: 100,
        button: 2,
        ctrlKey: true,
        bubbles: true,
      })
    );
    expect(interactionStateRef.current.isRotating).toBe(false);
    expect(map.setBearing).not.toHaveBeenCalled();

    cleanup();
    container.remove();
  });

  it("tracks two-finger touch rotation gestures end-to-end", () => {
    const { map, container } = createMapStub();
    const interactionStateRef = { current: { isRotating: false } };
    const onBearingChange = vi.fn();

    const cleanup = attachTouchRotation({
      map,
      interactionStateRef,
      onBearingChange,
    });

    function fireTouch(type: string, touches: Array<{ clientX: number; clientY: number }>) {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, "touches", { value: touches });
      container.dispatchEvent(event);
    }

    fireTouch("touchstart", [
      { clientX: 50, clientY: 100 },
      { clientX: 150, clientY: 100 },
    ]);
    expect(interactionStateRef.current.isRotating).toBe(true);

    fireTouch("touchmove", [
      { clientX: 100, clientY: 50 },
      { clientX: 100, clientY: 150 },
    ]);
    expect(map.setBearing).toHaveBeenCalled();

    fireTouch("touchend", [{ clientX: 100, clientY: 50 }]);
    expect(interactionStateRef.current.isRotating).toBe(false);

    cleanup();
    container.remove();
  });
});
```

- [ ] **Step 2: Run the controller tests to verify they fail**

Rodar a partir de `web/`:

```bash
npm test -- src/components/map/map-rotation-controller.test.ts
```

Esperado: FAIL por ausência do módulo.

- [ ] **Step 3: Implement the rotation controller**

Criar `web/src/components/map/map-rotation-controller.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { useMap } from "react-leaflet";

type RotationInteractionRef = {
  current: {
    isRotating: boolean;
  };
};

type RotatableMap = {
  getContainer: () => HTMLElement;
  getBearing: () => number;
  setBearing: (theta: number) => void;
  on?: (event: string, handler: () => void) => unknown;
  off?: (event: string, handler: () => void) => unknown;
};

type Point = { x: number; y: number };

export function normalizeMapBearing(rawBearing: number) {
  const normalized = rawBearing % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

export function supportsMapRotation(map: Partial<RotatableMap>) {
  return (
    typeof map.getBearing === "function" &&
    typeof map.setBearing === "function"
  );
}

export function angleBetweenPoints(center: Point, point: Point) {
  return (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI;
}

export function angleDelta(from: number, to: number) {
  let delta = to - from;
  while (delta > 180) delta -= 360;
  while (delta <= -180) delta += 360;
  return delta;
}

function containerCenter(container: HTMLElement) {
  const rect = container.getBoundingClientRect();
  return { x: rect.width / 2, y: rect.height / 2 };
}

function pointerToContainer(
  container: HTMLElement,
  clientX: number,
  clientY: number
) {
  const rect = container.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top };
}

type GestureBindingArgs = {
  map: RotatableMap;
  interactionStateRef: RotationInteractionRef;
  onBearingChange: (bearing: number) => void;
};

export function attachCtrlDragRotation({
  map,
  interactionStateRef,
  onBearingChange,
}: GestureBindingArgs) {
  const container = map.getContainer();
  let active = false;
  let lastAngle = 0;

  const handleMouseDown = (event: MouseEvent) => {
    if (!event.ctrlKey || event.button !== 0) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    active = true;
    interactionStateRef.current.isRotating = true;
    const point = pointerToContainer(container, event.clientX, event.clientY);
    lastAngle = angleBetweenPoints(containerCenter(container), point);
    document.addEventListener("mousemove", handleMouseMove, true);
    document.addEventListener("mouseup", handleMouseUp, true);
  };

  const handleMouseMove = (event: MouseEvent) => {
    if (!active) return;
    const point = pointerToContainer(container, event.clientX, event.clientY);
    const angle = angleBetweenPoints(containerCenter(container), point);
    const delta = angleDelta(lastAngle, angle);
    lastAngle = angle;
    const next = map.getBearing() + delta;
    map.setBearing(next);
    onBearingChange(normalizeMapBearing(next));
  };

  const handleMouseUp = () => {
    if (!active) return;
    active = false;
    interactionStateRef.current.isRotating = false;
    onBearingChange(normalizeMapBearing(map.getBearing()));
    document.removeEventListener("mousemove", handleMouseMove, true);
    document.removeEventListener("mouseup", handleMouseUp, true);
  };

  container.addEventListener("mousedown", handleMouseDown, true);

  return () => {
    container.removeEventListener("mousedown", handleMouseDown, true);
    document.removeEventListener("mousemove", handleMouseMove, true);
    document.removeEventListener("mouseup", handleMouseUp, true);
  };
}

export function attachTouchRotation({
  map,
  interactionStateRef,
  onBearingChange,
}: GestureBindingArgs) {
  const container = map.getContainer();
  let active = false;
  let lastAngle = 0;

  const angleForTouches = (touches: ArrayLike<{ clientX: number; clientY: number }>) => {
    const a = pointerToContainer(container, touches[0].clientX, touches[0].clientY);
    const b = pointerToContainer(container, touches[1].clientX, touches[1].clientY);
    return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  };

  const handleTouchStart = (event: Event) => {
    const touchEvent = event as unknown as { touches: ArrayLike<{ clientX: number; clientY: number }> };
    if (!touchEvent.touches || touchEvent.touches.length !== 2) return;
    event.stopPropagation();
    active = true;
    interactionStateRef.current.isRotating = true;
    lastAngle = angleForTouches(touchEvent.touches);
  };

  const handleTouchMove = (event: Event) => {
    const touchEvent = event as unknown as { touches: ArrayLike<{ clientX: number; clientY: number }> };
    if (!active || !touchEvent.touches || touchEvent.touches.length !== 2) return;
    event.stopPropagation();
    event.preventDefault();
    const angle = angleForTouches(touchEvent.touches);
    const delta = angleDelta(lastAngle, angle);
    lastAngle = angle;
    const next = map.getBearing() + delta;
    map.setBearing(next);
    onBearingChange(normalizeMapBearing(next));
  };

  const handleTouchEnd = (event: Event) => {
    const touchEvent = event as unknown as { touches: ArrayLike<unknown> };
    if (!active) return;
    if (touchEvent.touches && touchEvent.touches.length >= 2) return;
    active = false;
    interactionStateRef.current.isRotating = false;
    onBearingChange(normalizeMapBearing(map.getBearing()));
  };

  container.addEventListener("touchstart", handleTouchStart, { capture: true, passive: false });
  container.addEventListener("touchmove", handleTouchMove, { capture: true, passive: false });
  container.addEventListener("touchend", handleTouchEnd, true);
  container.addEventListener("touchcancel", handleTouchEnd, true);

  return () => {
    container.removeEventListener("touchstart", handleTouchStart, true);
    container.removeEventListener("touchmove", handleTouchMove, true);
    container.removeEventListener("touchend", handleTouchEnd, true);
    container.removeEventListener("touchcancel", handleTouchEnd, true);
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

    const detachCtrlDrag = attachCtrlDragRotation({
      map,
      interactionStateRef,
      onBearingChange,
    });
    const detachTouch = attachTouchRotation({
      map,
      interactionStateRef,
      onBearingChange,
    });

    onBearingChange(normalizeMapBearing(map.getBearing()));

    return () => {
      detachCtrlDrag();
      detachTouch();
      interactionStateRef.current.isRotating = false;
      onBearingChange(0);
    };
  }, [enabled, interactionStateRef, map, onBearingChange]);

  useEffect(() => {
    if (!enabled || resetRotationTrigger <= 0 || !supportsMapRotation(map)) {
      return;
    }

    map.setBearing(0);
    onBearingChange(0);
  }, [enabled, map, onBearingChange, resetRotationTrigger]);

  return null;
}
```

- [ ] **Step 4: Run the controller tests to verify they pass**

```bash
npm test -- src/components/map/map-rotation-controller.test.ts
```

Esperado: PASS em todos os blocos.

- [ ] **Step 5: Commit the controller**

```bash
git add web/src/components/map/map-rotation-controller.tsx \
  web/src/components/map/map-rotation-controller.test.ts
git commit -m "feat: adiciona controlador de rotacao com gestos customizados"
```

---

## Task 3: Wire rotation into DashboardMap + TrackingMap

**Files:**
- Modify: `web/src/app/(dashboard)/dashboard-map.tsx`
- Modify: `web/src/app/(dashboard)/dashboard-map.test.tsx`
- Modify: `web/src/components/map/tracking-map.tsx`

- [ ] **Step 1: Extend the dashboard map test with rotation-state expectations**

Editar `web/src/app/(dashboard)/dashboard-map.test.tsx`. Substituir o `TrackingMapStub` atual por:

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

Adicionar os casos dentro do `describe("DashboardMap", ...)`:

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

```bash
npm test -- 'src/app/(dashboard)/dashboard-map.test.tsx'
```

Esperado: FAIL — `rotation-enabled:no` não renderiza e botão "Resetar norte" não existe.

- [ ] **Step 3: Implement rotation state and the reset button in DashboardMap**

Editar `web/src/app/(dashboard)/dashboard-map.tsx`.

Atualizar imports:

```tsx
import { Compass, MapPinned, PanelRightClose } from "lucide-react";

import { isDashboardMapRotationEnabled } from "@/lib/map/map-rotation-feature";
```

Dentro de `DashboardMap`, logo após os `useState` existentes (após `setFitAllTrigger`), adicionar:

```tsx
const rotationEnabled = isDashboardMapRotationEnabled();
const [mapBearing, setMapBearing] = useState(0);
const [resetRotationTrigger, setResetRotationTrigger] = useState(0);
const showResetRotation = rotationEnabled && Math.abs(mapBearing) > 0.5;
```

Substituir o `<TrackingMap ... />` atual por:

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

Logo abaixo do botão `"Ver todos"` (o `<button type="button" onClick={handleFitAll} ...>`), adicionar o botão de reset:

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

- [ ] **Step 4: Extend TrackingMap to pass `rotate` and mount the rotation controller**

Editar `web/src/components/map/tracking-map.tsx`.

Atualizar imports no topo do arquivo:

```tsx
"use client";

import "leaflet/dist/leaflet.css";
import dynamic from "next/dynamic";
import { useRef } from "react";
import type { DashboardVehicleTrail, VehiclePosition } from "./types";
```

Logo abaixo do `MapControllerDynamic`, adicionar:

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

Atualizar a assinatura de `TrackingMap` e adicionar o ref compartilhado:

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

Substituir o bloco `<MapContainer ...>` para passar a opção `rotate`:

```tsx
<MapContainer
  center={center}
  zoom={12}
  style={{ width: "100%", height: "100%", minHeight: 400 }}
  className={className}
  {...({ rotate: rotationEnabled } as Record<string, unknown>)}
>
```

Nota: o spread typed-cast é necessário porque os tipos de `react-leaflet` não declaram `rotate`; a prop chega ao `L.map()` via runtime options.

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

Abaixo, adicionar o novo controlador:

```tsx
<MapRotationControllerDynamic
  enabled={rotationEnabled}
  resetRotationTrigger={resetRotationTrigger}
  interactionStateRef={rotationInteractionRef}
  onBearingChange={onBearingChange}
/>
```

- [ ] **Step 5: Run the dashboard map test to verify it passes**

```bash
npm test -- 'src/app/(dashboard)/dashboard-map.test.tsx'
```

Esperado: PASS — flag off oculta botão, flag on mostra botão só após bearing ≠ 0, clique incrementa trigger, voltar a 0 oculta o botão.

- [ ] **Step 6: Commit the integration**

```bash
git add 'web/src/app/(dashboard)/dashboard-map.tsx' \
  'web/src/app/(dashboard)/dashboard-map.test.tsx' \
  web/src/components/map/tracking-map.tsx
git commit -m "feat: integra rotacao no dashboard map"
```

---

## Task 4: Preserve follow during rotation and keep bearing on fit all

**Files:**
- Modify: `web/src/components/map/map-controller.tsx`
- Modify: `web/src/components/map/map-controller.test.ts`

- [ ] **Step 1: Add the failing drag-cancel guard test**

Editar `web/src/components/map/map-controller.test.ts`. Adicionar no topo:

```ts
import { shouldCancelFollowOnMapDrag } from "./map-controller";
```

Adicionar dentro do `describe("map-controller", ...)`:

```ts
it("only cancels follow when no rotation gesture is active", () => {
  expect(shouldCancelFollowOnMapDrag(false)).toBe(true);
  expect(shouldCancelFollowOnMapDrag(true)).toBe(false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- src/components/map/map-controller.test.ts
```

Esperado: FAIL — `shouldCancelFollowOnMapDrag` não existe.

- [ ] **Step 3: Implement the drag-cancel guard and the shared interaction ref**

Editar `web/src/components/map/map-controller.tsx`.

Adicionar, logo após `import type { VehiclePosition } from "./types";`:

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

Estender `MapControllerProps`:

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

Substituir o `useEffect` do `dragstart` por:

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

No `useEffect` do fit all, substituir o bloco:

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

- [ ] **Step 4: Run the targeted tests and lint**

```bash
npm test -- src/lib/map/map-rotation-feature.test.ts \
  src/components/map/map-rotation-controller.test.ts \
  src/components/map/map-controller.test.ts \
  'src/app/(dashboard)/dashboard-map.test.tsx'
```

Esperado: todos PASS.

```bash
npm run lint -- src/lib/map/map-rotation-feature.ts \
  src/components/map/map-rotation-controller.tsx \
  src/components/map/map-controller.tsx \
  src/components/map/tracking-map.tsx \
  'src/app/(dashboard)/dashboard-map.tsx'
```

Esperado: sem novos erros nos arquivos tocados.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/map/map-controller.tsx \
  web/src/components/map/map-controller.test.ts
git commit -m "fix: preserva follow durante rotacao e bearing em fit all"
```

---

## Task 5: Manual verification

**Files:** nenhuma alteração de código.

- [ ] **Step 1: Baseline com a flag desligada**

Garantir em `web/.env.local`:

```dotenv
NEXT_PUBLIC_ENABLE_MAP_ROTATION=0
```

Rodar `npm run dev` em `web/` e confirmar: mapa se comporta como hoje; não aparece botão "Norte"; pan/drag normais; follow cancela com drag.

- [ ] **Step 2: Happy path com a flag ligada**

Parar o servidor, editar `web/.env.local`:

```dotenv
NEXT_PUBLIC_ENABLE_MAP_ROTATION=1
```

Rodar `npm run dev` e verificar:

```text
1. Desktop: Ctrl + botao esquerdo + arrastar rotaciona o mapa.
2. Desktop: drag simples (sem Ctrl) continua fazendo pan, nao rotaciona.
3. Botao "Norte" aparece assim que bearing sai de 0 e some ao voltar.
4. Clicar "Norte" volta o mapa para north-up.
5. Touch emulator/tablet: dois dedos girando rotacionam; um dedo faz pan; pinca faz zoom.
6. Entrar em follow, rotacionar: follow permanece ativo e recentros continuam.
7. "Ver todos" com mapa rotacionado: so centro/zoom mudam, bearing mantido.
8. Markers clicaveis e popups funcionam com mapa rotacionado.
9. Trilhas ativas permanecem alinhadas ao mapa.
10. Recarregar a pagina: mapa abre em north-up.
```

- [ ] **Step 3: Voltar a flag para 0**

Restaurar `web/.env.local`:

```dotenv
NEXT_PUBLIC_ENABLE_MAP_ROTATION=0
```

Esperado: default permanece em comportamento atual; rotação só é ligada explicitamente.

---

## Self-Review

- **Spec coverage:**
  - "Desktop Ctrl+drag" → Task 2 (`attachCtrlDragRotation`) + Task 3 (integração) + Task 5.
  - "Mobile dois dedos" → Task 2 (`attachTouchRotation`) + Task 3 + Task 5.
  - "Botão Norte só com bearing ≠ 0" → Task 3 (`showResetRotation` com tolerância 0.5°).
  - "Rotação não cancela follow" → Task 4 (`shouldCancelFollowOnMapDrag` + ref compartilhado).
  - "Ver todos mantém bearing" → Task 4 (save/restore em `fitBounds`).
  - "Reload volta para norte" → bearing é `useState(0)` em `DashboardMap`, sem `localStorage` (Task 3).
  - "Flag por env var" → Task 1 (helper + env example).
  - "Capacidade ausente = fallback silencioso" → Task 2 (`supportsMapRotation`).
  - "Plugin isolado, rollback simples" → Task 1 aliasa o pacote `leaflet`; Task 2 mantém gestos no controlador; sem a flag, `MapContainer` não recebe `rotate: true` e o fork age como Leaflet normal.

- **Placeholder scan:** nenhum "TBD", "TODO", "similar to Task N" — todo passo traz comando ou código.

- **Type consistency:** `rotationEnabled`, `resetRotationTrigger`, `onBearingChange`, `interactionStateRef`, `isRotating`, `normalizeMapBearing`, `supportsMapRotation`, `attachCtrlDragRotation`, `attachTouchRotation`, `shouldCancelFollowOnMapDrag` aparecem com mesmas assinaturas em produção e teste.

- **Escopo:** um único feature slice (mapa principal do dashboard), entregue por TDD com commits atômicos e rollback por flag.
