# History Screen Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesenhar a tela de histórico para um painel operacional map-first com resumo de viagem, destaques clicáveis e playback com velocidades `1x/2x/4x/8x`.

**Architecture:** `HistoryPlayer` continua como orquestrador de estado e busca, mas a lógica derivada sai para um helper puro testado e a nova UI é dividida em componentes pequenos: toolbar de consulta, barra de playback, faixa de métricas e sidebar operacional. O mapa ganha controle explícito de fit-to-route e marcadores de contexto para preservar a leitura da viagem em desktop e mobile sem reescrever a integração Leaflet existente.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind CSS v4, Base UI/shadcn components, react-leaflet/Leaflet, Vitest para helpers puros.

---

## File Structure

### Create

- `web/vitest.config.ts` — configuração mínima do Vitest para helpers TypeScript do `web`
- `web/src/lib/history/history-player-utils.ts` — derivação pura de resumo, destaques e velocidade do playback
- `web/src/lib/history/history-player-utils.test.ts` — testes dos helpers de histórico
- `web/src/components/map/history-query-toolbar.tsx` — cabeçalho operacional com veículo, período, ação principal e erro contextual
- `web/src/components/map/history-map-summary-strip.tsx` — faixa compacta de métricas-chave sobre/abaixo do mapa
- `web/src/components/map/history-playback-bar.tsx` — controles de play/pause/reset, scrubber, progresso e presets de velocidade
- `web/src/components/map/history-mission-sidebar.tsx` — sidebar com resumo completo, destaques e ponto atual

### Modify

- `web/package.json` — script de teste e dependência mínima do Vitest
- `web/package-lock.json` — lockfile atualizado após instalar Vitest
- `web/src/app/(dashboard)/history/page.tsx` — shell da página e texto de contexto
- `web/src/components/map/history-player.tsx` — composição do novo layout, fetch, estados e integração do mapa
- `web/src/components/map/history-map-controller.tsx` — fit inicial da rota e acompanhamento do frame atual sem resetar zoom

---

### Task 1: Add tested history derivation helpers

**Files:**
- Create: `web/vitest.config.ts`
- Create: `web/src/lib/history/history-player-utils.ts`
- Create: `web/src/lib/history/history-player-utils.test.ts`
- Modify: `web/package.json`
- Modify: `web/package-lock.json`

- [ ] **Step 1: Add the minimal Vitest script and dependency**

Update `web/package.json`:

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

Then install:

Run: `cd web && npm install`
Expected: `vitest` added to `package-lock.json` without changing runtime dependencies.

- [ ] **Step 2: Create `web/vitest.config.ts`**

Use a minimal node-environment config because the initial target is a pure helper module:

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

Create `web/src/lib/history/history-player-utils.test.ts` covering:
- summary metrics from a small position sequence;
- stop/highlight extraction from a route with stationary frames;
- playback speed preset mapping;
- empty-state safety.

Use fixed timestamps and a tiny sample route:

```ts
import { describe, expect, it } from "vitest";
import {
  buildHistorySummary,
  buildHistoryHighlights,
  getPlaybackIntervalMs,
} from "./history-player-utils";

const positions = [
  { latitude: -23.55, longitude: -46.63, speed: 0, ignition: true, server_time: "2026-04-05T10:00:00.000Z" },
  { latitude: -23.551, longitude: -46.631, speed: 42, ignition: true, server_time: "2026-04-05T10:05:00.000Z" },
  { latitude: -23.551, longitude: -46.631, speed: 0, ignition: false, server_time: "2026-04-05T10:15:00.000Z" },
];

describe("history-player-utils", () => {
  it("builds the trip summary", () => {
    const summary = buildHistorySummary(positions);
    expect(summary.maxSpeedKmh).toBe(42);
    expect(summary.totalPoints).toBe(3);
  });

  it("maps speed presets to playback intervals", () => {
    expect(getPlaybackIntervalMs("1x")).toBeGreaterThan(getPlaybackIntervalMs("4x"));
  });
});
```

- [ ] **Step 4: Run the tests to confirm they fail**

Run: `cd web && npm test -- history-player-utils`
Expected: FAIL because `history-player-utils.ts` does not exist yet.

- [ ] **Step 5: Implement `history-player-utils.ts`**

Export typed helpers used by the screen:

```ts
import type { VehiclePosition } from "@/lib/actions/positions";

export type PlaybackSpeedPreset = "1x" | "2x" | "4x" | "8x";

export type HistorySummary = {
  totalPoints: number;
  totalDistanceKm: number;
  maxSpeedKmh: number;
  movingMinutes: number;
  stoppedMinutes: number;
  totalDurationMinutes: number;
};

export function getPlaybackIntervalMs(speed: PlaybackSpeedPreset) {
  return { "1x": 800, "2x": 400, "4x": 200, "8x": 100 }[speed];
}
```

Also implement:
- `buildHistorySummary(positions)`
- `buildHistoryHighlights(positions)` returning clickable stop/milestone items with `index`, `label`, `timestamp`, `latitude`, `longitude`
- `formatHistoryTimestamp(iso)`
- guards for empty arrays so the UI never branches on `undefined`

