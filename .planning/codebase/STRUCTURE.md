# Codebase Structure

**Analysis Date:** 2026-04-05

## Directory Layout

```text
tracker/
├── gateway/              # Go TCP ingest service
├── simulator/            # Go device traffic generator
├── supabase/             # SQL migrations, local Supabase config, and seed data
├── web/                  # Next.js dashboard application
├── docs/                 # Project docs outside runtime code
├── .planning/codebase/   # Generated codebase reference documents
└── Makefile              # Root command entrypoint for services and database tasks
```

## Directory Purposes

**`gateway/`:**
- Purpose: Own the production ingest runtime for device traffic.
- Contains: `gateway/cmd/gateway/main.go`, package-local code in `gateway/internal/`, Go module files in `gateway/go.mod`, and generated binaries in `gateway/bin/`.
- Key files: `gateway/cmd/gateway/main.go`, `gateway/internal/server/tcp.go`, `gateway/internal/storage/writer.go`, `gateway/internal/alerts/engine.go`, and `gateway/internal/protocol/protocol.go`.

**`gateway/internal/config/`:**
- Purpose: Keep environment-driven runtime configuration isolated from bootstrap code.
- Contains: `gateway/internal/config/config.go` and `gateway/internal/config/config_test.go`.
- Key files: `gateway/internal/config/config.go`.

**`gateway/internal/server/`:**
- Purpose: Hold transport-facing TCP logic.
- Contains: `gateway/internal/server/tcp.go` and `gateway/internal/server/tcp_test.go`.
- Key files: `gateway/internal/server/tcp.go`.

**`gateway/internal/protocol/`:**
- Purpose: Group protocol abstractions and concrete Suntech parsers.
- Contains: `gateway/internal/protocol/protocol.go`, `gateway/internal/protocol/suntech.go`, `gateway/internal/protocol/suntech_binary.go`, and matching `_test.go` files.
- Key files: `gateway/internal/protocol/protocol.go`, `gateway/internal/protocol/suntech.go`, and `gateway/internal/protocol/suntech_binary.go`.

**`gateway/internal/storage/`:**
- Purpose: Hold database-oriented ingest helpers.
- Contains: `gateway/internal/storage/writer.go`, `gateway/internal/storage/pending.go`, `gateway/internal/storage/buffer.go`, and matching tests.
- Key files: `gateway/internal/storage/writer.go`, `gateway/internal/storage/pending.go`, and `gateway/internal/storage/buffer.go`.

**`gateway/internal/alerts/`:**
- Purpose: Keep alert rule synchronization and evaluation together.
- Contains: `gateway/internal/alerts/engine.go`, `gateway/internal/alerts/sync.go`, and `_test.go` files.
- Key files: `gateway/internal/alerts/engine.go` and `gateway/internal/alerts/sync.go`.

**`gateway/internal/metrics/`:**
- Purpose: Expose ingest metrics.
- Contains: `gateway/internal/metrics/metrics.go`.
- Key files: `gateway/internal/metrics/metrics.go`.

**`simulator/`:**
- Purpose: Provide a standalone CLI for sending fake Suntech packets to the gateway.
- Contains: `simulator/cmd/simulator/main.go`, `simulator/internal/suntech/generator.go`, and tests.
- Key files: `simulator/cmd/simulator/main.go` and `simulator/internal/suntech/generator.go`.

**`supabase/`:**
- Purpose: Store database definition and local Supabase project config.
- Contains: versioned SQL files in `supabase/migrations/`, seed data in `supabase/seed.sql`, and CLI config in `supabase/config.toml`.
- Key files: `supabase/migrations/20260318104457_positions.sql`, `supabase/migrations/20260318104558_rls_policies.sql`, `supabase/migrations/20260403_latest_positions_realtime.sql`, `supabase/seed.sql`, and `supabase/config.toml`.

**`web/`:**
- Purpose: Hold the dashboard UI and all app-side integration logic.
- Contains: Next.js config in `web/next.config.ts`, TypeScript config in `web/tsconfig.json`, test config in `web/vitest.config.ts`, and the application source tree in `web/src/`.
- Key files: `web/package.json`, `web/next.config.ts`, `web/tsconfig.json`, and `web/src/app/layout.tsx`.

**`web/src/app/`:**
- Purpose: Define routes, route groups, layouts, and route handlers.
- Contains: authenticated routes in `web/src/app/(dashboard)/`, public auth routes in `web/src/app/(auth)/`, the auth callback route in `web/src/app/auth/callback/route.ts`, and app-wide layout/style files.
- Key files: `web/src/app/layout.tsx`, `web/src/app/(dashboard)/layout.tsx`, `web/src/app/(dashboard)/page.tsx`, `web/src/app/(dashboard)/devices/page.tsx`, `web/src/app/(dashboard)/history/page.tsx`, and `web/src/app/auth/callback/route.ts`.

