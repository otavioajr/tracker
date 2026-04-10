# Dashboard Map UI Preferences Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persistir as preferências de UI do mapa no navegador por usuário autenticado, restaurando busca, filtro, painel desktop e toggles de `Mostrar rastro` sem reconstruir trilhas antigas.

**Architecture:** A persistência será cliente puro com `localStorage`, separada em duas camadas: um utilitário genérico para leitura/escrita segura de preferências e um contrato específico do mapa para normalizar defaults e montar a chave escopada por usuário. A página server do dashboard passa `user.id` para `DashboardMap`, que hidrata suas preferências em um `useEffect` inicial e só persiste alterações depois dessa hidratação para não sobrescrever valores já salvos.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, Testing Library, Supabase SSR

---

## File Structure

- Create: `web/src/lib/ui-preferences.ts`
  Responsabilidade: construir chaves versionadas de storage e encapsular leitura/escrita segura em `localStorage` com fallback e parse protegido.
- Create: `web/src/lib/ui-preferences.test.ts`
  Responsabilidade: cobrir chave versionada, fallback em storage vazio/JSON inválido e round-trip de persistência.
- Create: `web/src/lib/map/dashboard-map-preferences.ts`
  Responsabilidade: definir o contrato persistido do mapa, defaults, normalização de payload e wrappers de leitura/escrita por usuário.
- Create: `web/src/lib/map/dashboard-map-preferences.test.ts`
  Responsabilidade: validar normalização de valores inválidos e a composição da chave do mapa por usuário.
- Modify: `web/src/app/(dashboard)/page.tsx`
  Responsabilidade: obter `user.id` autenticado no servidor e passar para o componente cliente do mapa.
- Create: `web/src/app/(dashboard)/page.test.tsx`
  Responsabilidade: garantir que `page.tsx` passa `initialPositions` e `userId` corretos para `DashboardMap`.
- Modify: `web/src/app/(dashboard)/dashboard-map.tsx`
  Responsabilidade: hidratar preferências do mapa a partir do storage, persistir mudanças relevantes e manter a gaveta mobile fora da persistência.
- Modify: `web/src/app/(dashboard)/dashboard-map.test.tsx`
  Responsabilidade: validar hidratação, persistência, toggle de rastro restaurado sem pontos antigos e mobile sempre recolhido.

### Tipos e constantes a introduzir

```ts
export type DashboardMapUiPreferences = {
  searchQuery: string;
  statusFilter: DashboardVehicleFilter;
  desktopRailOpen: boolean;
  activeTrailDeviceIds: string[];
};

export const DASHBOARD_MAP_UI_PREFERENCES_DEFAULTS: DashboardMapUiPreferences = {
  searchQuery: "",
  statusFilter: "all",
  desktopRailOpen: true,
  activeTrailDeviceIds: [],
};
```

```ts
const UI_PREFERENCES_STORAGE_PREFIX = "tracker:ui-preferences";
const DASHBOARD_MAP_UI_PREFERENCES_VERSION = 1;
```

## Task 1: Utilitário genérico de preferências em `localStorage`

**Files:**
- Create: `web/src/lib/ui-preferences.ts`
- Test: `web/src/lib/ui-preferences.test.ts`

- [ ] **Step 1: Write the failing tests for the generic storage helpers**

```ts
// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import {
  buildUiPreferencesStorageKey,
  readStoredUiPreferences,
  writeStoredUiPreferences,
} from "./ui-preferences";

describe("ui-preferences", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("builds a versioned storage key scoped by feature and user", () => {
    expect(
      buildUiPreferencesStorageKey({
        scope: "dashboard-map",
        userId: "user-123",
        version: 1,
      }),
    ).toBe("tracker:ui-preferences:v1:dashboard-map:user-123");
  });

  it("returns the fallback when storage is empty or JSON is invalid", () => {
    const fallback = { searchQuery: "", desktopRailOpen: true };

    expect(
      readStoredUiPreferences({
        storageKey: "tracker:ui-preferences:v1:dashboard-map:user-123",
        fallback,
        normalize: (value) => value as typeof fallback,
      }),
    ).toEqual(fallback);

    window.localStorage.setItem(
      "tracker:ui-preferences:v1:dashboard-map:user-123",
      "{invalid-json",
    );

    expect(
      readStoredUiPreferences({
        storageKey: "tracker:ui-preferences:v1:dashboard-map:user-123",
        fallback,
        normalize: (value) => value as typeof fallback,
      }),
    ).toEqual(fallback);
  });

  it("writes raw values and reads them back through the normalizer", () => {
    writeStoredUiPreferences({
      storageKey: "tracker:ui-preferences:v1:dashboard-map:user-123",
      value: {
        searchQuery: "van",
        statusFilter: "stopped",
      },
    });

    const result = readStoredUiPreferences({
      storageKey: "tracker:ui-preferences:v1:dashboard-map:user-123",
      fallback: {
        searchQuery: "",
        statusFilter: "all",
      },
      normalize: (value) => {
        const payload = value as {
          searchQuery?: string;
          statusFilter?: string;
        };

        return {
          searchQuery: payload.searchQuery ?? "",
          statusFilter: payload.statusFilter ?? "all",
        };
      },
    });

    expect(result).toEqual({
      searchQuery: "van",
      statusFilter: "stopped",
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/otavioajr/Documents/Projetos/tracker/web && npm run test -- src/lib/ui-preferences.test.ts`

