# Architecture

**Analysis Date:** 2026-04-05

## Pattern Overview

**Overall:** Service-oriented monorepo with a SQL-first backend and a route-driven web frontend.

**Key Characteristics:**
- `gateway/` owns device ingest, protocol parsing, buffering, alert evaluation, and writes into PostgreSQL through package-local services such as `gateway/internal/server/tcp.go`, `gateway/internal/protocol/protocol.go`, and `gateway/internal/storage/writer.go`.
- `web/` is a Next.js App Router application where pages in `web/src/app/` compose server actions from `web/src/lib/actions/` with UI components from `web/src/components/`.
- `supabase/migrations/` is the schema source of truth; both the Go gateway and the Next.js app rely on tables, triggers, RLS policies, and Realtime setup defined there instead of local schema files.

## Layers

**Gateway Bootstrap Layer:**
- Purpose: Compose the long-running ingest process and wire background workers.
- Location: `gateway/cmd/gateway/main.go`
- Contains: process startup, env config loading, database pool creation, writer setup, alert engine setup, protocol registry setup, metrics startup, and graceful shutdown.
- Depends on: `gateway/internal/config/config.go`, `gateway/internal/server/tcp.go`, `gateway/internal/storage/writer.go`, `gateway/internal/alerts/engine.go`, `gateway/internal/alerts/sync.go`, `gateway/internal/metrics/metrics.go`, and `gateway/internal/protocol/protocol.go`.
- Used by: `make gateway-run`, `make gateway-build`, and production execution of the gateway binary.

**Gateway Transport Layer:**
- Purpose: Accept TCP connections and transform raw socket frames into parsed device messages.
- Location: `gateway/internal/server/tcp.go`
- Contains: the TCP listener, connection lifecycle handling, frame detection, parser selection, ACK sending, and dispatch to a position handler.
- Depends on: `gateway/internal/protocol/protocol.go` and concrete parsers such as `gateway/internal/protocol/suntech.go` and `gateway/internal/protocol/suntech_binary.go`.
- Used by: `gateway/cmd/gateway/main.go`.

**Gateway Protocol Layer:**
- Purpose: Normalize protocol-specific payloads into one `Position` model.
- Location: `gateway/internal/protocol/protocol.go`, `gateway/internal/protocol/suntech.go`, and `gateway/internal/protocol/suntech_binary.go`
- Contains: the `Position` struct, parser interface, registry, Suntech ASCII parser, and Suntech binary parser.
- Depends on: Go standard library only.
- Used by: `gateway/internal/server/tcp.go` and downstream gateway services.

**Gateway Persistence Layer:**
- Purpose: Map parsed device positions onto tenant-aware database writes.
- Location: `gateway/internal/storage/writer.go`, `gateway/internal/storage/pending.go`, and `gateway/internal/storage/buffer.go`
- Contains: active device cache loading, batch insert SQL generation, periodic flushing, unknown-device tracking, and fallback buffering.
- Depends on: the shared `pgxpool.Pool` created in `gateway/cmd/gateway/main.go` and the `positions`, `devices`, `vehicles`, and `pending_devices` tables created in `supabase/migrations/`.
- Used by: the `gateway` handler in `gateway/cmd/gateway/main.go`.

**Gateway Alert Layer:**
- Purpose: Keep alert rules in memory and evaluate them against each incoming position.
- Location: `gateway/internal/alerts/engine.go` and `gateway/internal/alerts/sync.go`
- Contains: rule model, in-memory engine, evaluators for `speed`, `ignition`, and `battery`, plus a sync worker that loads `alert_rules`.
- Depends on: `gateway/internal/protocol/protocol.go` and the `alert_rules` / `alerts` tables from `supabase/migrations/20260318104529_geofences_and_alerts.sql`.
- Used by: `gateway/cmd/gateway/main.go`.

**Web Route Layer:**
- Purpose: Define the authenticated and unauthenticated page tree.
- Location: `web/src/app/(auth)/`, `web/src/app/(dashboard)/`, `web/src/app/layout.tsx`, and `web/src/app/auth/callback/route.ts`
- Contains: route groups, layouts, page entry points, and the Supabase auth callback route.
- Depends on: server actions in `web/src/lib/actions/`, layout components such as `web/src/components/dashboard/sidebar.tsx`, and auth helpers in `web/src/lib/supabase/server.ts`.
- Used by: Next.js runtime via `web/package.json` scripts.

**Web Server Action Layer:**
- Purpose: Concentrate database reads, writes, and cache invalidation behind server-side functions.
- Location: `web/src/lib/actions/auth.ts`, `web/src/lib/actions/devices.ts`, `web/src/lib/actions/vehicles.ts`, `web/src/lib/actions/positions.ts`, `web/src/lib/actions/alerts.ts`, `web/src/lib/actions/geofences.ts`, `web/src/lib/actions/pending-devices.ts`, `web/src/lib/actions/reports.ts`, and `web/src/lib/actions/utils.ts`
- Contains: Supabase queries, auth mutations, CRUD mutations, report generation, and route revalidation.
- Depends on: `web/src/lib/supabase/server.ts`, `web/src/lib/actions/utils.ts`, and the tables defined in `supabase/migrations/`.
- Used by: server pages in `web/src/app/` and client components that call server actions directly.

