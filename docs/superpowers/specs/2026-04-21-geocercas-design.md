# Geocercas (Geofences) — Design Spec

**Data:** 2026-04-21
**Área alvo:** `web/src/app/(dashboard)/geofences/`, `web/src/lib/actions/geofences.ts`, `web/src/components/geofences/` (novo), `web/src/components/map/tracking-map.tsx`, `web/src/app/(dashboard)/dashboard-map.tsx`, nova migration em `supabase/migrations/`.

## Problema

A plataforma já possui schema de `geofences` (POLYGON + tipo `inclusion`/`exclusion` + RLS) e uma página placeholder que apenas lista geocercas existentes e permite excluir. Não há interface de criação, edição ou desenho, e as geocercas não aparecem no mapa principal de rastreamento. O frontend da feature precisa ser implementado do zero em termos de UX.

Avaliação de regras no gateway Go e integração com `alert_rules` (entrada/saída) **ficam fora desta iteração** — serão abordadas em spec posterior.

## Objetivo

Entregar o frontend completo de CRUD de geocercas com três formas geométricas (polígono, retângulo, círculo exato), desenho e edição visual no mapa, e visualização opcional sobreposta ao mapa de rastreamento.

A v1 deve suportar:

- criar geocerca desenhando polígono livre, retângulo ou círculo exato;
- persistir círculo como polígono aproximado de 64 lados **mais** centro (POINT) e raio em metros, para render fiel no UI;
- editar metadados inline na tabela (`/geofences`): nome, tipo (Zona permitida / Zona proibida), ativo;
- editar a forma em uma tela dedicada com Geoman em modo edição (drag de vértices, centro e raio);
- excluir com confirmação;
- renderizar geocercas ativas como camada opcional no mapa principal `/map`, com cores verde (permitida), vermelho (proibida), cinza (inativa);
- toggle "Geocercas" no painel de camadas do `/map`, persistido em `localStorage` seguindo o padrão atual de camadas do dashboard.

## Decisão de Produto

Adotar `@geoman-io/leaflet-geoman-free` como biblioteca de desenho/edição, manter o schema atual (com migration aditiva para `shape_type` + `center` + `radius_m`) e implementar todo o CRUD via Server Actions seguindo o padrão existente de `vehicles` e `devices`.

### Motivo

- Geoman é ativo, tem TypeScript nativo, drag handles bons e cobre polígono, retângulo e círculo em uma única API, incluindo edição de forma existente.
- A migration aditiva preserva compatibilidade (área continua sendo polígono válido para queries PostGIS no futuro) e adiciona precisão de círculo sem tocar na constraint de geometria.
- Reusar o padrão de Server Actions evita divergência arquitetural; a equipe já conhece o fluxo `getTenantId` → Supabase → `revalidatePath`.

## Alternativas Consideradas

1. **`react-leaflet-draw` (wrapper do `leaflet-draw`)** — descartado. Manutenção fraca do `leaflet-draw` original, tipagem TypeScript fraca, UX datada, edição de vértices clunky.
2. **Desenho custom com `react-leaflet` + Turf** — descartado. Reimplementar drag de vértices, handles de raio de círculo, toolbar e eventos equivale a semanas de trabalho sem ganho.
3. **Armazenar círculo só como polígono aproximado (sem center/radius)** — descartado. Ao reabrir a geocerca para edição, o cliente veria um polígono de 64 lados em vez de um círculo exato; handles de edição ficariam errados.
4. **Substituir coluna `area POLYGON` por discriminada (`area_polygon` / `center+radius`)** — descartado. Quebra queries PostGIS uniformes; o gateway futuro teria que ramificar por tipo para avaliar `ST_Within`. Manter `area` sempre preenchido é mais simples.
5. **Criar/editar direto no `/map` com modo de edição** — descartado. Mistura contextos de operação (rastreio) e configuração; a tela dedicada mantém responsabilidades separadas.

## Escopo da V1

Dentro do escopo:

