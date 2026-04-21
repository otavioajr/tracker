# Geocercas (Geofences) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar frontend completo da feature de geocercas — CRUD de geocercas (polígono, retângulo, círculo exato), desenho/edição visual com Geoman, renderização como camada opcional no mapa principal.

**Architecture:** Migration aditiva em PostGIS (shape_type + center + radius_m). Server Actions Next.js consumidas por páginas dedicadas em `/geofences/*`. Editor baseado em `@geoman-io/leaflet-geoman-free` com fluxo híbrido (mapa grande → dialog de meta). Layer read-only integrada ao `LayersControl` nativo do Leaflet no mapa principal, com estado persistido em `dashboardMapPreferences`.

**Tech Stack:** Next.js 16 (App Router + Server Actions), React 19, TypeScript, Tailwind + Shadcn UI, Leaflet + react-leaflet, `@geoman-io/leaflet-geoman-free`, `@turf/circle`, Supabase PostgreSQL + PostGIS, Vitest, Drizzle ORM.

**Spec de referência:** `docs/superpowers/specs/2026-04-21-geocercas-design.md`

---

## Visão Geral de Arquivos

### Novos
- `supabase/migrations/20260421120000_geofences_shape_type.sql`
- `web/src/lib/geofences/types.ts`
- `web/src/lib/geofences/shape-utils.ts`
- `web/src/lib/geofences/shape-utils.test.ts`
- `web/src/lib/actions/geofences.test.ts`
- `web/src/components/geofences/geofence-dialog.tsx`
- `web/src/components/geofences/geofence-editor.tsx`
- `web/src/components/geofences/geofence-editor-map.tsx`
- `web/src/components/geofences/geofence-layer.tsx`
- `web/src/components/map/overlay-listener.tsx`
- `web/src/app/(dashboard)/geofences/new/page.tsx`
- `web/src/app/(dashboard)/geofences/[id]/edit-shape/page.tsx`

### Modificados
- `web/src/lib/actions/geofences.ts` — expandir com `getGeofence`, `createGeofence`, `updateGeofenceMeta`, `updateGeofenceShape`
- `web/src/components/geofences/geofence-table.tsx` — reescrita com edição inline + link "Editar forma" + correção do bug `"exclusao"` → `"exclusion"`
- `web/src/app/(dashboard)/geofences/page.tsx` — header com botão "Nova geocerca"
- `web/src/lib/map/dashboard-map-preferences.ts` — novo campo `showGeofences`
- `web/src/lib/map/dashboard-map-preferences.test.ts` — testes do novo campo
- `web/src/components/map/tracking-map.tsx` — nova prop `geofences`, `showGeofences`, `onShowGeofencesChange`; integra `<LayersControl.Overlay>` + `<OverlayListener>` + `<GeofenceLayer>`
- `web/src/app/(dashboard)/dashboard-map.tsx` — busca inicial de geofences, estado `showGeofences`, propaga para `TrackingMap`
- `web/src/app/(dashboard)/page.tsx` — fetch inicial de `getGeofences()`
- `web/package.json` — adiciona `@geoman-io/leaflet-geoman-free` e `@turf/circle`

---

## Task 1: Migration — shape_type, center, radius_m

**Files:**
- Create: `supabase/migrations/20260421120000_geofences_shape_type.sql`
- Modify: `web/src/types/database.ts` (regenerado)

- [ ] **Step 1: Criar arquivo de migration**

Create `supabase/migrations/20260421120000_geofences_shape_type.sql`:

```sql
-- Geocercas: suporte a múltiplas formas (polygon, rectangle, circle)
-- Mantém `area GEOMETRY(POLYGON)` obrigatório para todos os tipos.
-- Círculos adicionalmente guardam `center` (POINT) e `radius_m` exatos para render fiel no UI.

CREATE TYPE geofence_shape AS ENUM ('polygon', 'rectangle', 'circle');

ALTER TABLE geofences
  ADD COLUMN shape_type geofence_shape NOT NULL DEFAULT 'polygon',
  ADD COLUMN center GEOMETRY(POINT, 4326),
  ADD COLUMN radius_m NUMERIC(10, 2);

ALTER TABLE geofences
  ADD CONSTRAINT geofences_circle_consistency CHECK (
    (shape_type = 'circle' AND center IS NOT NULL AND radius_m IS NOT NULL AND radius_m > 0)
    OR (shape_type <> 'circle' AND center IS NULL AND radius_m IS NULL)
  );

COMMENT ON COLUMN geofences.shape_type IS 'Tipo da forma desenhada; "rectangle" e "polygon" guardam apenas area, "circle" também guarda center e radius_m.';
COMMENT ON COLUMN geofences.center IS 'Centro do círculo em EPSG:4326. NULL quando shape_type != circle.';
COMMENT ON COLUMN geofences.radius_m IS 'Raio do círculo em metros. NULL quando shape_type != circle.';

-- View com geometrias serializadas como GeoJSON para o frontend consumir sem parser WKT/WKB.
CREATE OR REPLACE VIEW geofences_geojson
WITH (security_invoker = true) AS
SELECT
  id,
  tenant_id,
  name,
  type,
  active,
  shape_type,
  radius_m,
  ST_AsGeoJSON(area)::jsonb AS area,
  CASE WHEN center IS NULL THEN NULL ELSE ST_AsGeoJSON(center)::jsonb END AS center,
  created_at,
  updated_at
FROM geofences;

COMMENT ON VIEW geofences_geojson IS 'Geocercas com area e center como GeoJSON JSONB — usada pelo frontend. RLS herda da tabela base via security_invoker.';
```

- [ ] **Step 2: Aplicar migration localmente**

Run: `make db-push`
Expected: output "Applied migration 20260421120000_geofences_shape_type.sql" (ou similar da CLI). Sem erro.

- [ ] **Step 3: Regenerar types TypeScript**

Run: `make db-types`
Expected: `web/src/types/database.ts` atualizado com `geofence_shape` enum e novas colunas `shape_type`, `center`, `radius_m` em `geofences`.

- [ ] **Step 4: Verificar migration no banco**

Run: `cd supabase && supabase db remote changes 2>/dev/null || echo "skip"` (best-effort). Em seguida, inspecionar o schema via SQL editor ou `psql` usando `\d geofences` garantindo que as 3 novas colunas e o CHECK constraint existem.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260421120000_geofences_shape_type.sql web/src/types/database.ts
git commit -m "feat(db): geofences ganham shape_type, center e radius_m para círculo exato"
```

---

## Task 2: Instalar dependências

**Files:**
- Modify: `web/package.json`, `web/package-lock.json`

- [ ] **Step 1: Adicionar dependências**

Run: `cd web && npm install @geoman-io/leaflet-geoman-free @turf/circle`
Expected: pacotes instalados, `package.json` atualizado.

- [ ] **Step 2: Verificar versões instaladas**

Run: `cd web && npm ls @geoman-io/leaflet-geoman-free @turf/circle`
Expected: versões concretas listadas (ex: geoman `^2.x`, `@turf/circle` `^7.x`).

- [ ] **Step 3: Type check**

Run: `cd web && npx tsc --noEmit`
Expected: sem erros (pacotes trazem seus próprios tipos ou não são usados ainda).

- [ ] **Step 4: Commit**

```bash
git add web/package.json web/package-lock.json
git commit -m "chore(web): adiciona @geoman-io/leaflet-geoman-free e @turf/circle"
```

---

## Task 3: Tipos e utilitários de forma (TDD)

**Files:**
- Create: `web/src/lib/geofences/types.ts`
- Create: `web/src/lib/geofences/shape-utils.ts`
- Test: `web/src/lib/geofences/shape-utils.test.ts`

- [ ] **Step 1: Criar arquivo de tipos**

Create `web/src/lib/geofences/types.ts`:

```ts
import type { Database } from "@/types/database";