Rules to lock in:
- use Haversine distance between consecutive points for `totalDistanceKm`;
- treat a stop highlight as consecutive frames with `speed <= 2` lasting at least `5` minutes;
- export `HistoryHighlight` and `PlaybackSpeedPreset` from this file so the UI components do not redefine those types.

Do not add server-side aggregation in this redesign.

- [ ] **Step 6: Run the helper tests and confirm they pass**

Run: `cd web && npm test -- history-player-utils`
Expected: PASS with all helper scenarios green.

- [ ] **Step 7: Commit**

```bash
git add web/package.json web/package-lock.json web/vitest.config.ts web/src/lib/history/history-player-utils.ts web/src/lib/history/history-player-utils.test.ts
git commit -m "test(web): adiciona helpers testados para historico"
```

---

### Task 2: Build the new history UI primitives

**Files:**
- Create: `web/src/components/map/history-query-toolbar.tsx`
- Create: `web/src/components/map/history-map-summary-strip.tsx`
- Create: `web/src/components/map/history-playback-bar.tsx`
- Create: `web/src/components/map/history-mission-sidebar.tsx`

- [ ] **Step 1: Create `history-query-toolbar.tsx`**

Move the search controls into a prop-driven component:

```tsx
type HistoryQueryToolbarProps = {
  vehicleId: string;
  vehicles: Array<{ id: string; label: string }>;
  startDate: string;
  endDate: string;
  loading: boolean;
  error?: string;
  onVehicleChange: (value: string) => void;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onSearch: () => void;
};
```

Implementation rules:
- use `Select` for vehicle choice;
- keep `datetime-local` for date inputs because the repo has no calendar component yet;
- render the error inline in the same surface as the search controls.

- [ ] **Step 2: Create `history-map-summary-strip.tsx`**

Render 3-4 quick metrics in a dense horizontal card strip:

```tsx
type HistoryMapSummaryStripProps = {
  summary: HistorySummary | null;
  loading: boolean;
};
```

Show at least:
- distância;
- duração;
- tempo parado;
- velocidade máxima.

- [ ] **Step 3: Create `history-playback-bar.tsx`**

Render the playback controls with explicit presets:

```tsx
type HistoryPlaybackBarProps = {
  playing: boolean;
  currentIndex: number;
  totalPoints: number;
  speed: PlaybackSpeedPreset;
  currentTimestamp: string | null;
  onPlay: () => void;
  onPause: () => void;
  onReset: () => void;
  onSeek: (index: number) => void;
  onSpeedChange: (speed: PlaybackSpeedPreset) => void;
};
```

Use a styled `<input type="range">` for the scrubber rather than introducing a new slider dependency.

- [ ] **Step 4: Create `history-mission-sidebar.tsx`**

Render the fixed desktop sidebar / stacked mobile blocks using props only:

```tsx
type HistoryMissionSidebarProps = {
  summary: HistorySummary | null;
  highlights: HistoryHighlight[];
  currentPosition: VehiclePosition | null;
  loading: boolean;
  hasSearched: boolean;
  onHighlightSelect: (index: number) => void;
};
```

Sections in order:
- resumo da viagem;
- paradas e destaques;
- ponto selecionado.

Handle the three states explicitly:
- before search;
- loading;
- no results.

- [ ] **Step 5: Run lint for the new UI primitives**

Run: `cd web && npm run lint`
Expected: PASS with no new ESLint errors.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/map/history-query-toolbar.tsx web/src/components/map/history-map-summary-strip.tsx web/src/components/map/history-playback-bar.tsx web/src/components/map/history-mission-sidebar.tsx
git commit -m "feat(web): cria componentes da nova tela de historico"
```

---

### Task 3: Recompose `HistoryPlayer` around mission-mode layout and playback speed

**Files:**
- Modify: `web/src/components/map/history-player.tsx`
- Modify: `web/src/app/(dashboard)/history/page.tsx`

- [ ] **Step 1: Refactor `history/page.tsx` into a real page shell**

Replace the single title + hardcoded height wrapper with a shell like:

```tsx
export default function HistoryPage() {
  return (
    <div className="flex min-h-full flex-col gap-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold lg:text-2xl">Historico de Rotas</h1>
        <p className="text-sm text-muted-foreground">
          Analise viagens, paradas e o replay da rota em um unico painel.
        </p>
      </div>
      <HistoryPlayer />
    </div>
  );
}
```

- [ ] **Step 2: Reshape `history-player.tsx` state**

Add the state needed by the new UI:

```ts
const [hasSearched, setHasSearched] = useState(false);
const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeedPreset>("1x");
const [fitVersion, setFitVersion] = useState(0);
```

Derive, not store:
- `selectedVehicleLabel`
- `summary`
- `highlights`
- `currentPosition`
- `routeCoords`

- [ ] **Step 3: Replace the old top controls with `HistoryQueryToolbar`**

Map the existing fetch/search logic into the new toolbar props.

Also tighten the vehicle data shape immediately after fetch:

```ts
type VehicleOption = { id: string; label: string };