- migration aditiva com `shape_type` enum, `center GEOMETRY(POINT, 4326)` e `radius_m NUMERIC(10,2)`;
- três formas: polígono livre, retângulo, círculo exato;
- CRUD completo via Server Actions;
- página `/geofences` (lista + edit inline meta + ações);
- página `/geofences/new` (mapa grande + toolbar Geoman + dialog para meta após desenho);
- página `/geofences/[id]/edit-shape` (mapa grande + Geoman em modo edição da forma existente);
- camada read-only de geocercas no `/map` com toggle no painel de camadas;
- labels pt-BR "Zona permitida" / "Zona proibida"; cores verde/vermelho/cinza.

Fora do escopo:

- avaliação de entrada/saída no gateway Go;
- tabela de histórico `geofence_events`;
- integração com `alert_rules` (geração automática de alertas por geocerca);
- desenho/edição de geocercas na página `/map`;
- paginação ou busca avançada na lista de geocercas;
- importação/exportação (KML, GeoJSON);
- geocercas por veículo ou por grupo (todas são do tenant).

## Regras de Comportamento

### Criação

1. Usuário clica "Nova geocerca" em `/geofences` → navega para `/geofences/new`.
2. Mapa grande renderiza com Geoman toolbar ativada (polígono, retângulo, círculo). Centro inicial: último centro salvo do `/map` (reusa `dashboardMapPreferences`) ou fallback em `(-23.55, -46.63)`.
3. Ao terminar o desenho (evento `pm:create`), a forma fica congelada no mapa e um dialog abre pedindo nome, tipo e toggle ativo.
4. "Cancelar" no dialog volta ao estado de desenho (apaga forma atual; usuário pode redesenhar). "Salvar" chama `createGeofence` e redireciona para `/geofences`.
5. Validações no cliente: nome obrigatório, ≤100 chars; polígono com ≥3 vértices; círculo com raio > 0. Erros mostrados no dialog.

### Edição de metadados

- Na tabela `/geofences`, cada linha permite editar nome (input inline), tipo (select inline), ativo (switch inline). Confirmação via blur/enter dispara `updateGeofenceMeta`.
- Erros aparecem em toast; valor reverte localmente em caso de falha.

### Edição de forma

- Botão "Editar forma" na linha navega para `/geofences/[id]/edit-shape`.
- Mapa grande carrega a geocerca atual com Geoman em modo edit (`pm.enable({ allowSelfIntersection: false })` para polígonos; para círculo, centro e raio editáveis).
- Botão "Salvar" chama `updateGeofenceShape`; "Cancelar" volta para `/geofences` sem salvar.
- Não é permitido mudar o `shape_type` na edição; se quiser outro tipo, o usuário exclui e cria de novo.

### Exclusão

- Botão "Excluir" na linha abre confirmação ("Excluir geocerca '{nome}'? Esta ação não pode ser desfeita.").
- Confirmado, chama `deleteGeofence` (já existente). Linha some após sucesso.

### Renderização no mapa principal

- `/map` busca `getGeofences()` junto com veículos e passa para `<TrackingMap>`.
- Se toggle "Geocercas" estiver ligado (default: `true`), renderiza todas as geocercas `active=true` como `<Polygon>` colorido (verde=inclusion, vermelho=exclusion). Geocercas inativas não aparecem.
- Clicar em uma geocerca abre popup com nome e tipo.
- Zoom/pan não alteram as geocercas (sempre visíveis dentro dos bounds quando toggle ligado).

### Toggle de camada

- Adiciona item "Geocercas" ao painel de camadas de `dashboard-map.tsx`.
- Estado persiste em `localStorage` via `dashboardMapPreferences` (chave nova: `showGeofences`, default `true`), seguindo o padrão estabelecido no commit `4f6fce4`.

## Arquitetura

### Hierarquia de componentes e rotas