**Web Client Interaction Layer:**
- Purpose: Handle browser-only state, live subscriptions, and Leaflet rendering.
- Location: `web/src/app/(dashboard)/dashboard-map.tsx`, `web/src/components/map/`, `web/src/components/devices/`, `web/src/components/vehicles/`, `web/src/components/alerts/`, and `web/src/lib/hooks/use-realtime-positions.ts`
- Contains: map rendering, mobile/desktop dashboard chrome, dialogs, tables, and realtime updates from Supabase.
- Depends on: server actions, `web/src/lib/supabase/client.ts`, and browser-only libraries declared in `web/package.json`.
- Used by: route files under `web/src/app/(dashboard)/`.

**Database Layer:**
- Purpose: Hold the multi-tenant domain model and DB-side automation.
- Location: `supabase/migrations/`, `supabase/seed.sql`, and `supabase/config.toml`
- Contains: DDL, partitioned `positions`, `latest_positions` trigger-based projection, RLS policies, helper SQL functions, and seed data.
- Depends on: Supabase CLI and PostgreSQL/PostGIS.
- Used by: both `gateway/` and `web/`.

**Simulation Layer:**
- Purpose: Generate fake Suntech traffic against the ingest port.
- Location: `simulator/cmd/simulator/main.go` and `simulator/internal/suntech/generator.go`
- Contains: CLI flags, TCP client loop, route generation, and message generation.
- Depends on: the protocol assumptions implemented in `gateway/internal/protocol/suntech.go`.
- Used by: local development and ingest verification.

## Data Flow

**Device Position Ingest:**

1. `gateway/cmd/gateway/main.go` starts the TCP server from `gateway/internal/server/tcp.go` and injects a `gateway` handler.
2. `gateway/internal/server/tcp.go` reads each frame, picks a parser from `gateway/internal/protocol/protocol.go`, parses it, optionally writes protocol ACK bytes, and calls `HandlePosition`.
3. `gateway/cmd/gateway/main.go` resolves the device through `gateway/internal/storage/writer.go`; unknown identifiers are sent to `gateway/internal/storage/pending.go`, while known positions are enqueued for batch persistence.
4. `gateway/internal/alerts/engine.go` evaluates the same position against in-memory rules synchronized by `gateway/internal/alerts/sync.go`; triggered alerts are inserted into `alerts`.
5. `gateway/internal/storage/writer.go` flushes to the `positions` table defined in `supabase/migrations/20260318104457_positions.sql`.
6. The trigger in `supabase/migrations/20260403_latest_positions_realtime.sql` upserts one row per device into `latest_positions` so Supabase Realtime can broadcast frontend-friendly updates.

**Dashboard Map Read Path:**

1. `web/src/app/(dashboard)/page.tsx` calls `getLatestPositions` from `web/src/lib/actions/positions.ts` on the server.
2. `web/src/lib/actions/positions.ts` reads active devices, fetches their most recent `positions` rows, and maps PostGIS values through `web/src/lib/map/position-location.ts`.
3. `web/src/app/(dashboard)/dashboard-map.tsx` receives the initial snapshot, dynamically loads `web/src/components/map/tracking-map.tsx`, and manages UI selection/filter state.
4. `web/src/lib/hooks/use-realtime-positions.ts` subscribes to `latest_positions` through `web/src/lib/supabase/client.ts` and merges updates into local React state keyed by `device_id`.

**Authenticated CRUD Path:**

1. Layout and session protection run through `web/src/proxy.ts` and `web/src/lib/supabase/middleware.ts`.
2. A page such as `web/src/app/(dashboard)/devices/page.tsx` or `web/src/app/(dashboard)/vehicles/page.tsx` gathers initial data from server actions.
3. Interactive components such as `web/src/components/devices/device-dialog.tsx` and `web/src/components/vehicles/vehicle-dialog.tsx` call mutation actions in `web/src/lib/actions/devices.ts` or `web/src/lib/actions/vehicles.ts`.
4. Each action writes through Supabase with RLS enforced by `supabase/migrations/20260318104558_rls_policies.sql`, then invalidates route output with `revalidatePath`.

**State Management:**
- Durable application state lives in Supabase tables declared in `supabase/migrations/`.
- Request-scoped server state is resolved inside server actions such as `web/src/lib/actions/utils.ts`.
- Browser state is local and component-scoped, using `useState`, `useEffect`, and custom hooks like `web/src/lib/hooks/use-realtime-positions.ts`.
- Gateway runtime state is in-memory and package-local, mainly the device cache in `gateway/internal/storage/writer.go`, alert rules in `gateway/internal/alerts/engine.go`, and connection counters in `gateway/internal/server/tcp.go`.