// Row da tabela base (mantida para contextos que lidam com WKB).
export type GeofenceTableRow = Database["public"]["Tables"]["geofences"]["Row"];

// Row da view que retorna `area` e `center` como GeoJSON JSONB — usada pelo frontend.
// Após `make db-types`, esse tipo vem gerado em `Database["public"]["Views"]["geofences_geojson"]["Row"]`.
export type GeofenceRow = Database["public"]["Views"]["geofences_geojson"]["Row"];

export type GeofenceType = Database["public"]["Enums"]["geofence_type"]; // 'inclusion' | 'exclusion'
export type GeofenceShape = Database["public"]["Enums"]["geofence_shape"]; // 'polygon' | 'rectangle' | 'circle'

export type LngLat = [number, number];

export type ShapeInput =
  | { kind: "polygon"; coordinates: LngLat[] }
  | { kind: "rectangle"; coordinates: LngLat[] }
  | { kind: "circle"; center: LngLat; radiusM: number; polygon: LngLat[] };

export type GeofenceMeta = {
  name: string;
  type: GeofenceType;
  active: boolean;
};
```

- [ ] **Step 2: Escrever testes falhando**

Create `web/src/lib/geofences/shape-utils.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  circleToPolygon,
  validatePolygonCoords,
  validateRadiusMeters,
  polygonToWkt,
  pointToWkt,
  isClosedRing,
} from "./shape-utils";

describe("shape-utils", () => {
  describe("circleToPolygon", () => {
    it("gera anel fechado com 65 pontos por default (64 lados + fechamento)", () => {
      const poly = circleToPolygon({ center: [-46.63, -23.55], radiusM: 500 });
      expect(poly).toHaveLength(65);
      expect(poly[0]).toEqual(poly[64]);
    });

    it("respeita o parâmetro steps", () => {
      const poly = circleToPolygon({ center: [-46.63, -23.55], radiusM: 500, steps: 32 });
      expect(poly).toHaveLength(33);
    });

    it("produz raio aproximado correto em metros (tolerância 5%)", () => {
      const poly = circleToPolygon({ center: [0, 0], radiusM: 1000 });
      // pontos devem estar a ~1000m da origem; aproximação em [lng,lat] → usa 111320m/grau de latitude
      const [lng, lat] = poly[0];
      const distanceMeters = Math.sqrt(
        Math.pow(lng * 111320 * Math.cos(0), 2) + Math.pow(lat * 111320, 2)
      );
      expect(distanceMeters).toBeGreaterThan(950);
      expect(distanceMeters).toBeLessThan(1050);
    });
  });

  describe("isClosedRing", () => {
    it("true quando primeiro igual ao último", () => {
      expect(isClosedRing([[0, 0], [1, 0], [1, 1], [0, 0]])).toBe(true);
    });

    it("false quando não fechado", () => {
      expect(isClosedRing([[0, 0], [1, 0], [1, 1]])).toBe(false);
    });
  });

  describe("validatePolygonCoords", () => {
    it("aceita polígono válido fechado", () => {
      expect(
        validatePolygonCoords([[0, 0], [1, 0], [1, 1], [0, 0]])
      ).toEqual({ ok: true });
    });

    it("rejeita menos de 4 pontos (3 distintos + fechamento)", () => {
      expect(
        validatePolygonCoords([[0, 0], [1, 0], [0, 0]])
      ).toEqual({ ok: false, error: "Polígono precisa de pelo menos 3 vértices distintos." });
    });

    it("rejeita polígono não fechado", () => {
      expect(
        validatePolygonCoords([[0, 0], [1, 0], [1, 1], [0, 1]])
      ).toEqual({ ok: false, error: "Polígono precisa estar fechado (primeiro e último ponto iguais)." });
    });

    it("rejeita coordenadas fora do range", () => {
      expect(
        validatePolygonCoords([[200, 0], [201, 0], [201, 1], [200, 0]])
      ).toEqual({ ok: false, error: "Coordenadas fora do intervalo válido." });
    });
  });

  describe("validateRadiusMeters", () => {
    it("aceita raio positivo dentro do limite", () => {
      expect(validateRadiusMeters(500)).toEqual({ ok: true });
    });

    it("rejeita raio zero", () => {
      expect(validateRadiusMeters(0)).toEqual({
        ok: false,
        error: "Raio precisa ser maior que zero.",
      });
    });

    it("rejeita raio negativo", () => {
      expect(validateRadiusMeters(-10)).toEqual({
        ok: false,
        error: "Raio precisa ser maior que zero.",
      });
    });

    it("rejeita raio acima de 100km", () => {
      expect(validateRadiusMeters(100001)).toEqual({
        ok: false,
        error: "Raio máximo é 100000 metros.",
      });
    });
  });

  describe("polygonToWkt", () => {
    it("gera WKT POLYGON válido", () => {
      const wkt = polygonToWkt([[-46.63, -23.55], [-46.62, -23.55], [-46.62, -23.54], [-46.63, -23.55]]);
      expect(wkt).toBe("POLYGON((-46.63 -23.55, -46.62 -23.55, -46.62 -23.54, -46.63 -23.55))");
    });
  });

  describe("pointToWkt", () => {
    it("gera WKT POINT válido", () => {
      expect(pointToWkt([-46.63, -23.55])).toBe("POINT(-46.63 -23.55)");
    });
  });
});
```

- [ ] **Step 3: Rodar testes (devem falhar)**

Run: `cd web && npx vitest run src/lib/geofences/shape-utils.test.ts`
Expected: FAIL com "Cannot find module './shape-utils'".

- [ ] **Step 4: Implementar shape-utils**

Create `web/src/lib/geofences/shape-utils.ts`:

```ts
import circle from "@turf/circle";
import type { LngLat } from "./types";

type CircleInput = { center: LngLat; radiusM: number; steps?: number };

export function circleToPolygon({ center, radiusM, steps = 64 }: CircleInput): LngLat[] {
  const feature = circle(center, radiusM / 1000, { steps, units: "kilometers" });
  const coords = feature.geometry.coordinates[0] as LngLat[];
  return coords;
}

export function isClosedRing(coords: LngLat[]): boolean {
  if (coords.length < 2) return false;
  const first = coords[0];
  const last = coords[coords.length - 1];
  return first[0] === last[0] && first[1] === last[1];
}

type ValidationResult = { ok: true } | { ok: false; error: string };

export function validatePolygonCoords(coords: LngLat[]): ValidationResult {
  if (coords.length < 4) {
    return { ok: false, error: "Polígono precisa de pelo menos 3 vértices distintos." };
  }
  if (!isClosedRing(coords)) {
    return { ok: false, error: "Polígono precisa estar fechado (primeiro e último ponto iguais)." };
  }
  for (const [lng, lat] of coords) {
    if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
      return { ok: false, error: "Coordenadas fora do intervalo válido." };
    }
  }
  return { ok: true };
}

export function validateRadiusMeters(radiusM: number): ValidationResult {
  if (!(radiusM > 0)) {
    return { ok: false, error: "Raio precisa ser maior que zero." };
  }
  if (radiusM > 100_000) {
    return { ok: false, error: "Raio máximo é 100000 metros." };
  }
  return { ok: true };
}

function formatCoord(value: number): string {
  return String(Number(value.toFixed(8)));
}

export function polygonToWkt(coords: LngLat[]): string {
  const inner = coords.map(([lng, lat]) => `${formatCoord(lng)} ${formatCoord(lat)}`).join(", ");
  return `POLYGON((${inner}))`;
}