Expected: FAIL because `ui-preferences.ts` does not exist yet.

- [ ] **Step 3: Implement the generic `localStorage` helper module**

```ts
type BuildUiPreferencesStorageKeyOptions = {
  scope: string;
  userId: string;
  version: number;
};

type ReadStoredUiPreferencesOptions<T> = {
  storageKey: string;
  fallback: T;
  normalize: (value: unknown) => T;
};

type WriteStoredUiPreferencesOptions<T> = {
  storageKey: string;
  value: T;
};

const UI_PREFERENCES_STORAGE_PREFIX = "tracker:ui-preferences";

function getBrowserStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

export function buildUiPreferencesStorageKey({
  scope,
  userId,
  version,
}: BuildUiPreferencesStorageKeyOptions) {
  return `${UI_PREFERENCES_STORAGE_PREFIX}:v${version}:${scope}:${userId}`;
}

export function readStoredUiPreferences<T>({
  storageKey,
  fallback,
  normalize,
}: ReadStoredUiPreferencesOptions<T>) {
  const storage = getBrowserStorage();

  if (!storage) {
    return fallback;
  }

  const rawValue = storage.getItem(storageKey);

  if (!rawValue) {
    return fallback;
  }

  try {
    return normalize(JSON.parse(rawValue));
  } catch {
    return fallback;
  }
}

export function writeStoredUiPreferences<T>({
  storageKey,
  value,
}: WriteStoredUiPreferencesOptions<T>) {
  const storage = getBrowserStorage();

  if (!storage) {
    return;
  }

  storage.setItem(storageKey, JSON.stringify(value));
}
```

- [ ] **Step 4: Run the helper tests to verify they pass**

Run: `cd /Users/otavioajr/Documents/Projetos/tracker/web && npm run test -- src/lib/ui-preferences.test.ts`

Expected: PASS

- [ ] **Step 5: Commit the generic storage layer**

```bash
cd /Users/otavioajr/Documents/Projetos/tracker
git add web/src/lib/ui-preferences.ts \
  web/src/lib/ui-preferences.test.ts
git commit -m "feat: adiciona utilitarios de preferencias de ui"
```

## Task 2: Contrato persistido do mapa e normalização dos valores

**Files:**
- Create: `web/src/lib/map/dashboard-map-preferences.ts`
- Test: `web/src/lib/map/dashboard-map-preferences.test.ts`

- [ ] **Step 1: Write the failing tests for the map-specific preference contract**

```ts
// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import {
  DASHBOARD_MAP_UI_PREFERENCES_DEFAULTS,
  getDashboardMapUiPreferencesStorageKey,
  normalizeDashboardMapUiPreferences,
} from "./dashboard-map-preferences";

describe("dashboard-map-preferences", () => {
  it("creates a user-scoped storage key for the dashboard map", () => {
    expect(getDashboardMapUiPreferencesStorageKey("user-321")).toBe(
      "tracker:ui-preferences:v1:dashboard-map:user-321",
    );
  });

  it("falls back to safe defaults when the payload is missing or malformed", () => {
    expect(normalizeDashboardMapUiPreferences(null)).toEqual(
      DASHBOARD_MAP_UI_PREFERENCES_DEFAULTS,
    );

    expect(
      normalizeDashboardMapUiPreferences({
        searchQuery: 99,
        statusFilter: "unknown",
        desktopRailOpen: "yes",
        activeTrailDeviceIds: "truck-1",
      }),
    ).toEqual(DASHBOARD_MAP_UI_PREFERENCES_DEFAULTS);
  });

  it("keeps only valid values and string device ids", () => {
    expect(
      normalizeDashboardMapUiPreferences({
        searchQuery: "van",
        statusFilter: "stopped",
        desktopRailOpen: false,
        activeTrailDeviceIds: ["van-2", 12, "van-2", "truck-1"],
      }),
    ).toEqual({
      searchQuery: "van",
      statusFilter: "stopped",
      desktopRailOpen: false,
      activeTrailDeviceIds: ["van-2", "truck-1"],
    });
  });
});
```