```
app/(dashboard)/geofences/
  ├── page.tsx                       (SSR: getGeofences → <GeofenceTable>)
  ├── new/
  │     └── page.tsx                 (wrapper para <GeofenceEditor mode="create">)
  └── [id]/
        └── edit-shape/
              └── page.tsx           (SSR: busca geocerca → <GeofenceEditor mode="edit-shape">)

components/geofences/
  ├── geofence-table.tsx             (client: edit inline meta + ações)
  ├── geofence-dialog.tsx            (client: form meta, usado em create e edit-meta)
  ├── geofence-editor-map.tsx        (client: mapa grande com Geoman)
  ├── geofence-editor.tsx            (client: compõe editor-map + dialog)
  ├── geofence-layer.tsx             (client: render read-only em qualquer mapa)
  └── shape-utils.ts                 (puro: Turf circle, validações, conversões)

app/(dashboard)/dashboard-map.tsx    (modificado: novo toggle + busca geofences)
components/map/tracking-map.tsx      (modificado: renderiza GeofenceLayer quando recebe prop)
lib/actions/geofences.ts             (expandido: create/update/updateShape)
```

### Separação de responsabilidades

`GeofenceEditor` é o componente alto-nível que compõe o mapa e o dialog. Ele detém estado da forma sendo desenhada e coordena callbacks.

`GeofenceEditorMap` encapsula Leaflet + Geoman. Recebe `mode` (`create` | `edit-shape`), `initialShape?` (para edit), e `onShapeChange(shape)`. Ele instala a toolbar Geoman no mount e remove no unmount. Emite a forma em formato interno `ShapeInput`.

`GeofenceLayer` é read-only. Recebe `geofences[]` e `visible`. Renderiza `<Polygon pathOptions={...}>` colorido por tipo, com popup. Usa `area` (polygon) para render em todos os tipos — não precisa ramificar por `shape_type`.

`GeofenceDialog` é form simples reusado em create (controlado pelo editor) e em edit-meta (controlado pela tabela).

`GeofenceTable` substitui o placeholder atual. Colunas: Nome (input inline), Tipo (select inline), Ativo (switch inline), Criado em, Ações (Editar forma / Excluir).

`shape-utils.ts` é puro e testável. Exporta:

- `circleToPolygon({ center, radiusM, steps = 64 }): [number, number][]` usando `@turf/circle`;
- `validatePolygon(coords): { ok, error? }`;
- `validateRadius(m): { ok, error? }`;
- `geomanShapeToInput(layer): ShapeInput` (converte camada Geoman em payload).

### Integração no `/map`

`dashboard-map.tsx` já é o container; passa a buscar `getGeofences()` (via Server Component pai `map/page.tsx`) e propagar para `<TrackingMap>`. Adiciona o toggle "Geocercas" ao painel de camadas existente. `TrackingMap` recebe `geofences` e `showGeofences` e monta `<GeofenceLayer>` condicional dentro do `<MapContainer>`.

### Fluxo de dados

```
Server:
  geofences/page.tsx ──getGeofences()──→ GeofenceTable (props)
  geofences/new/page.tsx ─────────────→ GeofenceEditor (mode="create")
  geofences/[id]/edit-shape/page.tsx ──getGeofence(id)──→ GeofenceEditor (mode="edit-shape", initial)
  map/page.tsx ──getGeofences() + getVehicles()──→ DashboardMap

Client mutations:
  GeofenceDialog (create) ──createGeofence──→ redirect /geofences
  GeofenceTable cell blur ──updateGeofenceMeta──→ revalidatePath('/geofences','/map')
  GeofenceEditor (edit-shape) ──updateGeofenceShape──→ redirect /geofences
  GeofenceTable delete ──deleteGeofence──→ revalidatePath
```

### Dependências novas

- `@geoman-io/leaflet-geoman-free` (runtime)
- `@turf/circle` (runtime; subset de `@turf/turf` para reduzir bundle)

Tipos: `@types/leaflet` já existente cobre Leaflet; Geoman exporta próprios tipos.

## Schema / Migration

Arquivo: `supabase/migrations/<timestamp>_geofences_shape_type.sql`.

```sql
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
```

**Invariantes:**

- `area GEOMETRY(POLYGON, 4326)` permanece obrigatório e válido para todos os tipos. Círculos guardam polígono aproximado de 64 lados (gerado no cliente antes do envio).
- `shape_type = 'rectangle'` é tratado na UI como polígono de 4 vértices; o Geoman fornece modo rectangle que já garante isso.
- Geocercas pré-existentes no banco recebem `shape_type = 'polygon'` por default; `center` e `radius_m` ficam `NULL`.