## Key Abstractions

**Normalized Position Model:**
- Purpose: Represent one device location update independently of transport format.
- Examples: `gateway/internal/protocol/protocol.go`, `web/src/components/map/types.ts`, and `web/src/lib/actions/positions.ts`
- Pattern: transport-specific parsing first, then app-specific projection per consumer.

**Protocol Registry:**
- Purpose: Keep protocol identification and parsing extensible.
- Examples: `gateway/internal/protocol/protocol.go`, `gateway/internal/protocol/suntech.go`, and `gateway/internal/protocol/suntech_binary.go`
- Pattern: registry plus parser interface; add new parser implementations without changing the TCP server loop.

**Server Actions as Application Services:**
- Purpose: Centralize app-side database access behind explicit functions instead of sprinkling Supabase calls in page components.
- Examples: `web/src/lib/actions/devices.ts`, `web/src/lib/actions/vehicles.ts`, `web/src/lib/actions/positions.ts`, and `web/src/lib/actions/reports.ts`
- Pattern: `use server` modules return typed data or simple `{ error | success }` payloads and own cache revalidation.

**SQL Projection for Realtime:**
- Purpose: Separate write-optimized partitioned history from read-optimized live subscriptions.
- Examples: `supabase/migrations/20260318104457_positions.sql` and `supabase/migrations/20260403_latest_positions_realtime.sql`
- Pattern: append-only historical table plus trigger-maintained latest-state table.

## Entry Points

**Gateway Service:**
- Location: `gateway/cmd/gateway/main.go`
- Triggers: `make gateway-run`, `make gateway-build`, or direct `go run ./cmd/gateway`.
- Responsibilities: bootstrap dependencies, start background workers, receive TCP traffic, and shut down gracefully.

**Web Application:**
- Location: `web/src/app/layout.tsx`, `web/src/app/(auth)/`, and `web/src/app/(dashboard)/`
- Triggers: `npm run dev` or `npm run build` from `web/package.json`.
- Responsibilities: render pages, enforce auth boundaries, and compose server/client UI.

**Web Auth Proxy:**
- Location: `web/src/proxy.ts`
- Triggers: Next.js request pipeline for matched routes.
- Responsibilities: route all non-static requests through `web/src/lib/supabase/middleware.ts` for session refresh and login redirects.

**Simulator CLI:**
- Location: `simulator/cmd/simulator/main.go`
- Triggers: `make simulator-run` or direct `go run ./cmd/simulator`.
- Responsibilities: open a TCP connection and emit fake Suntech messages at a configurable interval.

**Database Migration Stream:**
- Location: `supabase/migrations/`
- Triggers: `make db-push`, `make db-reset`, or direct Supabase CLI usage from the root `Makefile`.
- Responsibilities: evolve schema, policies, triggers, and generated database-facing types.

## Error Handling

**Strategy:** Fail fast on startup misconfiguration, log and continue on per-message ingest problems, and surface application errors from web actions either by throwing or by returning small status objects.

**Patterns:**
- `gateway/cmd/gateway/main.go` exits the process when config or database bootstrap fails.
- `gateway/internal/server/tcp.go` logs unknown protocols and parse failures, then continues serving the same process.
- `gateway/internal/storage/writer.go` routes failed flushes into the fallback buffer callback instead of dropping the entire process.
- `web/src/lib/actions/positions.ts` and `web/src/lib/actions/reports.ts` throw `Error` for failed queries on read paths.
- `web/src/lib/actions/auth.ts`, `web/src/lib/actions/devices.ts`, and `web/src/lib/actions/vehicles.ts` often return `{ error: string }` or `{ success: true }` for form-driven mutations.
- `web/src/lib/supabase/middleware.ts` converts auth absence into redirects instead of rendering protected pages.

## Cross-Cutting Concerns

**Logging:** `gateway/cmd/gateway/main.go` configures JSON `slog` and passes the logger into storage, alerts, metrics, and server packages. The web app relies mainly on framework behavior and does not define a shared logging layer in `web/src/`.

**Validation:** Runtime validation is mostly implicit. `gateway/internal/config/config.go` validates env parsing, protocol parsers validate frame shape, and database rules in `supabase/migrations/` enforce most structural constraints. The web app does not maintain a separate validation layer beyond basic field parsing inside action files such as `web/src/lib/actions/vehicles.ts`.

**Authentication:** Session handling is centralized in `web/src/lib/supabase/server.ts`, `web/src/lib/supabase/client.ts`, `web/src/lib/supabase/middleware.ts`, and `web/src/app/auth/callback/route.ts`. Tenant isolation is enforced in SQL through `supabase/migrations/20260318104558_rls_policies.sql`.

---

*Architecture analysis: 2026-04-05*