- [ ] **Step 2: Run the map preference test to verify it fails**

Run: `cd /Users/otavioajr/Documents/Projetos/tracker/web && npm run test -- src/lib/map/dashboard-map-preferences.test.ts`

Expected: FAIL because `dashboard-map-preferences.ts` does not exist yet.

- [ ] **Step 3: Implement the map preference contract and wrappers**

```ts
import type { DashboardVehicleFilter } from "@/lib/map/dashboard-map-utils";
import {
  buildUiPreferencesStorageKey,
  readStoredUiPreferences,
  writeStoredUiPreferences,
} from "@/lib/ui-preferences";

export type DashboardMapUiPreferences = {
  searchQuery: string;
  statusFilter: DashboardVehicleFilter;
  desktopRailOpen: boolean;
  activeTrailDeviceIds: string[];
};

export const DASHBOARD_MAP_UI_PREFERENCES_DEFAULTS: DashboardMapUiPreferences = {
  searchQuery: "",
  statusFilter: "all",
  desktopRailOpen: true,
  activeTrailDeviceIds: [],
};

const DASHBOARD_MAP_UI_PREFERENCES_VERSION = 1;
const DASHBOARD_MAP_FILTER_VALUES: DashboardVehicleFilter[] = [
  "all",
  "moving",
  "stopped",
  "offline",
];

function isDashboardVehicleFilter(
  value: unknown,
): value is DashboardVehicleFilter {
  return DASHBOARD_MAP_FILTER_VALUES.includes(
    value as DashboardVehicleFilter,
  );
}

export function normalizeDashboardMapUiPreferences(
  value: unknown,
): DashboardMapUiPreferences {
  if (!value || typeof value !== "object") {
    return DASHBOARD_MAP_UI_PREFERENCES_DEFAULTS;
  }

  const candidate = value as Partial<DashboardMapUiPreferences>;

  return {
    searchQuery:
      typeof candidate.searchQuery === "string"
        ? candidate.searchQuery
        : DASHBOARD_MAP_UI_PREFERENCES_DEFAULTS.searchQuery,
    statusFilter: isDashboardVehicleFilter(candidate.statusFilter)
      ? candidate.statusFilter
      : DASHBOARD_MAP_UI_PREFERENCES_DEFAULTS.statusFilter,
    desktopRailOpen:
      typeof candidate.desktopRailOpen === "boolean"
        ? candidate.desktopRailOpen
        : DASHBOARD_MAP_UI_PREFERENCES_DEFAULTS.desktopRailOpen,
    activeTrailDeviceIds: Array.isArray(candidate.activeTrailDeviceIds)
      ? Array.from(
          new Set(
            candidate.activeTrailDeviceIds.filter(
              (deviceId): deviceId is string => typeof deviceId === "string",
            ),
          ),
        )
      : DASHBOARD_MAP_UI_PREFERENCES_DEFAULTS.activeTrailDeviceIds,
  };
}

export function getDashboardMapUiPreferencesStorageKey(userId: string) {
  return buildUiPreferencesStorageKey({
    scope: "dashboard-map",
    userId,
    version: DASHBOARD_MAP_UI_PREFERENCES_VERSION,
  });
}

export function readDashboardMapUiPreferences(userId: string) {
  return readStoredUiPreferences({
    storageKey: getDashboardMapUiPreferencesStorageKey(userId),
    fallback: DASHBOARD_MAP_UI_PREFERENCES_DEFAULTS,
    normalize: normalizeDashboardMapUiPreferences,
  });
}

export function writeDashboardMapUiPreferences(
  userId: string,
  value: DashboardMapUiPreferences,
) {
  writeStoredUiPreferences({
    storageKey: getDashboardMapUiPreferencesStorageKey(userId),
    value,
  });
}
```

- [ ] **Step 4: Run the map preference test to verify it passes**