**`web/src/components/`:**
- Purpose: Hold reusable UI split by feature/domain.
- Contains: domain folders such as `web/src/components/map/`, `web/src/components/devices/`, `web/src/components/vehicles/`, `web/src/components/alerts/`, and base primitives in `web/src/components/ui/`.
- Key files: `web/src/components/map/tracking-map.tsx`, `web/src/components/map/history-player.tsx`, `web/src/components/devices/device-table.tsx`, `web/src/components/vehicles/vehicle-table.tsx`, and `web/src/components/dashboard/sidebar.tsx`.

**`web/src/lib/actions/`:**
- Purpose: Centralize server actions and request-scoped application logic.
- Contains: resource-specific action modules such as `web/src/lib/actions/devices.ts`, `web/src/lib/actions/vehicles.ts`, `web/src/lib/actions/positions.ts`, and `web/src/lib/actions/reports.ts`.
- Key files: `web/src/lib/actions/auth.ts`, `web/src/lib/actions/devices.ts`, `web/src/lib/actions/vehicles.ts`, `web/src/lib/actions/positions.ts`, `web/src/lib/actions/pending-devices.ts`, and `web/src/lib/actions/utils.ts`.

**`web/src/lib/supabase/`:**
- Purpose: Keep Supabase client construction and middleware glue isolated.
- Contains: `web/src/lib/supabase/server.ts`, `web/src/lib/supabase/client.ts`, and `web/src/lib/supabase/middleware.ts`.
- Key files: `web/src/lib/supabase/server.ts`, `web/src/lib/supabase/client.ts`, and `web/src/lib/supabase/middleware.ts`.

**`web/src/lib/map/` and `web/src/lib/history/`:**
- Purpose: Hold pure helpers that map DB data into frontend behavior.
- Contains: `web/src/lib/map/position-location.ts`, `web/src/lib/map/dashboard-map-utils.ts`, and `web/src/lib/history/history-player-utils.ts` plus colocated tests.
- Key files: `web/src/lib/map/position-location.ts`, `web/src/lib/map/dashboard-map-utils.ts`, and `web/src/lib/history/history-player-utils.ts`.

**`web/src/lib/hooks/`:**
- Purpose: Hold custom React hooks for browser-only concerns.
- Contains: `web/src/lib/hooks/use-realtime-positions.ts`.
- Key files: `web/src/lib/hooks/use-realtime-positions.ts`.

**`web/src/types/`:**
- Purpose: Hold shared TypeScript types that are not component-local.
- Contains: generated database types in `web/src/types/database.ts`.
- Key files: `web/src/types/database.ts`.

## Key File Locations

**Entry Points:**
- `Makefile`: root task runner for gateway, web, simulator, and Supabase commands.
- `gateway/cmd/gateway/main.go`: gateway process entrypoint.
- `simulator/cmd/simulator/main.go`: simulator CLI entrypoint.
- `web/src/app/layout.tsx`: root Next.js layout.
- `web/src/proxy.ts`: request-level auth/session guard for the web app.
- `web/src/app/auth/callback/route.ts`: auth callback route for Supabase session exchange.

**Configuration:**
- `gateway/internal/config/config.go`: gateway env parsing and defaults.
- `web/package.json`: web scripts and dependency list.
- `web/next.config.ts`: Next.js build/runtime config.
- `web/tsconfig.json`: path aliases and compiler settings.
- `web/vitest.config.ts`: test alias and include pattern.
- `supabase/config.toml`: local Supabase services and ports.

**Core Logic:**
- `gateway/internal/server/tcp.go`: socket ingest loop.
- `gateway/internal/protocol/protocol.go`: parser abstraction.
- `gateway/internal/storage/writer.go`: batch insert logic and device cache.
- `gateway/internal/alerts/engine.go`: in-memory rule evaluation.
- `web/src/lib/actions/positions.ts`: dashboard and history data fetching.
- `web/src/lib/actions/devices.ts`: device CRUD.
- `web/src/lib/actions/vehicles.ts`: vehicle CRUD and association.
- `web/src/app/(dashboard)/dashboard-map.tsx`: client orchestration for the live map page.
- `web/src/components/map/history-player.tsx`: history playback UI.
- `supabase/migrations/20260403_latest_positions_realtime.sql`: latest-position projection for Realtime.

**Testing:**
- `gateway/internal/**/*_test.go`: Go package-level tests next to implementation.
- `simulator/internal/suntech/generator_test.go`: simulator behavior tests.
- `web/src/**/*.test.ts`: non-React helper tests such as `web/src/lib/map/position-location.test.ts`.
- `web/src/**/*.test.tsx`: React and route tests such as `web/src/components/map/dashboard-mobile-sheet.test.tsx` and `web/src/app/(dashboard)/dashboard-map.test.tsx`.