export function pointToWkt([lng, lat]: LngLat): string {
  return `POINT(${formatCoord(lng)} ${formatCoord(lat)})`;
}
```

- [ ] **Step 5: Rodar testes (devem passar)**

Run: `cd web && npx vitest run src/lib/geofences/shape-utils.test.ts`
Expected: PASS — todos os testes verdes.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/geofences/
git commit -m "feat(web): utilitários puros e tipos para formas de geocerca"
```

---

## Task 4: Helpers puros de payload + Server Actions

**Files:**
- Create: `web/src/lib/geofences/payload.ts`
- Create: `web/src/lib/geofences/payload.test.ts`
- Modify: `web/src/lib/actions/geofences.ts`

**Nota:** Arquivos com `"use server"` (como `geofences.ts`) não podem exportar helpers síncronos (o Next.js força tudo a ser server action). Por isso, os validadores + builders de payload ficam em `payload.ts` (arquivo puro, sem `"use server"`) e `geofences.ts` importa deles.

- [ ] **Step 1: Escrever testes falhando**

Create `web/src/lib/geofences/payload.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildGeofenceInsertPayload, normalizeMetaInput } from "./payload";

describe("buildGeofenceInsertPayload", () => {
  const tenantId = "00000000-0000-0000-0000-000000000001";

  it("polygon: grava area e deixa center/radius null", () => {
    const payload = buildGeofenceInsertPayload({
      tenantId,
      input: {
        name: "Garagem",
        type: "inclusion",
        active: true,
        shape: {
          kind: "polygon",
          coordinates: [
            [-46.63, -23.55],
            [-46.62, -23.55],
            [-46.62, -23.54],
            [-46.63, -23.55],
          ],
        },
      },
    });
    expect(payload).toEqual({
      tenant_id: tenantId,
      name: "Garagem",
      type: "inclusion",
      active: true,
      shape_type: "polygon",
      area: "POLYGON((-46.63 -23.55, -46.62 -23.55, -46.62 -23.54, -46.63 -23.55))",
      center: null,
      radius_m: null,
    });
  });

  it("rectangle: mesma estrutura com shape_type='rectangle'", () => {
    const payload = buildGeofenceInsertPayload({
      tenantId,
      input: {
        name: "Pátio",
        type: "exclusion",
        active: false,
        shape: {
          kind: "rectangle",
          coordinates: [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0],
          ],
        },
      },
    });
    expect(payload.shape_type).toBe("rectangle");
    expect(payload.area).toBe("POLYGON((0 0, 1 0, 1 1, 0 1, 0 0))");
    expect(payload.center).toBeNull();
    expect(payload.radius_m).toBeNull();
  });

  it("circle: grava area (polígono), center WKT e radius_m", () => {
    const payload = buildGeofenceInsertPayload({
      tenantId,
      input: {
        name: "Raio 1km",
        type: "inclusion",
        active: true,
        shape: {
          kind: "circle",
          center: [-46.63, -23.55],
          radiusM: 1000,
          polygon: [
            [-46.62, -23.55],
            [-46.63, -23.54],
            [-46.64, -23.55],
            [-46.63, -23.56],
            [-46.62, -23.55],
          ],
        },
      },
    });
    expect(payload.shape_type).toBe("circle");
    expect(payload.center).toBe("POINT(-46.63 -23.55)");
    expect(payload.radius_m).toBe(1000);
    expect(payload.area.startsWith("POLYGON((")).toBe(true);
  });

  it("normalizeMetaInput: trim name e aceita apenas campos suportados", () => {
    expect(normalizeMetaInput({ name: "  A  ", type: "inclusion", active: true })).toEqual({
      name: "A",
      type: "inclusion",
      active: true,
    });
  });

  it("rejeita nome vazio", () => {
    expect(() =>
      buildGeofenceInsertPayload({
        tenantId,
        input: {
          name: "   ",
          type: "inclusion",
          active: true,
          shape: { kind: "polygon", coordinates: [[0, 0], [1, 0], [1, 1], [0, 0]] },
        },
      })
    ).toThrow(/Nome/);
  });

  it("rejeita nome >100 chars", () => {
    const longName = "a".repeat(101);
    expect(() =>
      buildGeofenceInsertPayload({
        tenantId,
        input: {
          name: longName,
          type: "inclusion",
          active: true,
          shape: { kind: "polygon", coordinates: [[0, 0], [1, 0], [1, 1], [0, 0]] },
        },
      })
    ).toThrow(/100/);
  });
});
```

- [ ] **Step 2: Rodar testes (devem falhar)**

Run: `cd web && npx vitest run src/lib/geofences/payload.test.ts`
Expected: FAIL com "Cannot find module './payload'".

- [ ] **Step 3: Implementar `payload.ts`**

Create `web/src/lib/geofences/payload.ts`:

```ts
import {
  polygonToWkt,
  pointToWkt,
  validatePolygonCoords,
  validateRadiusMeters,
} from "./shape-utils";
import type { GeofenceMeta, GeofenceType, ShapeInput } from "./types";

export type CreateGeofenceInput = GeofenceMeta & { shape: ShapeInput };
export type UpdateGeofenceMetaInput = Partial<GeofenceMeta>;

function assertName(raw: string): string {
  const name = raw.trim();
  if (name.length === 0) throw new Error("Nome da geocerca é obrigatório.");
  if (name.length > 100) throw new Error("Nome da geocerca deve ter no máximo 100 caracteres.");
  return name;
}

function assertType(type: GeofenceType): GeofenceType {
  if (type !== "inclusion" && type !== "exclusion") throw new Error("Tipo de geocerca inválido.");
  return type;
}

function assertShape(shape: ShapeInput): void {
  if (shape.kind === "polygon" || shape.kind === "rectangle") {
    const res = validatePolygonCoords(shape.coordinates);
    if (!res.ok) throw new Error(res.error);
    return;
  }
  const radiusRes = validateRadiusMeters(shape.radiusM);
  if (!radiusRes.ok) throw new Error(radiusRes.error);
  const polyRes = validatePolygonCoords(shape.polygon);
  if (!polyRes.ok) throw new Error(polyRes.error);
}

export function normalizeMetaInput(input: UpdateGeofenceMetaInput): UpdateGeofenceMetaInput {
  const out: UpdateGeofenceMetaInput = {};
  if (input.name !== undefined) out.name = assertName(input.name);
  if (input.type !== undefined) out.type = assertType(input.type);
  if (input.active !== undefined) out.active = Boolean(input.active);
  return out;
}

export type InsertPayload = {
  tenant_id: string;
  name: string;
  type: GeofenceType;
  active: boolean;
  shape_type: ShapeInput["kind"];
  area: string;
  center: string | null;
  radius_m: number | null;
};

export function buildGeofenceInsertPayload(args: {
  tenantId: string;
  input: CreateGeofenceInput;
}): InsertPayload {
  const { tenantId, input } = args;
  const name = assertName(input.name);
  const type = assertType(input.type);
  assertShape(input.shape);

  if (input.shape.kind === "circle") {
    return {
      tenant_id: tenantId,
      name,
      type,
      active: input.active,
      shape_type: "circle",
      area: polygonToWkt(input.shape.polygon),
      center: pointToWkt(input.shape.center),
      radius_m: input.shape.radiusM,
    };
  }

  return {
    tenant_id: tenantId,
    name,
    type,
    active: input.active,
    shape_type: input.shape.kind,
    area: polygonToWkt(input.shape.coordinates),
    center: null,
    radius_m: null,
  };
}

export type ShapeUpdatePayload = {
  shape_type: ShapeInput["kind"];
  area: string;
  center: string | null;
  radius_m: number | null;
};

export function buildShapeUpdatePayload(shape: ShapeInput): ShapeUpdatePayload {
  assertShape(shape);
  if (shape.kind === "circle") {
    return {
      shape_type: "circle",
      area: polygonToWkt(shape.polygon),
      center: pointToWkt(shape.center),
      radius_m: shape.radiusM,
    };
  }
  return {
    shape_type: shape.kind,
    area: polygonToWkt(shape.coordinates),
    center: null,
    radius_m: null,
  };
}
```