Após aplicar: rodar `make db-types` para regenerar `web/src/types/database.ts`.

## Server Actions

Arquivo: `web/src/lib/actions/geofences.ts`.

```ts
// Tipos exportados
export type ShapeInput =
  | { kind: 'polygon'; coordinates: [number, number][] }       // [lng, lat][], fechado (primeiro == último)
  | { kind: 'rectangle'; coordinates: [number, number][] }     // 5 pontos (4 + fechamento)
  | {
      kind: 'circle';
      center: [number, number];                                // [lng, lat]
      radiusM: number;
      polygon: [number, number][];                             // aproximação 64 lados, fechada
    };

export type CreateGeofenceInput = {
  name: string;
  type: 'inclusion' | 'exclusion';
  active: boolean;
  shape: ShapeInput;
};

export type UpdateGeofenceMetaInput = {
  name?: string;
  type?: 'inclusion' | 'exclusion';
  active?: boolean;
};

// Funções
export async function getGeofences(): Promise<Geofence[]>;                                          // já existe
export async function getGeofence(id: string): Promise<Geofence | null>;                            // nova; usada em edit-shape
export async function createGeofence(input: CreateGeofenceInput): Promise<{ id: string } | { error: string }>;
export async function updateGeofenceMeta(id: string, input: UpdateGeofenceMetaInput): Promise<{ ok: true } | { error: string }>;
export async function updateGeofenceShape(id: string, shape: ShapeInput): Promise<{ ok: true } | { error: string }>;
export async function deleteGeofence(id: string): Promise<{ ok: true } | { error: string }>;       // já existe
```

### Encoding de geometria

`area` é sempre persistido como `POLYGON(...)` via `ST_GeomFromText`. Para círculo, o cliente envia `polygon` (já calculado com `@turf/circle`) junto com `center` e `radiusM`; o server grava os três.

Exemplo de INSERT (círculo):

```sql
INSERT INTO geofences (tenant_id, name, type, active, shape_type, area, center, radius_m)
VALUES (
  $1, $2, $3, $4, 'circle',
  ST_GeomFromText($5, 4326),         -- POLYGON(...)
  ST_GeomFromText($6, 4326),         -- POINT(lng lat)
  $7                                 -- radius_m
);
```

Polígono/retângulo: mesmo INSERT com `center = NULL`, `radius_m = NULL`, `shape_type = 'polygon'` ou `'rectangle'`.

### Validações server-side

- `name` não vazio e ≤100 chars; trim aplicado antes de gravar.
- `type` em `('inclusion','exclusion')`.
- `shape.coordinates` com ≥4 pontos para polygon (3 distintos + fechamento); ≥5 para rectangle (4 + fechamento).
- Para circle: `radiusM > 0` e `radiusM ≤ 100000` (100 km, sanidade); `polygon.length ≥ 5`.
- Primeiro e último ponto iguais (fechamento).

Erros retornam `{ error: string }` em pt-BR. RLS no Supabase garante isolamento por tenant; `getTenantId()` popula `tenant_id`.

### Revalidação

Toda mutation chama `revalidatePath('/geofences')` e `revalidatePath('/map')`.

## Componentes

### `GeofenceEditorMap`

Client component, `dynamic(() => import('./geofence-editor-map'), { ssr: false })` no pai.

```tsx
type Props = {
  mode: 'create' | 'edit-shape';
  initialShape?: { shape_type: GeofenceShape; area: GeoJSONPolygon; center?: [number, number]; radiusM?: number };
  onShapeReady: (shape: ShapeInput | null) => void;  // null quando limpa
};
```

Monta `<MapContainer>` + `<TileLayer>` padrão + `<MapGeomanController>` (child que consome `useMap()` e instala/remove Geoman). No `mode='create'`, Geoman toolbar com polygon/rectangle/circle ativos. No `mode='edit-shape'`, pega `initialShape`, monta a camada apropriada, chama `pm.enable()`.

Eventos Geoman tratados:

- `pm:create` → converte layer em `ShapeInput` → chama `onShapeReady`.
- `pm:edit` → mesmo para edit-shape.
- `pm:remove` → chama `onShapeReady(null)`.