## Naming Conventions

**Files:**
- Next.js route files use framework names: `page.tsx`, `layout.tsx`, and `route.ts` in `web/src/app/`.
- Web feature modules use kebab-case filenames such as `web/src/components/map/history-query-toolbar.tsx` and `web/src/lib/map/dashboard-map-utils.ts`.
- Go source files use lowercase names with underscores where needed, such as `gateway/internal/protocol/suntech_binary.go`.
- SQL migrations use timestamp-prefixed or date-prefixed filenames in `supabase/migrations/`, for example `supabase/migrations/20260318104558_rls_policies.sql`.

**Directories:**
- Product feature folders are grouped by domain, not by technical layer, inside `web/src/components/` and `web/src/lib/actions/`; examples include `web/src/components/devices/` and `web/src/lib/actions/`.
- Route groups use Next.js grouping syntax in `web/src/app/(auth)/` and `web/src/app/(dashboard)/`.
- Go internal packages stay flat under `gateway/internal/` with one responsibility per directory: `alerts`, `config`, `metrics`, `protocol`, `server`, and `storage`.

## Where to Add New Code

**New Dashboard Page:**
- Primary code: add the route under `web/src/app/(dashboard)/<feature>/page.tsx`.
- Shared page layout concerns: keep them in `web/src/app/(dashboard)/layout.tsx` unless the feature needs a nested layout.
- Data fetching: create or extend a server action module in `web/src/lib/actions/<feature>.ts`.
- UI: add page-specific widgets under `web/src/components/<feature>/`.
- Tests: colocate route tests or component tests under the same feature path, for example `web/src/app/(dashboard)/<feature>/<name>.test.tsx` or `web/src/components/<feature>/<name>.test.tsx`.

**New Auth/Public Page:**
- Implementation: add it under `web/src/app/(auth)/` when it belongs to the unauthenticated auth flow.
- Session-related redirects: update `web/src/lib/supabase/middleware.ts` or `web/src/proxy.ts` if the route needs to bypass auth protection.

**New Web Data Operation:**
- Implementation: place the server action in `web/src/lib/actions/<domain>.ts`.
- Tenant lookup helpers: reuse `web/src/lib/actions/utils.ts` rather than duplicating profile-to-tenant logic.
- Supabase client construction: reuse `web/src/lib/supabase/server.ts` for server code and `web/src/lib/supabase/client.ts` for browser subscriptions.

**New Map or Playback Logic:**
- Pure calculations: place them in `web/src/lib/map/` or `web/src/lib/history/`.
- Interactive map widgets: place them in `web/src/components/map/`.
- Realtime subscriptions: extend `web/src/lib/hooks/use-realtime-positions.ts` or add adjacent hooks in `web/src/lib/hooks/`.

**New Gateway Ingest Behavior:**
- Protocol detection/parsing: add a parser file under `gateway/internal/protocol/` and register it in `gateway/cmd/gateway/main.go`.
- TCP lifecycle changes: update `gateway/internal/server/tcp.go`.
- Position persistence or device cache changes: update `gateway/internal/storage/`.
- Alert rule logic: update `gateway/internal/alerts/`.
- Tests: add `*_test.go` next to the package you change.

**New Database Schema or Policy:**
- Schema change: add a new SQL migration file to `supabase/migrations/`; do not edit `web/src/types/database.ts` by hand.
- Generated app types: regenerate `web/src/types/database.ts` through the root `Makefile` target after applying migrations.
- Seed data: keep non-schema inserts in `supabase/seed.sql`.

**New Simulator Capability:**
- CLI flags and main loop: update `simulator/cmd/simulator/main.go`.
- Message or route generation helpers: add them under `simulator/internal/suntech/`.

**Utilities:**
- Shared frontend helpers: `web/src/lib/utils.ts`, `web/src/lib/map/`, or `web/src/lib/history/` depending on scope.
- Avoid creating a generic `helpers/` directory at the repo root; follow the existing per-service placement instead.

## Special Directories

**`gateway/bin/`:**
- Purpose: build output for gateway binaries.
- Generated: Yes.
- Committed: No.

**`web/.next/`:**
- Purpose: local Next.js build and dev output.
- Generated: Yes.
- Committed: No.

**`supabase/.temp/`:**
- Purpose: Supabase CLI local state and cached metadata.
- Generated: Yes.
- Committed: No.

**`web/src/types/`:**
- Purpose: hold generated database typings consumed by the web app.
- Generated: Partially; `web/src/types/database.ts` is generated.
- Committed: Yes.

**`.planning/codebase/`:**
- Purpose: generated codebase reference docs for GSD workflows.
- Generated: Yes.
- Committed: Yes.

---

*Structure analysis: 2026-04-05*