- [ ] **Step 4: Rodar testes (devem passar)**

Run: `cd web && npx vitest run src/lib/geofences/payload.test.ts`
Expected: PASS — todos os testes verdes.

- [ ] **Step 5: Criar `geofences.ts` (server actions) importando de `payload.ts`**

Replace `web/src/lib/actions/geofences.ts`:

```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getTenantId } from "./utils";
import {
  buildGeofenceInsertPayload,
  buildShapeUpdatePayload,
  normalizeMetaInput,
  type CreateGeofenceInput,
  type UpdateGeofenceMetaInput,
} from "@/lib/geofences/payload";
import type { GeofenceRow, ShapeInput } from "@/lib/geofences/types";

export async function getGeofences(): Promise<GeofenceRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("geofences_geojson")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as GeofenceRow[];
}

export async function getGeofence(id: string): Promise<GeofenceRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("geofences_geojson")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as unknown as GeofenceRow | null;
}

export async function createGeofence(
  input: CreateGeofenceInput
): Promise<{ id: string } | { error: string }> {
  try {
    const supabase = await createClient();
    const tenantId = await getTenantId();
    const payload = buildGeofenceInsertPayload({ tenantId, input });

    const { data, error } = await supabase
      .from("geofences")
      .insert(payload as never)
      .select("id")
      .single();

    if (error) return { error: error.message };

    revalidatePath("/geofences");
    revalidatePath("/");
    return { id: (data as { id: string }).id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erro desconhecido" };
  }
}

export async function updateGeofenceMeta(
  id: string,
  input: UpdateGeofenceMetaInput
): Promise<{ ok: true } | { error: string }> {
  try {
    const payload = normalizeMetaInput(input);
    if (Object.keys(payload).length === 0) return { ok: true };

    const supabase = await createClient();
    const { error } = await supabase.from("geofences").update(payload).eq("id", id);
    if (error) return { error: error.message };

    revalidatePath("/geofences");
    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erro desconhecido" };
  }
}

export async function updateGeofenceShape(
  id: string,
  shape: ShapeInput
): Promise<{ ok: true } | { error: string }> {
  try {
    const payload = buildShapeUpdatePayload(shape);
    const supabase = await createClient();
    const { error } = await supabase.from("geofences").update(payload as never).eq("id", id);
    if (error) return { error: error.message };

    revalidatePath("/geofences");
    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erro desconhecido" };
  }
}

export async function deleteGeofence(id: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("geofences").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/geofences");
  revalidatePath("/");
  return { ok: true };
}
```

- [ ] **Step 6: Rodar todos os testes**

Run: `cd web && npx vitest run src/lib/geofences/`
Expected: todos os testes (shape-utils + payload) verdes.

- [ ] **Step 7: Type check**

Run: `cd web && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 8: Commit**

```bash
git add web/src/lib/geofences/payload.ts web/src/lib/geofences/payload.test.ts web/src/lib/actions/geofences.ts
git commit -m "feat(web): server actions create/update/get para geocercas"
```

---

## Task 5: Preferência `showGeofences` persistida

**Files:**
- Modify: `web/src/lib/map/dashboard-map-preferences.ts`
- Modify: `web/src/lib/map/dashboard-map-preferences.test.ts`

- [ ] **Step 1: Adicionar campo ao teste (falha primeiro)**

Append to `web/src/lib/map/dashboard-map-preferences.test.ts`:

```ts
describe("showGeofences preference", () => {
  it("default true quando ausente", () => {
    const result = normalizeDashboardMapUiPreferences({});
    expect(result.showGeofences).toBe(true);
  });

  it("preserva false explícito", () => {
    const result = normalizeDashboardMapUiPreferences({ showGeofences: false });
    expect(result.showGeofences).toBe(false);
  });

  it("ignora valor não booleano", () => {
    const result = normalizeDashboardMapUiPreferences({ showGeofences: "yes" });
    expect(result.showGeofences).toBe(true);
  });
});
```

(Adicionar `normalizeDashboardMapUiPreferences` ao import se ainda não estiver.)

- [ ] **Step 2: Rodar testes (devem falhar)**

Run: `cd web && npx vitest run src/lib/map/dashboard-map-preferences.test.ts`
Expected: FAIL — propriedade `showGeofences` não existe.

- [ ] **Step 3: Adicionar campo ao tipo e normalizer**

Modify `web/src/lib/map/dashboard-map-preferences.ts`:

1. Adicionar `showGeofences: boolean` ao tipo `DashboardMapUiPreferences`.
2. Adicionar `showGeofences: true` nos dois defaults (`DASHBOARD_MAP_UI_PREFERENCES_DEFAULTS` e `createDashboardMapUiPreferencesDefaults`).
3. Em `normalizeDashboardMapUiPreferences`, adicionar:

```ts
showGeofences:
  typeof nextValue.showGeofences === "boolean" ? nextValue.showGeofences : true,
```

- [ ] **Step 4: Rodar testes**

Run: `cd web && npx vitest run src/lib/map/dashboard-map-preferences.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/map/dashboard-map-preferences.ts web/src/lib/map/dashboard-map-preferences.test.ts
git commit -m "feat(web): persistência da preferência showGeofences no mapa"
```

---

## Task 6: `GeofenceDialog` — form de metadados

**Files:**
- Create: `web/src/components/geofences/geofence-dialog.tsx`

- [ ] **Step 1: Criar o dialog**

Create `web/src/components/geofences/geofence-dialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { GeofenceMeta, GeofenceType } from "@/lib/geofences/types";

type Props = {
  open: boolean;
  title: string;
  description?: string;
  initialValues?: Partial<GeofenceMeta>;
  submitting?: boolean;
  errorMessage?: string | null;
  onCancel: () => void;
  onSubmit: (meta: GeofenceMeta) => void;
};