### `GeofenceEditor`

Compõe `GeofenceEditorMap` + `GeofenceDialog` em paralelo. No `mode='create'`, exibe dialog quando `shape !== null` e `dialogOpen === true`. Botão "Confirmar geocerca" no topo do mapa abre o dialog. "Cancelar" no dialog limpa a forma (via ref para Geoman remover) e fecha.

No `mode='edit-shape'`, mostra apenas botões "Salvar" e "Cancelar" na barra superior; sem dialog (metadados não mudam aqui).

### `GeofenceTable`

Expande o componente atual. Nova linha por geocerca:

```
| Nome (input inline)   | Tipo (select inline)    | Ativo (switch) | Criado em | Ações |
```

Ações: "Editar forma" (link para `/geofences/[id]/edit-shape`), "Excluir" (dialog de confirmação).

Edit inline: ao blur ou Enter, chama `updateGeofenceMeta` com o campo alterado. Durante a chamada, exibe spinner no campo; em erro, reverte valor e mostra toast.

### `GeofenceDialog`

Form padrão Shadcn:

- Input "Nome" (required, 1-100 chars).
- Select "Tipo": `Zona permitida` (value `inclusion`) | `Zona proibida` (value `exclusion`).
- Switch "Ativo" (default `true`).
- Botões "Cancelar" e "Salvar".

Recebe `onSubmit(meta)`, `onCancel`, `initialValues?`. Usado em create (controlado pelo `GeofenceEditor`) e potencialmente em edit-meta se decidirmos reusar (a tabela usa inputs inline por ora, mas o dialog fica disponível).

### `GeofenceLayer`

Read-only, usado em `/map` e em telas de edit para mostrar outras geocercas de referência (fora de escopo v1 — só `/map` por ora).

```tsx
type Props = {
  geofences: Geofence[];
  visible: boolean;
};
```

Quando `visible=false`, retorna `null`. Caso contrário, mapeia geocercas `active=true`, parseia `area` (GeoJSON do banco) e renderiza `<Polygon pathOptions={{ color, fillColor, fillOpacity: 0.2 }}>`. Cores:

- `type='inclusion'` → `#16a34a` (verde-600 Tailwind)
- `type='exclusion'` → `#dc2626` (vermelho-600)
- `active=false` → não renderiza (filtrado antes)

Popup com `<div>{name}</div><div>Zona {permitida|proibida}</div>`.

### Toggle no painel de camadas

O mapa usa o `LayersControl` nativo do `react-leaflet` (`web/src/components/map/tracking-map.tsx` linhas 118-143) com BaseLayers (Ruas / Detalhado / Satélite / Escuro) e, atualmente, nenhum Overlay. Adiciona um `<LayersControl.Overlay name="Geocercas" checked={showGeofences}>` envolvendo o `<GeofenceLayer>`.

Um `OverlayListener` (irmão do `BaseLayerListener` existente) escuta `overlayadd`/`overlayremove` do Leaflet e chama `onGeofenceToggle(visible)` no pai. O estado persiste em `dashboardMapPreferences.showGeofences` (default `true`), seguindo o mesmo padrão de `baseLayer` persistido no commit `4f6fce4`.

## Tratamento de Erros e Compatibilidade

### Falha em Server Action

Cada mutation retorna `{ error: string }` em pt-BR (ex: "Nome da geocerca é obrigatório"). O cliente exibe via toast (`sonner`, padrão do projeto) e mantém o dialog aberto.

### Polígono inválido

`@turf/circle` sempre gera polígono fechado e válido. Para polígono/retângulo, a validação `validatePolygon` roda no cliente antes de enviar e o server re-valida. Falha → erro claro.

### Geoman não carregou

Se `@geoman-io/leaflet-geoman-free` falhar em carregar (rede, build), o editor renderiza mensagem "Falha ao carregar ferramenta de desenho. Recarregue a página." A lista `/geofences` continua funcionando (só edit/create ficam inacessíveis).

### Geocerca existente com `area` nulo ou malformado