setVehicles(
  ((data as Vehicle[]) ?? []).map((vehicle) => ({
    id: vehicle.id,
    label: vehicle.name ? `${vehicle.name} · ${vehicle.plate}` : vehicle.plate,
  }))
);
```

Keep the current ISO conversion for `datetime-local`.

On every request:
- set `hasSearched(true)` before awaiting the server action;
- increment `fitVersion` only after a successful route load with data.

- [ ] **Step 4: Replace the playback interval effect to depend on speed preset**

Change the timer effect from hardcoded `200` ms to the tested helper:

```ts
useEffect(() => {
  if (!playing || positions.length === 0) return;

  intervalRef.current = setInterval(() => {
    setCurrentIndex((prev) => {
      if (prev >= positions.length - 1) {
        setPlaying(false);
        return prev;
      }
      return prev + 1;
    });
  }, getPlaybackIntervalMs(playbackSpeed));

  return () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
  };
}, [playing, positions.length, playbackSpeed]);
```

- [ ] **Step 5: Compose the new layout**

Update the JSX to a responsive grid:

```tsx
<div className="grid min-h-[calc(100dvh-14rem)] gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
  <div className="flex min-h-0 flex-col gap-4">
    <HistoryQueryToolbar ... />
    <div className="relative min-h-[420px] overflow-hidden rounded-xl border">
      {/* map */}
    </div>
    <HistoryMapSummaryStrip ... />
    <HistoryPlaybackBar ... />
  </div>
  <HistoryMissionSidebar ... />
</div>
```

On small screens, this same structure should collapse to a single column with the sidebar content below the map.

- [ ] **Step 6: Wire interaction between sidebar highlights and playback**

Use the `index` returned by `buildHistoryHighlights`:

```ts
function handleHighlightSelect(index: number) {
  setPlaying(false);
  setCurrentIndex(index);
}
```

Use the same handler for:
- clicking a highlight in the sidebar;
- clicking a stop marker on the map.

- [ ] **Step 7: Run lint and targeted helper tests**

Run: `cd web && npm run lint`
Expected: PASS

Run: `cd web && npm test -- history-player-utils`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add web/src/app/\(dashboard\)/history/page.tsx web/src/components/map/history-player.tsx
git commit -m "feat(web): integra painel operacional ao historico"
```

---

### Task 4: Upgrade map behavior, responsive states, and end-to-end verification

**Files:**
- Modify: `web/src/components/map/history-player.tsx`
- Modify: `web/src/components/map/history-map-controller.tsx`

- [ ] **Step 1: Extend `history-map-controller.tsx` to fit the full route on new searches**

Replace the single `center` prop with route-aware props:

```ts
export function HistoryMapController({
  center,
  bounds,
  fitVersion,
}: {
  center: [number, number] | null;
  bounds: [[number, number], [number, number]] | null;
  fitVersion: number;
}) { /* ... */ }
```

Behavior:
- when a new route is loaded, call `map.fitBounds(bounds, { padding: [32, 32] })`;
- during playback, keep centering on the current frame without resetting zoom;
- when positions are cleared, reset internal refs.

- [ ] **Step 2: Add route context markers in `history-player.tsx`**

Dynamically import `CircleMarker` from `react-leaflet` and render:
- start marker;
- end marker;
- stop/highlight markers.

Hook stop markers to the same highlight handler:

```tsx
<CircleMarker
  center={[highlight.latitude, highlight.longitude]}
  radius={6}
  pathOptions={{ color: "#f59e0b", fillColor: "#fbbf24", fillOpacity: 0.85 }}
  eventHandlers={{ click: () => handleHighlightSelect(highlight.index) }}
/>
```

- [ ] **Step 3: Finish the empty/loading/error visual states**

Ensure the new layout keeps structure in all cases:
- before search: neutral copy in the sidebar and map shell;
- loading: compact skeleton-like placeholders using existing muted surfaces;
- no results: contextual empty state inside the map card and sidebar;
- error: short inline message in the toolbar.

Do not collapse the entire map area into a single error paragraph.

- [ ] **Step 4: Run the full verification pass**

Run: `cd web && npm run lint`
Expected: PASS

Run: `cd web && npm test -- history-player-utils`
Expected: PASS

Run: `cd web && npm run build`
Expected: PASS with the history page compiling in production mode.

Then do a manual pass:

1. Run `make web-dev`
2. Open `/history`
3. Search a vehicle with route data
4. Confirm the route fits on first load
5. Confirm summary cards populate immediately
6. Confirm `1x/2x/4x/8x` change playback speed without resetting index
7. Confirm scrubber, sidebar highlight clicks, and stop-marker clicks stay synchronized
8. Confirm mobile-width layout keeps map first, summary second, detail third

- [ ] **Step 5: Commit**

```bash
git add web/src/components/map/history-player.tsx web/src/components/map/history-map-controller.tsx
git commit -m "feat(web): refina mapa e playback da tela de historico"
```