export function GeofenceDialog({
  open,
  title,
  description,
  initialValues,
  submitting = false,
  errorMessage,
  onCancel,
  onSubmit,
}: Props) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [type, setType] = useState<GeofenceType>(initialValues?.type ?? "inclusion");
  const [active, setActive] = useState<boolean>(initialValues?.active ?? true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ name: name.trim(), type, active });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="geofence-name">Nome</Label>
            <Input
              id="geofence-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              required
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="geofence-type">Tipo</Label>
            <Select value={type} onValueChange={(v) => setType(v as GeofenceType)}>
              <SelectTrigger id="geofence-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inclusion">Zona permitida</SelectItem>
                <SelectItem value="exclusion">Zona proibida</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="geofence-active">Ativa</Label>
            <Switch id="geofence-active" checked={active} onCheckedChange={setActive} />
          </div>

          {errorMessage && (
            <p className="text-sm text-destructive" role="alert">
              {errorMessage}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting || name.trim().length === 0}>
              {submitting ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Type check**

Run: `cd web && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/geofences/geofence-dialog.tsx
git commit -m "feat(web): dialog reutilizável para metadados de geocerca"
```

---

## Task 7: Reescrever `GeofenceTable` com edição inline e link "Editar forma"

**Files:**
- Modify: `web/src/components/geofences/geofence-table.tsx`

- [ ] **Step 1: Reescrever o componente**

Replace `web/src/components/geofences/geofence-table.tsx` entirely:

```tsx
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Pencil, Trash2, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  deleteGeofence,
  updateGeofenceMeta,
} from "@/lib/actions/geofences";
import type { GeofenceRow, GeofenceType } from "@/lib/geofences/types";

type Row = Pick<GeofenceRow, "id" | "name" | "type" | "active" | "created_at">;

export function GeofenceTable({ geofences }: { geofences: Row[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nome</TableHead>
          <TableHead className="w-44">Tipo</TableHead>
          <TableHead className="w-24">Ativa</TableHead>
          <TableHead className="w-32">Criada em</TableHead>
          <TableHead className="w-32 text-right">Ações</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {geofences.length === 0 && (
          <TableRow>
            <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
              Nenhuma geocerca cadastrada
            </TableCell>
          </TableRow>
        )}
        {geofences.map((g) => (
          <GeofenceRowItem key={g.id} row={g} />
        ))}
      </TableBody>
    </Table>
  );
}

function GeofenceRowItem({ row }: { row: Row }) {
  const [name, setName] = useState(row.name);
  const [type, setType] = useState<GeofenceType>(row.type);
  const [active, setActive] = useState(row.active);
  const [, startTransition] = useTransition();
  const [deleting, setDeleting] = useState(false);

  const commitMeta = (patch: Partial<{ name: string; type: GeofenceType; active: boolean }>) => {
    startTransition(async () => {
      const result = await updateGeofenceMeta(row.id, patch);
      if ("error" in result) {
        toast.error(`Falha ao salvar: ${result.error}`);
        setName(row.name);
        setType(row.type);
        setActive(row.active);
      }
    });
  };

  const handleDelete = async () => {
    if (!confirm(`Excluir geocerca "${row.name}"? Esta ação não pode ser desfeita.`)) return;
    setDeleting(true);
    const result = await deleteGeofence(row.id);
    setDeleting(false);
    if ("error" in result) toast.error(`Falha ao excluir: ${result.error}`);
  };

  return (
    <TableRow>
      <TableCell>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (name.trim() !== row.name) commitMeta({ name });
          }}
          maxLength={100}
          className="h-8"
        />
      </TableCell>
      <TableCell>
        <Select
          value={type}
          onValueChange={(v) => {
            const next = v as GeofenceType;
            setType(next);
            commitMeta({ type: next });
          }}
        >
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="inclusion">Zona permitida</SelectItem>
            <SelectItem value="exclusion">Zona proibida</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Switch
          checked={active}
          onCheckedChange={(next) => {
            setActive(next);
            commitMeta({ active: next });
          }}
        />
      </TableCell>
      <TableCell>{new Date(row.created_at).toLocaleDateString("pt-BR")}</TableCell>
      <TableCell className="text-right space-x-1">
        <Button asChild size="sm" variant="ghost" title="Editar forma">
          <Link href={`/geofences/${row.id}/edit-shape`}>
            <MapPin size={14} />
          </Link>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleDelete}
          disabled={deleting}
          title="Excluir"
        >
          <Trash2 size={14} className="text-destructive" />
        </Button>
      </TableCell>
    </TableRow>
  );
}
```

**Nota:** componente `Pencil` importado mas não usado — remover do import.

- [ ] **Step 2: Remover import não usado**

Edit `web/src/components/geofences/geofence-table.tsx` — remove `Pencil` from the `lucide-react` import.

- [ ] **Step 3: Verificar que `toast` (sonner) está no layout**

Run: `grep -rn "Toaster" web/src/app/ | head -5`
Expected: `<Toaster>` renderizado em algum layout. Se não estiver, adicionar ao layout raiz:

```tsx
// web/src/app/layout.tsx (modify if missing)
import { Toaster } from "sonner";
// ...
<Toaster richColors position="top-right" />
```

- [ ] **Step 4: Type check**

Run: `cd web && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/geofences/geofence-table.tsx web/src/app/layout.tsx
git commit -m "feat(web): tabela de geocercas com edição inline e link para editar forma"
```

---

## Task 8: Atualizar página `/geofences`

**Files:**
- Modify: `web/src/app/(dashboard)/geofences/page.tsx`

- [ ] **Step 1: Reescrever página**

Replace `web/src/app/(dashboard)/geofences/page.tsx`:

```tsx
import Link from "next/link";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getGeofences } from "@/lib/actions/geofences";
import { GeofenceTable } from "@/components/geofences/geofence-table";

export default async function GeofencesPage() {
  const geofences = await getGeofences();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Geocercas</h1>
        <Button asChild>
          <Link href="/geofences/new">
            <Plus size={16} className="mr-1" />
            Nova geocerca
          </Link>
        </Button>
      </div>
      <GeofenceTable geofences={geofences} />
    </div>
  );
}
```

- [ ] **Step 2: Type check**

Run: `cd web && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add web/src/app/\(dashboard\)/geofences/page.tsx
git commit -m "feat(web): página de geocercas com botão 'Nova geocerca'"
```

---

## Task 9: `GeofenceEditorMap` — mapa com Geoman

**Files:**
- Create: `web/src/components/geofences/geofence-editor-map.tsx`

- [ ] **Step 1: Criar componente**

Create `web/src/components/geofences/geofence-editor-map.tsx`:

```tsx
"use client";

import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";

import { useEffect } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "@geoman-io/leaflet-geoman-free";

import {
  circleToPolygon,
  isClosedRing,
} from "@/lib/geofences/shape-utils";
import type { LngLat, ShapeInput, GeofenceShape } from "@/lib/geofences/types";

type InitialShape =
  | { shape_type: "polygon" | "rectangle"; coordinates: LngLat[] }
  | { shape_type: "circle"; center: LngLat; radiusM: number };

type Props = {
  mode: "create" | "edit-shape";
  initialShape?: InitialShape;
  center: [number, number];
  zoom?: number;
  onShapeChange: (shape: ShapeInput | null) => void;
};

export function GeofenceEditorMap({
  mode,
  initialShape,
  center,
  zoom = 13,
  onShapeChange,
}: Props) {
  return (
    <MapContainer
      center={center}
      zoom={zoom}
      style={{ width: "100%", height: "100%", minHeight: 400 }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <GeomanController
        mode={mode}
        initialShape={initialShape}
        onShapeChange={onShapeChange}
      />
    </MapContainer>
  );
}

function GeomanController({
  mode,
  initialShape,
  onShapeChange,
}: {
  mode: "create" | "edit-shape";
  initialShape?: InitialShape;
  onShapeChange: (shape: ShapeInput | null) => void;
}) {
  const map = useMap();

  useEffect(() => {
    const pm = (map as L.Map & { pm: any }).pm;
    if (!pm) return;

    pm.setLang("pt_br" as never);

    if (mode === "create") {
      pm.addControls({
        position: "topleft",
        drawMarker: false,
        drawCircleMarker: false,
        drawPolyline: false,
        drawText: false,
        cutPolygon: false,
        rotateMode: false,
        dragMode: false,
        drawPolygon: true,
        drawRectangle: true,
        drawCircle: true,
        editMode: false,
        removalMode: true,
      });
    } else {
      pm.addControls({
        position: "topleft",
        drawMarker: false,
        drawCircleMarker: false,
        drawPolyline: false,
        drawText: false,
        drawPolygon: false,
        drawRectangle: false,
        drawCircle: false,
        cutPolygon: false,
        rotateMode: false,
        dragMode: true,
        editMode: true,
        removalMode: false,
      });
    }

    const drawnLayerRef: { current: L.Layer | null } = { current: null };

    if (mode === "edit-shape" && initialShape) {
      let layer: L.Layer;
      if (initialShape.shape_type === "circle") {
        const latlng = L.latLng(initialShape.center[1], initialShape.center[0]);
        layer = L.circle(latlng, { radius: initialShape.radiusM }).addTo(map);
      } else {
        const latlngs = initialShape.coordinates.map(([lng, lat]) => L.latLng(lat, lng));
        layer = L.polygon(latlngs).addTo(map);
      }
      drawnLayerRef.current = layer;
      (layer as L.Layer & { pm: any }).pm.enable({ allowSelfIntersection: false });

      map.fitBounds((layer as L.Polygon | L.Circle).getBounds(), { padding: [40, 40] });

      pushShape(layer, initialShape.shape_type);
    }

    const pushShape = (layer: L.Layer, shapeType: GeofenceShape) => {
      if (shapeType === "circle" && layer instanceof L.Circle) {
        const ll = layer.getLatLng();
        const radiusM = layer.getRadius();
        const center: LngLat = [ll.lng, ll.lat];
        const polygon = circleToPolygon({ center, radiusM });
        onShapeChange({ kind: "circle", center, radiusM, polygon });
        return;
      }
      if (layer instanceof L.Polygon) {
        const raw = layer.getLatLngs();
        const ring = Array.isArray(raw[0]) ? (raw[0] as L.LatLng[]) : (raw as L.LatLng[]);
        const coords: LngLat[] = ring.map((ll) => [ll.lng, ll.lat]);
        if (!isClosedRing(coords)) coords.push(coords[0]);
        onShapeChange({ kind: shapeType === "rectangle" ? "rectangle" : "polygon", coordinates: coords });
      }
    };

    const onCreate = (e: any) => {
      if (drawnLayerRef.current) {
        map.removeLayer(drawnLayerRef.current);
      }
      drawnLayerRef.current = e.layer as L.Layer;
      const shapeType: GeofenceShape =
        e.shape === "Circle" ? "circle" : e.shape === "Rectangle" ? "rectangle" : "polygon";
      pushShape(e.layer, shapeType);
    };

    const onEdit = (e: any) => {
      const layer = e.layer ?? e.target;
      if (!layer) return;
      const shapeType: GeofenceShape =
        layer instanceof L.Circle
          ? "circle"
          : layer.pm?._shape === "Rectangle"
            ? "rectangle"
            : "polygon";
      pushShape(layer, shapeType);
    };

    const onRemove = () => {
      drawnLayerRef.current = null;
      onShapeChange(null);
    };

    map.on("pm:create", onCreate);
    map.on("pm:edit", onEdit);
    map.on("pm:remove", onRemove);

    return () => {
      map.off("pm:create", onCreate);
      map.off("pm:edit", onEdit);
      map.off("pm:remove", onRemove);
      pm.removeControls();
      if (drawnLayerRef.current) {
        map.removeLayer(drawnLayerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, mode]);

  return null;
}
```

**Notas:**
- Geoman `pm.setLang("pt_br")` traduz tooltips quando suportado.
- Layer inicial (em `edit-shape`) é adicionada manualmente e habilitada em pm.enable — eventos `pm:edit` em camadas individuais disparam quando usuário arrasta vértices / raio.
- `onShapeChange(null)` permite o container (`GeofenceEditor`) saber que a forma foi apagada.

- [ ] **Step 2: Type check**

Run: `cd web && npx tsc --noEmit`
Expected: alguns erros com `any` ainda são permitidos (Geoman sem tipos). Se outros erros, corrigir.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/geofences/geofence-editor-map.tsx
git commit -m "feat(web): editor de geocercas com Geoman (polígono, retângulo, círculo)"
```

---

## Task 10: `GeofenceEditor` — wrapper com dialog

**Files:**
- Create: `web/src/components/geofences/geofence-editor.tsx`

- [ ] **Step 1: Criar wrapper**

Create `web/src/components/geofences/geofence-editor.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { GeofenceDialog } from "./geofence-dialog";
import {
  createGeofence,
  updateGeofenceShape,
} from "@/lib/actions/geofences";
import type { GeofenceMeta, LngLat, ShapeInput } from "@/lib/geofences/types";

const GeofenceEditorMap = dynamic(
  () => import("./geofence-editor-map").then((m) => m.GeofenceEditorMap),
  { ssr: false, loading: () => <div className="flex items-center justify-center h-full text-muted-foreground">Carregando mapa...</div> }
);

type CreateProps = {
  mode: "create";
  initialCenter: [number, number];
};

type EditShapeProps = {
  mode: "edit-shape";
  geofenceId: string;
  initialMeta: GeofenceMeta;
  initialShape:
    | { shape_type: "polygon" | "rectangle"; coordinates: LngLat[] }
    | { shape_type: "circle"; center: LngLat; radiusM: number };
  initialCenter: [number, number];
};

type Props = CreateProps | EditShapeProps;

export function GeofenceEditor(props: Props) {
  const router = useRouter();
  const [shape, setShape] = useState<ShapeInput | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const hasShape = shape !== null;
  const canConfirmCreate = props.mode === "create" && hasShape;

  const handleSaveCreate = async (meta: GeofenceMeta) => {
    if (!shape) return;
    setSubmitting(true);
    setErrorMessage(null);
    const result = await createGeofence({ ...meta, shape });
    setSubmitting(false);
    if ("error" in result) {
      setErrorMessage(result.error);
      return;
    }
    toast.success("Geocerca criada.");
    router.push("/geofences");
    router.refresh();
  };

  const handleSaveShape = async () => {
    if (props.mode !== "edit-shape" || !shape) return;
    setSubmitting(true);
    const result = await updateGeofenceShape(props.geofenceId, shape);
    setSubmitting(false);
    if ("error" in result) {
      toast.error(`Falha ao salvar: ${result.error}`);
      return;
    }
    toast.success("Forma atualizada.");
    router.push("/geofences");
    router.refresh();
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between border-b p-3 gap-2">
        <h1 className="text-lg font-semibold">
          {props.mode === "create" ? "Nova geocerca" : `Editar forma · ${props.initialMeta.name}`}
        </h1>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => router.push("/geofences")} disabled={submitting}>
            Cancelar
          </Button>
          {props.mode === "create" ? (
            <Button
              onClick={() => {
                setErrorMessage(null);
                setDialogOpen(true);
              }}
              disabled={!canConfirmCreate || submitting}
            >
              Confirmar geocerca
            </Button>
          ) : (
            <Button onClick={handleSaveShape} disabled={!hasShape || submitting}>
              {submitting ? "Salvando..." : "Salvar"}
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 relative">
        <GeofenceEditorMap
          mode={props.mode}
          initialShape={props.mode === "edit-shape" ? props.initialShape : undefined}
          center={props.initialCenter}
          onShapeChange={setShape}
        />
      </div>

      {props.mode === "create" && (
        <GeofenceDialog
          open={dialogOpen}
          title="Detalhes da geocerca"
          description="Defina nome, tipo e estado. A forma desenhada no mapa será salva junto."
          submitting={submitting}
          errorMessage={errorMessage}
          onCancel={() => setDialogOpen(false)}
          onSubmit={handleSaveCreate}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type check**

Run: `cd web && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/geofences/geofence-editor.tsx
git commit -m "feat(web): wrapper de edição de geocercas com dialog integrado"
```

---

## Task 11: Rota `/geofences/new`

**Files:**
- Create: `web/src/app/(dashboard)/geofences/new/page.tsx`

- [ ] **Step 1: Criar rota**

Create `web/src/app/(dashboard)/geofences/new/page.tsx`:

```tsx
import { GeofenceEditor } from "@/components/geofences/geofence-editor";

export default function NewGeofencePage() {
  // Centro padrão: São Paulo. Futuro: ler do dashboardMapPreferences.
  const initialCenter: [number, number] = [-23.55, -46.63];

  return (
    <div className="h-[calc(100vh-4rem)] -m-4 lg:-m-6">
      <GeofenceEditor mode="create" initialCenter={initialCenter} />
    </div>
  );
}
```

- [ ] **Step 2: Type check + lint**

Run: `cd web && npx tsc --noEmit && npm run lint`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add web/src/app/\(dashboard\)/geofences/new/page.tsx
git commit -m "feat(web): rota /geofences/new para desenhar geocercas"
```

---

## Task 12: Rota `/geofences/[id]/edit-shape`

**Files:**
- Create: `web/src/app/(dashboard)/geofences/[id]/edit-shape/page.tsx`

- [ ] **Step 1: Criar rota**

Create `web/src/app/(dashboard)/geofences/[id]/edit-shape/page.tsx`:

```tsx
import { notFound } from "next/navigation";

import { GeofenceEditor } from "@/components/geofences/geofence-editor";
import { getGeofence } from "@/lib/actions/geofences";
import type { LngLat } from "@/lib/geofences/types";

type Params = { id: string };

export default async function EditGeofenceShapePage(props: { params: Promise<Params> }) {
  const { id } = await props.params;
  const geofence = await getGeofence(id);
  if (!geofence) notFound();

  const initialShape = mapGeofenceToEditorShape(geofence);
  if (!initialShape) notFound();

  const initialCenter: [number, number] = deriveCenter(geofence) ?? [-23.55, -46.63];

  return (
    <div className="h-[calc(100vh-4rem)] -m-4 lg:-m-6">
      <GeofenceEditor
        mode="edit-shape"
        geofenceId={geofence.id}
        initialMeta={{
          name: geofence.name,
          type: geofence.type,
          active: geofence.active ?? true,
        }}
        initialShape={initialShape}
        initialCenter={initialCenter}
      />
    </div>
  );
}

type GeofenceLike = Awaited<ReturnType<typeof getGeofence>>;

function mapGeofenceToEditorShape(g: NonNullable<GeofenceLike>):
  | { shape_type: "polygon" | "rectangle"; coordinates: LngLat[] }
  | { shape_type: "circle"; center: LngLat; radiusM: number }
  | null {
  if (g.shape_type === "circle") {
    const center = parsePoint(g.center);
    if (!center || g.radius_m == null) return null;
    return { shape_type: "circle", center, radiusM: Number(g.radius_m) };
  }
  const coords = parsePolygon(g.area);
  if (!coords) return null;
  return { shape_type: g.shape_type, coordinates: coords };
}

function deriveCenter(g: NonNullable<GeofenceLike>): [number, number] | null {
  if (g.shape_type === "circle") {
    const center = parsePoint(g.center);
    return center ? [center[1], center[0]] : null;
  }
  const coords = parsePolygon(g.area);
  if (!coords || coords.length === 0) return null;
  const [lng, lat] = coords[0];
  return [lat, lng];
}

function parsePolygon(value: unknown): LngLat[] | null {
  if (!value) return null;
  const geo = coerceGeoJson(value);
  if (!geo) return null;
  if (geo.type === "Polygon" && Array.isArray(geo.coordinates?.[0])) {
    return geo.coordinates[0].map((p: [number, number]) => [p[0], p[1]] as LngLat);
  }
  return null;
}

function parsePoint(value: unknown): LngLat | null {
  if (!value) return null;
  const geo = coerceGeoJson(value);
  if (!geo) return null;
  if (geo.type === "Point" && Array.isArray(geo.coordinates)) {
    return [geo.coordinates[0], geo.coordinates[1]] as LngLat;
  }
  return null;
}

function coerceGeoJson(value: unknown): { type: string; coordinates: any } | null {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (typeof value === "object" && value !== null && "type" in value) {
    return value as { type: string; coordinates: any };
  }
  return null;
}
```

**Nota:** A view `geofences_geojson` (criada em Task 1) retorna `area` e `center` como JSONB GeoJSON, então `parsePolygon` / `parsePoint` acima recebem objetos diretamente.

- [ ] **Step 2: Type check**

Run: `cd web && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add web/src/app/\(dashboard\)/geofences/\[id\]/edit-shape/page.tsx
git commit -m "feat(web): rota /geofences/[id]/edit-shape para editar forma existente"
```

---

## Task 13: `GeofenceLayer` — render read-only

**Files:**
- Create: `web/src/components/geofences/geofence-layer.tsx`

- [ ] **Step 1: Criar componente**

Create `web/src/components/geofences/geofence-layer.tsx`:

```tsx
"use client";

import { Polygon, Popup } from "react-leaflet";
import type { GeofenceRow, LngLat } from "@/lib/geofences/types";

type Props = {
  geofences: GeofenceRow[];
};

export function GeofenceLayer({ geofences }: Props) {
  return (
    <>
      {geofences
        .filter((g) => g.active)
        .map((g) => {
          const coords = parsePolygon(g.area);
          if (!coords || coords.length < 4) return null;
          const isProhibited = g.type === "exclusion";
          const color = isProhibited ? "#dc2626" : "#16a34a";
          // Leaflet Polygon quer [lat, lng] — inverter de [lng, lat]
          const latlngs = coords.map(([lng, lat]) => [lat, lng] as [number, number]);
          return (
            <Polygon
              key={g.id}
              positions={latlngs}
              pathOptions={{ color, fillColor: color, fillOpacity: 0.2, weight: 2 }}
            >
              <Popup>
                <div className="font-medium">{g.name}</div>
                <div className="text-xs text-muted-foreground">
                  {isProhibited ? "Zona proibida" : "Zona permitida"}
                </div>
              </Popup>
            </Polygon>
          );
        })}
    </>
  );
}

function parsePolygon(value: unknown): LngLat[] | null {
  if (!value) return null;
  const geo = coerceGeoJson(value);
  if (!geo || geo.type !== "Polygon" || !Array.isArray(geo.coordinates?.[0])) return null;
  return geo.coordinates[0].map((p: [number, number]) => [p[0], p[1]] as LngLat);
}

function coerceGeoJson(value: unknown): { type: string; coordinates: any } | null {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (typeof value === "object" && value !== null && "type" in value) {
    return value as { type: string; coordinates: any };
  }
  return null;
}
```

**Nota:** Se ajustou `getGeofences` para usar a view `geofences_geojson` em Task 12, `area` virá como objeto JSONB e `parsePolygon` funciona.

- [ ] **Step 2: Type check**

Run: `cd web && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/geofences/geofence-layer.tsx
git commit -m "feat(web): camada read-only de geocercas para o mapa"
```

---

## Task 14: `OverlayListener` — escuta toggle do Leaflet `LayersControl.Overlay`

**Files:**
- Create: `web/src/components/map/overlay-listener.tsx`

- [ ] **Step 1: Criar listener**

Create `web/src/components/map/overlay-listener.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { useMap } from "react-leaflet";

type Props = {
  overlayName: string;
  onChange: (visible: boolean) => void;
};

export function OverlayListener({ overlayName, onChange }: Props) {
  const map = useMap();

  useEffect(() => {
    const handleAdd = (e: { name: string }) => {
      if (e.name === overlayName) onChange(true);
    };
    const handleRemove = (e: { name: string }) => {
      if (e.name === overlayName) onChange(false);
    };
    map.on("overlayadd", handleAdd as never);
    map.on("overlayremove", handleRemove as never);
    return () => {
      map.off("overlayadd", handleAdd as never);
      map.off("overlayremove", handleRemove as never);
    };
  }, [map, overlayName, onChange]);

  return null;
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/map/overlay-listener.tsx
git commit -m "feat(web): listener para toggles de overlay do Leaflet"
```

---

## Task 15: Integrar GeofenceLayer ao `TrackingMap`

**Files:**
- Modify: `web/src/components/map/tracking-map.tsx`

- [ ] **Step 1: Adicionar imports e props**

Modify `web/src/components/map/tracking-map.tsx`:

Adicionar imports dinâmicos após o `BaseLayerListenerDynamic`:

```ts
const LayersControlOverlay = dynamic(
  () => import("react-leaflet").then((m) => {
    const LC = m.LayersControl;
    return { default: LC.Overlay };
  }),
  { ssr: false }
);

const GeofenceLayerDynamic = dynamic(
  () => import("@/components/geofences/geofence-layer").then((m) => m.GeofenceLayer),
  { ssr: false }
);

const OverlayListenerDynamic = dynamic(
  () => import("./overlay-listener").then((m) => m.OverlayListener),
  { ssr: false }
);
```

Adicionar novas props ao tipo:

```ts
import type { GeofenceRow } from "@/lib/geofences/types";

export type TrackingMapProps = {
  // ... todas as props existentes ...
  geofences: GeofenceRow[];
  showGeofences: boolean;
  onShowGeofencesChange: (visible: boolean) => void;
};
```

Na assinatura do componente, adicionar `geofences`, `showGeofences`, `onShowGeofencesChange`.

- [ ] **Step 2: Renderizar overlay dentro do `LayersControl`**

Within `<LayersControl position="topright">`, depois de todos os `<LayersControlBaseLayer>`:

```tsx
<LayersControlOverlay checked={showGeofences} name="Geocercas">
  <GeofenceLayerDynamic geofences={geofences} />
</LayersControlOverlay>
```

E no mesmo escopo do `BaseLayerListenerDynamic`:

```tsx
<OverlayListenerDynamic overlayName="Geocercas" onChange={onShowGeofencesChange} />
```

- [ ] **Step 3: Type check**

Run: `cd web && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/map/tracking-map.tsx
git commit -m "feat(web): tracking-map integra camada de geocercas com toggle"
```

---

## Task 16: `DashboardMap` e page.tsx — fetch geofences + estado

**Files:**
- Modify: `web/src/app/(dashboard)/page.tsx`
- Modify: `web/src/app/(dashboard)/dashboard-map.tsx`

- [ ] **Step 1: Fetch geofences no server component**

Modify `web/src/app/(dashboard)/page.tsx`:

```tsx
import { getLatestPositions } from "@/lib/actions/positions";
import { getGeofences } from "@/lib/actions/geofences";
import { createClient } from "@/lib/supabase/server";
import { DashboardMap } from "./dashboard-map";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Não autenticado");

  const [positions, geofences] = await Promise.all([
    getLatestPositions(),
    getGeofences(),
  ]);

  return (
    <div className="h-full -m-4 -mb-24 lg:-m-6 lg:-mb-6">
      <DashboardMap initialPositions={positions} initialGeofences={geofences} userId={user.id} />
    </div>
  );
}
```

- [ ] **Step 2: Propagar no DashboardMap**

Modify `web/src/app/(dashboard)/dashboard-map.tsx`:

1. Adicionar import de `GeofenceRow`:

```ts
import type { GeofenceRow } from "@/lib/geofences/types";
```

2. Adicionar ao tipo de props e destructure:

```ts
type DashboardMapProps = {
  initialPositions: VehiclePosition[];
  initialGeofences: GeofenceRow[];
  userId: string;
};
```

3. Adicionar estado para `showGeofences`, inicializado a partir das preferências:

```ts
const [showGeofences, setShowGeofences] = useState<boolean>(
  DASHBOARD_MAP_UI_PREFERENCES_DEFAULTS.showGeofences
);
```

No `useEffect` de hidratação de prefs (procurar `readDashboardMapUiPreferences`), ler também `showGeofences`.

No efeito que escreve prefs (procurar `writeDashboardMapUiPreferences`), incluir `showGeofences` no objeto salvo.

4. Passar props para `TrackingMap`:

```tsx
<TrackingMap
  // ... props existentes ...
  geofences={initialGeofences}
  showGeofences={showGeofences}
  onShowGeofencesChange={setShowGeofences}
/>
```

- [ ] **Step 3: Type check + lint**

Run: `cd web && npx tsc --noEmit && npm run lint`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add web/src/app/\(dashboard\)/page.tsx web/src/app/\(dashboard\)/dashboard-map.tsx
git commit -m "feat(web): dashboard inicializa e persiste toggle de geocercas"
```

---

## Task 17: Verificação final — lint, build, manual

**Files:** nenhum (verificação).

- [ ] **Step 1: Lint**

Run: `cd web && npm run lint`
Expected: sem warnings nem erros.

- [ ] **Step 2: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Unit tests**

Run: `cd web && npx vitest run`
Expected: todos os testes passam.

- [ ] **Step 4: Build**

Run: `cd web && npm run build`
Expected: build bem-sucedido.

- [ ] **Step 5: Dev server + manual checklist**

Run: `cd web && npm run dev`

Checklist no navegador (`http://localhost:3000`):

1. `/geofences` mostra tabela (lista atual ou vazia) + botão "Nova geocerca".
2. Clicar "Nova geocerca" → vai para `/geofences/new` com mapa + toolbar Geoman (3 botões: polygon, rectangle, circle).
3. Desenhar um polígono de 4 pontos → clicar "Confirmar geocerca" → dialog abre → preencher "Teste polígono" / "Zona permitida" / ativa → Salvar → redireciona para `/geofences` com nova linha.
4. Repetir para retângulo ("Teste retângulo" / "Zona proibida") e círculo raio ~500m ("Teste círculo").
5. Em `/geofences`, editar nome inline → blur → sem erros, valor persiste em reload.
6. Alterar select de tipo → muda; toggle ativo → muda.
7. Clicar ícone de mapa (Editar forma) em um círculo → vai para `/geofences/[id]/edit-shape` com círculo carregado e handles de centro/raio; arrastar raio → "Salvar" → volta para lista.
8. Excluir uma geocerca → confirma → some.
9. Ir para `/` (dashboard map) → geocercas ativas aparecem coloridas (verde/vermelho). Clicar em uma → popup com nome e tipo.
10. Abrir o painel de camadas (canto superior direito) → item "Geocercas" aparece com checkbox → desmarcar → geocercas somem → reload → toggle lembrado (desligado).
11. Re-marcar toggle → geocercas voltam → reload → permanece ligado.
12. Alternar `active=false` em uma geocerca (na tabela) → no `/` não aparece mais.
13. Visual: cor verde pra "Zona permitida", vermelha pra "Zona proibida", opacidade ~0.2, popup legível.

- [ ] **Step 6: Commit final (se houver ajustes)**

Se surgiram ajustes durante a verificação manual, aplicá-los como commits incrementais e só então:

```bash
git log --oneline -20
```
Expected: histórico limpo da feature.

---

## Self-Review

Antes de marcar o plano como pronto, revisitar a spec e confirmar cobertura:

- [x] Migration aditiva com `shape_type`, `center`, `radius_m` + constraint — Task 1.
- [x] Cliente calcula círculo aproximado (64 lados) via Turf — Task 3.
- [x] Server actions `create/getOne/updateMeta/updateShape/delete` — Task 4.
- [x] Validações server-side (nome, type, shape) — Task 4.
- [x] `revalidatePath` em mutations — Task 4.
- [x] Preferência `showGeofences` persistida — Task 5.
- [x] Dialog de metadados reusável — Task 6.
- [x] Tabela com edit inline + bug fix `"exclusao"` → `"exclusion"` — Task 7.
- [x] Página `/geofences` com botão "Nova" — Task 8.
- [x] Editor com Geoman (polygon + rectangle + circle) — Tasks 9, 10.
- [x] Rotas `/geofences/new` e `/geofences/[id]/edit-shape` — Tasks 11, 12.
- [x] `GeofenceLayer` read-only com cores e popup — Task 13.
- [x] `OverlayListener` + integração ao `LayersControl` via Overlay — Tasks 14, 15.
- [x] `DashboardMap` fetch + propagação + persistência — Task 16.
- [x] Verificação manual com checklist detalhado — Task 17.

**Itens fora do escopo (v1, conforme spec):** avaliação no gateway Go, tabela `geofence_events`, integração com `alert_rules`, edição direta no `/map`, paginação avançada.