`getGeofences()` filtra geocercas com `area` inválido; `GeofenceLayer` ignora entradas sem polygon válido (defensive parsing). A tabela ainda mostra a geocerca para permitir exclusão.

### SSR

Tudo que importa Leaflet/Geoman entra via `dynamic(() => ..., { ssr: false })` nos boundaries de client component (padrão já estabelecido pelo `tracking-map.tsx`).

### Compatibilidade com geocercas antigas (sem `shape_type`)

A migration backfilla com `'polygon'` por default. Geocercas antigas funcionam normalmente (edit de forma, render no mapa). Não há round-trip de círculo — quem quiser círculo cria de novo.

### Performance

Geocercas por tenant: dezenas típicas. Render direto sem virtualização. Se um tenant tiver >200, reavaliamos paginação na lista e simplificação do polígono na camada read-only. Fora do escopo v1.

## Cobertura de Testes

### Unitários (Vitest)

- `shape-utils.test.ts`:
  - `circleToPolygon` — gera polígono fechado com exatamente 65 pontos (64 + fechamento), primeiro igual ao último, centro aproximadamente no input (média das coordenadas a menos de 1m para raio típico);
  - `validatePolygon` — rejeita <3 vértices distintos, não fechado, coordenadas fora de `[-180,180]`/`[-90,90]`;
  - `validateRadius` — rejeita ≤0, >100000;
  - `geomanShapeToInput` — stub de layer Geoman para cada tipo retorna `ShapeInput` correto (polygon, rectangle, circle).
- `geofences-actions.test.ts`:
  - `createGeofence` com payload inválido retorna `{ error }`;
  - encoding de WKT para polygon e point batem com o esperado (verifica string passada ao `ST_GeomFromText`);
  - tenant_id é sempre injetado;
  - `updateGeofenceShape` aceita mudança de forma (mesmo shape_type) e atualiza `area`/`center`/`radius_m` consistente;
  - `deleteGeofence` existente continua passando.

### Integração / manual

1. Criar polígono de 5 vértices → salvar → reabrir em edit-shape → vértices idênticos.
2. Criar retângulo → salvar → reabrir em edit-shape → Geoman mostra modo rectangle.
3. Criar círculo com raio 500m → salvar → reabrir em edit-shape → vê círculo com handle de centro e raio; muda raio para 1000m → salva → reabre → `radius_m` no banco é 1000.
4. Editar nome inline na tabela → recarrega → nome persistido.
5. Alternar ativo de uma geocerca → no `/map`, com toggle ligado, a geocerca some quando inativa.
6. Excluir geocerca → confirmação → sumiu da lista e do mapa.
7. Toggle "Geocercas" no `/map` liga/desliga; estado sobrevive a reload da página.
8. Duas geocercas (uma inclusion, uma exclusion) renderizam verde e vermelho simultaneamente.
9. Popup ao clicar em geocerca no mapa mostra nome e tipo.
10. Lint + typecheck: `cd web && npm run lint && npm run build` verdes.

### Não cobertos nesta spec

- Testes de avaliação de geofence no gateway Go (fora do escopo).
- Teste de RLS entre tenants (coberto por testes existentes da plataforma).

## Critérios de Sucesso

1. Usuário cria polígono, retângulo e círculo pela UI e vê persistência correta no banco (3 tipos + `center`/`radius_m` para círculo).
2. Edit inline na tabela atualiza nome, tipo e ativo sem reload de página.
3. Edit de forma permite drag de vértices (polygon/rectangle) e drag de centro/raio (circle), preservando `shape_type`.
4. Excluir geocerca remove da tabela e do mapa principal.
5. `/map` mostra geocercas ativas coloridas (verde/vermelho) quando toggle ligado; some quando desligado; estado do toggle persiste entre sessões.
6. Round-trip: criar círculo 500m → editar raio para 1000m → recarregar → ver círculo 1000m exato.
7. Migration aplica em banco com geocercas pré-existentes sem erro; geocercas antigas ganham `shape_type='polygon'` e continuam funcionando.
8. Lint, typecheck e build do `web/` passam.
9. Tudo em pt-BR (labels, mensagens de erro, toasts).
10. Gateway Go não é tocado; feature opera puramente na camada web + banco.