Run: `cd /Users/otavioajr/Documents/Projetos/tracker/web && npm run test -- src/lib/map/dashboard-map-preferences.test.ts`

Expected: PASS

- [ ] **Step 5: Commit the dashboard map preference contract**

```bash
cd /Users/otavioajr/Documents/Projetos/tracker
git add web/src/lib/map/dashboard-map-preferences.ts \
  web/src/lib/map/dashboard-map-preferences.test.ts
git commit -m "feat: define contrato persistido do mapa"
```

## Task 3: Passar `user.id` do server component para o mapa

**Files:**
- Modify: `web/src/app/(dashboard)/page.tsx`
- Create: `web/src/app/(dashboard)/page.test.tsx`

- [ ] **Step 1: Write the failing page test for the `userId` prop**

```tsx
// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions/positions", () => ({
  getLatestPositions: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("./dashboard-map", () => ({
  DashboardMap: ({
    initialPositions,
    userId,
  }: {
    initialPositions: unknown[];
    userId: string;
  }) => (
    <div data-testid="dashboard-map">
      positions:{initialPositions.length} user:{userId}
    </div>
  ),
}));

import DashboardPage from "./page";
import { getLatestPositions } from "@/lib/actions/positions";
import { createClient } from "@/lib/supabase/server";

const mockedGetLatestPositions = vi.mocked(getLatestPositions);
const mockedCreateClient = vi.mocked(createClient);

describe("DashboardPage", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("passes the fetched positions and authenticated user id to DashboardMap", async () => {
    mockedGetLatestPositions.mockResolvedValue([
      { device_id: "truck-1" },
      { device_id: "van-2" },
    ] as never);
    mockedCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: "user-42",
            },
          },
          error: null,
        }),
      },
    } as never);

    const page = await DashboardPage();
    render(page);

    expect(screen.getByTestId("dashboard-map").textContent).toBe(
      "positions:2 user:user-42",
    );
  });
});
```

- [ ] **Step 2: Run the page test to verify it fails**

Run: `cd /Users/otavioajr/Documents/Projetos/tracker/web && npm run test -- src/app/'(dashboard)'/page.test.tsx`

Expected: FAIL because `DashboardPage` does not fetch the user or pass `userId` to `DashboardMap`.

- [ ] **Step 3: Update the dashboard page to fetch the authenticated user id**

```tsx
import { getLatestPositions } from "@/lib/actions/positions";
import { createClient } from "@/lib/supabase/server";
import { DashboardMap } from "./dashboard-map";

export default async function DashboardPage() {
  const positions = await getLatestPositions();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Não autenticado");
  }

  return (
    <div className="h-full -m-4 -mb-24 lg:-m-6 lg:-mb-6">
      <DashboardMap initialPositions={positions} userId={user.id} />
    </div>
  );
}
```

- [ ] **Step 4: Run the page test to verify it passes**

Run: `cd /Users/otavioajr/Documents/Projetos/tracker/web && npm run test -- src/app/'(dashboard)'/page.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit the server-to-client user scope**

```bash
cd /Users/otavioajr/Documents/Projetos/tracker
git add web/src/app/'(dashboard)'/page.tsx \
  web/src/app/'(dashboard)'/page.test.tsx
git commit -m "feat: repassa usuario autenticado para o mapa"
```

## Task 4: Hidratar e persistir as preferências no `DashboardMap`

**Files:**
- Modify: `web/src/app/(dashboard)/dashboard-map.tsx`
- Modify: `web/src/app/(dashboard)/dashboard-map.test.tsx`

- [ ] **Step 1: Write the failing dashboard tests for hydration and persistence**

Add these imports near the top of `web/src/app/(dashboard)/dashboard-map.test.tsx`:

```tsx
import { waitFor } from "@testing-library/react";
import { getDashboardMapUiPreferencesStorageKey } from "@/lib/map/dashboard-map-preferences";
```

Add a trail points readout to `TrackingMapStub`:

```tsx
<span>
  trailPoints:
  {trails?.map((trail) => `${trail.deviceId}:${trail.points.length}`).join(",") || "none"}
</span>
```

Add cleanup for storage:

```tsx
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});
```

Add these tests:

```tsx
it("hydrates saved ui preferences without reopening the mobile sheet", async () => {
  window.localStorage.setItem(
    getDashboardMapUiPreferencesStorageKey("user-1"),
    JSON.stringify({
      searchQuery: "van",
      statusFilter: "stopped",
      desktopRailOpen: false,
      activeTrailDeviceIds: ["van-2"],
    }),
  );

  render(<DashboardMap initialPositions={positions} userId="user-1" />);

  await waitFor(() => {
    expect(
      (screen.getByPlaceholderText("Buscar veículo") as HTMLInputElement).value,
    ).toBe("van");
  });

  expect(screen.getByRole("button", { name: "Parados" }).className).toContain(
    "bg-white/12",
  );
  expect(screen.getByRole("button", { name: "Abrir painel do mapa" })).toBeTruthy();
  expect(getMobileSheet()?.dataset.state).toBe("collapsed");
  expect(
    (
      await screen.findAllByRole("switch", {
        name: /mostrar rastro do Van 02/i,
      })
    )[0].getAttribute("aria-checked"),
  ).toBe("true");
  expect(await screen.findByText("trailPoints:van-2:0")).toBeTruthy();
});

it("persists search, filter, desktop rail and active trails under the user storage key", async () => {
  render(<DashboardMap initialPositions={positions} userId="user-1" />);

  fireEvent.change(screen.getByPlaceholderText("Buscar veículo"), {
    target: { value: "van" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Parados" }));
  fireEvent.click(screen.getByRole("button", { name: "Recolher painel do mapa" }));
  fireEvent.click(
    (
      await screen.findAllByRole("switch", {
        name: /mostrar rastro do Van 02/i,
      })
    )[0],
  );

  await waitFor(() => {
    expect(
      JSON.parse(
        window.localStorage.getItem(
          getDashboardMapUiPreferencesStorageKey("user-1"),
        ) ?? "null",
      ),
    ).toEqual({
      searchQuery: "van",
      statusFilter: "stopped",
      desktopRailOpen: false,
      activeTrailDeviceIds: ["van-2"],
    });
  });
});
```

Update every existing render in the same file from:

```tsx
render(<DashboardMap initialPositions={positions} />);
```

to:

```tsx
render(<DashboardMap initialPositions={positions} userId="user-1" />);
```

- [ ] **Step 2: Run the dashboard test to verify it fails**

Run: `cd /Users/otavioajr/Documents/Projetos/tracker/web && npm run test -- src/app/'(dashboard)'/dashboard-map.test.tsx`

Expected: FAIL because `DashboardMap` does not accept `userId`, does not read storage and does not persist preference changes.

- [ ] **Step 3: Extend the `DashboardMap` props and reducer to support hydration**

Update the props type:

```tsx
type DashboardMapProps = {
  initialPositions: VehiclePosition[];
  userId: string;
};
```

Add a new reducer action:

```tsx
type DashboardTrailAction =
  | {
      type: "toggle";
      deviceId: string;
      currentServerTime?: string;
    }
  | {
      type: "ingest";
      positions: VehiclePosition[];
    }
  | {
      type: "hydrate";
      activeTrailDeviceIds: string[];
    };
```

Handle the new action before `toggle`:

```tsx
if (action.type === "hydrate") {
  return {
    activeTrailDeviceIds: new Set(action.activeTrailDeviceIds),
    trailCursors: {},
    trails: {},
  };
}
```

- [ ] **Step 4: Hydrate the persisted preferences on mount and guard the first write**

Add the new imports:

```tsx
import {
  readDashboardMapUiPreferences,
  writeDashboardMapUiPreferences,
} from "@/lib/map/dashboard-map-preferences";
```

Add a hydration flag:

```tsx
const [preferencesHydrated, setPreferencesHydrated] = useState(false);
```

Add the hydration effect right after the state declarations:

```tsx
useEffect(() => {
  const preferences = readDashboardMapUiPreferences(userId);

  setSearchQuery(preferences.searchQuery);
  setStatusFilter(preferences.statusFilter);
  setDesktopRailOpen(preferences.desktopRailOpen);
  dispatchTrailState({
    type: "hydrate",
    activeTrailDeviceIds: preferences.activeTrailDeviceIds,
  });
  setMobileSheetState("collapsed");
  setPreferencesHydrated(true);
}, [userId]);
```

Add the persistence effect after the realtime ingest effect:

```tsx
useEffect(() => {
  if (!preferencesHydrated) {
    return;
  }

  writeDashboardMapUiPreferences(userId, {
    searchQuery,
    statusFilter,
    desktopRailOpen,
    activeTrailDeviceIds: Array.from(trailState.activeTrailDeviceIds),
  });
}, [
  desktopRailOpen,
  preferencesHydrated,
  searchQuery,
  statusFilter,
  trailState.activeTrailDeviceIds,
  userId,
]);
```

This guard is mandatory: sem `preferencesHydrated`, o primeiro render com defaults sobrescreve o valor salvo no storage antes da leitura acontecer.

- [ ] **Step 5: Keep trail points ephemeral while restoring active toggles**

Do not add any storage code for `trailCursors` or `trails`.

The only trail persistence should stay here:

```tsx
writeDashboardMapUiPreferences(userId, {
  searchQuery,
  statusFilter,
  desktopRailOpen,
  activeTrailDeviceIds: Array.from(trailState.activeTrailDeviceIds),
});
```

And the hydrated reducer state must continue resetting points and cursors:

```tsx
if (action.type === "hydrate") {
  return {
    activeTrailDeviceIds: new Set(action.activeTrailDeviceIds),
    trailCursors: {},
    trails: {},
  };
}
```

That is the behavior that guarantees `Mostrar rastro` volta marcado sem reconstruir a linha anterior.

- [ ] **Step 6: Run the dashboard test to verify it passes**

Run: `cd /Users/otavioajr/Documents/Projetos/tracker/web && npm run test -- src/app/'(dashboard)'/dashboard-map.test.tsx`

Expected: PASS

- [ ] **Step 7: Run the focused regression suite**

Run: `cd /Users/otavioajr/Documents/Projetos/tracker/web && npm run test -- src/lib/ui-preferences.test.ts src/lib/map/dashboard-map-preferences.test.ts src/app/'(dashboard)'/page.test.tsx src/app/'(dashboard)'/dashboard-map.test.tsx`

Expected: PASS with all four test files green.

- [ ] **Step 8: Commit the persisted dashboard behavior**

```bash
cd /Users/otavioajr/Documents/Projetos/tracker
git add web/src/app/'(dashboard)'/dashboard-map.tsx \
  web/src/app/'(dashboard)'/dashboard-map.test.tsx
git commit -m "feat: persiste preferencias do mapa no navegador"
```

## Task 5: Verificação manual final

**Files:**
- Modify: none
- Test: browser/manual flow on `web`

- [ ] **Step 1: Start the web app**

Run: `cd /Users/otavioajr/Documents/Projetos/tracker/web && npm run dev`

Expected: Next.js dev server starts without TypeScript or runtime errors.

- [ ] **Step 2: Verify the persisted browser flow manually**

Exercise this exact flow:

1. Open the dashboard map authenticated as one user.
2. Change the search to `van`.
3. Click `Parados`.
4. Collapse the desktop rail.
5. Enable `Mostrar rastro` for `Van 02`.
6. Reload the page.

Expected:

- search stays as `van`;
- `Parados` remains the active filter;
- desktop rail stays collapsed and shows the `Abrir painel do mapa` button;
- `Mostrar rastro` for `Van 02` stays on;
- the map starts with the trail active but with zero restored points from the previous session;
- the mobile sheet still starts collapsed.

- [ ] **Step 3: Verify user isolation**

Repeat the same browser flow with a second authenticated user in the same browser session.

Expected:

- the second user does not inherit the first user’s saved preferences;
- each user reads and writes its own `localStorage` key.

- [ ] **Step 4: Record the final verification result in the work summary**

Include:

- test commands executed;
- manual flow checked;
- whether any follow-up remains for applying the same pattern to other dashboard pages.

## Self-Review

### Spec coverage

- Busca persistida: coberta em Task 4.
- Filtro de status persistido: coberta em Task 4.
- Painel desktop aberto/fechado persistido: coberta em Task 4.
- `Mostrar rastro` persistido só como toggle ativo: coberta em Tasks 2 e 4.
- Chave por usuário autenticado: coberta em Tasks 2 e 3.
- Mobile sempre recolhido: coberta em Task 4 e verificação manual final.
- Payload inválido/JSON quebrado com fallback seguro: coberta em Tasks 1 e 2.

### Placeholder scan

- Nenhum `TODO`, `TBD` ou “implementar depois”.
- Todos os passos de código têm arquivos, snippets e comandos de teste explícitos.

### Type consistency

- `DashboardMapUiPreferences`, `DashboardVehicleFilter`, `readDashboardMapUiPreferences` e `writeDashboardMapUiPreferences` usam os mesmos nomes ao longo de todo o plano.
- `userId` é o prop único da página server para o mapa em todas as tarefas.
