# Codebase Structure

**Analysis Date:** 2026-04-04

## Directory Layout

```
tracker/
├── gateway/                          # Go TCP server (position ingestion + alerts)
│   ├── cmd/
│   │   └── gateway/
│   │       └── main.go              # Entry point: initialize server, DB, workers
│   ├── internal/
│   │   ├── config/                  # Load environment configuration
│   │   ├── server/                  # TCP server (connection handling)
│   │   ├── protocol/                # GPS protocol parsers (Suntech binary/ASCII)
│   │   ├── storage/                 # Position writer, device cache, pending devices
│   │   ├── alerts/                  # Alert rule engine and syncer
│   │   └── metrics/                 # Prometheus metrics export
│   ├── go.mod / go.sum              # Go dependencies
│   └── bin/                         # Compiled binary (generated)
│
├── web/                             # Next.js 16 SPA dashboard
│   ├── src/
│   │   ├── app/                     # Next.js App Router (route groups)
│   │   │   ├── layout.tsx           # Root layout (fonts, metadata)
│   │   │   ├── globals.css          # Tailwind CSS
│   │   │   ├── (auth)/              # Public auth routes
│   │   │   │   ├── login/page.tsx
│   │   │   │   ├── register/page.tsx
│   │   │   │   └── layout.tsx
│   │   │   ├── auth/callback/       # Supabase callback
│   │   │   │   └── route.ts
│   │   │   └── (dashboard)/         # Protected dashboard routes
│   │   │       ├── page.tsx         # Map (/)
│   │   │       ├── devices/page.tsx
│   │   │       ├── vehicles/page.tsx
│   │   │       ├── history/page.tsx
│   │   │       ├── alerts/page.tsx
│   │   │       ├── geofences/page.tsx
│   │   │       ├── reports/page.tsx
│   │   │       ├── layout.tsx       # Dashboard layout (sidebar, header)
│   │   │       └── dashboard-map.tsx # Map container component
│   │   │
│   │   ├── components/              # React UI components
│   │   │   ├── ui/                  # Shadcn UI primitives (Button, Card, etc.)
│   │   │   ├── dashboard/           # Dashboard-specific (Header, Sidebar, MobileNav)
│   │   │   ├── map/                 # Leaflet map components
│   │   │   │   ├── tracking-map.tsx # Main map with dynamic Leaflet
│   │   │   │   ├── vehicle-marker.tsx
│   │   │   │   ├── map-controller.tsx
│   │   │   │   ├── history-player.tsx
│   │   │   │   └── history-map-controller.tsx
│   │   │   ├── auth/                # Auth form components
│   │   │   ├── devices/             # Device CRUD components
│   │   │   ├── vehicles/            # Vehicle CRUD components
│   │   │   ├── alerts/              # Alert list/config components
│   │   │   └── geofences/           # Geofence components
│   │   │
│   │   ├── lib/                     # Business logic, hooks, utilities
│   │   │   ├── supabase/            # Supabase integration
│   │   │   │   ├── client.ts        # Browser client (createClient)
│   │   │   │   ├── server.ts        # Server client (createClient)
│   │   │   │   └── middleware.ts    # Session refresh + auth redirect
│   │   │   │
│   │   │   ├── actions/             # Next.js Server Actions
│   │   │   │   ├── auth.ts          # Login, register, logout
│   │   │   │   ├── devices.ts       # Device CRUD
│   │   │   │   ├── vehicles.ts      # Vehicle CRUD
│   │   │   │   ├── positions.ts     # Position queries (latest, history)
│   │   │   │   ├── alerts.ts        # Alert queries
│   │   │   │   ├── geofences.ts     # Geofence CRUD
│   │   │   │   ├── reports.ts       # Report generation
│   │   │   │   ├── pending-devices.ts # Pending device linking
│   │   │   │   └── utils.ts         # getTenantId() helper
│   │   │   │
│   │   │   ├── hooks/               # React hooks
│   │   │   │   └── use-realtime-positions.ts # Subscribe to position updates
│   │   │   │
│   │   │   ├── db/                  # Drizzle ORM client
│   │   │   │   └── index.ts         # db = drizzle(postgres(...))
│   │   │   │
│   │   │   └── utils.ts             # Utility functions (cn, etc.)
│   │   │
│   │   └── types/
│   │       └── database.ts          # Auto-generated Supabase types (make db-types)
│   │
│   ├── package.json                 # npm dependencies
│   ├── next.config.ts               # Next.js config
│   ├── tailwind.config.ts           # Tailwind CSS config
│   └── tsconfig.json                # TypeScript config
│
├── simulator/                       # Go TCP client (generates fake GPS data)
│   ├── cmd/
│   │   └── simulator/
│   │       └── main.go              # Entry point: parse flags, connect, send positions
│   ├── internal/
│   │   └── suntech/                 # Route generation, position generation
│   ├── go.mod / go.sum
│   └── bin/                         # Compiled binary (generated)
│
├── supabase/                        # Database migrations and config
│   ├── migrations/                  # Sequential SQL migrations (9 total)
│   │   ├── 20260318104209_extensions_and_enums.sql
│   │   ├── 20260318104403_tenants_and_profiles.sql
│   │   ├── 20260318104428_devices_and_vehicles.sql
│   │   ├── 20260318104457_positions.sql
│   │   ├── 20260318104529_geofences_and_alerts.sql
│   │   ├── 20260318104558_rls_policies.sql
│   │   ├── 20260318110000_add_vehicle_id_to_positions.sql
│   │   ├── 20260319_add_serial_and_pending_devices.sql
│   │   ├── 20260321_add_vehicle_name.sql
│   │   └── 20260403_latest_positions_realtime.sql
│   ├── config.toml                  # Supabase CLI config
│   └── seed.sql                     # Optional test data
│
├── docs/                            # Documentation
│   └── superpowers/
│       ├── specs/                   # Feature specifications (user stories, acceptance criteria)
│       └── plans/                   # Implementation plans (generated by gsd-planner)
│
├── .planning/                       # GSD generated documentation
│   └── codebase/                    # Codebase analysis documents (this dir)
│       ├── ARCHITECTURE.md
│       ├── STRUCTURE.md
│       ├── CONVENTIONS.md           # (if tech focus)
│       └── ...
│
├── Makefile                         # Build/run commands
├── CLAUDE.md                        # Project instructions
├── README.md                        # Project overview
└── docker-compose.yml               # Local Supabase setup (optional)
```

## Directory Purposes

**`gateway/cmd/gateway/`:**
- Purpose: Entry point and main application logic
- Contains: main.go only; all packages in internal/
- Key files: `main.go` (initialize DB pool, start TCP server, background workers)

**`gateway/internal/config/`:**
- Purpose: Environment variable loading and defaults
- Contains: Config struct, Load() function
- Key files: `config.go`, `config_test.go`

**`gateway/internal/server/`:**
- Purpose: TCP connection handling and protocol dispatch
- Contains: TCP server struct, connection lifecycle, reader loop
- Key files: `tcp.go` (main server), `tcp_test.go`

**`gateway/internal/protocol/`:**
- Purpose: GPS protocol parsing abstraction
- Contains: Parser interface, Position struct, Registry for routing, Suntech parser implementations
- Key files: `protocol.go` (interfaces), `suntech.go` (ASCII), `suntech_binary.go` (binary), tests

**`gateway/internal/storage/`:**
- Purpose: Batch writing, device caching, buffering, pending device tracking
- Contains: Writer (batches positions), Buffer (disk fallback), PendingWriter (unregistered devices)
- Key files: `writer.go`, `buffer.go`, `pending.go`, tests

**`gateway/internal/alerts/`:**
- Purpose: Alert rule evaluation and synchronization
- Contains: Engine (in-memory rule store + evaluators), Syncer (background reload from DB)
- Key files: `engine.go` (evaluation logic), `sync.go` (periodic reload)

**`gateway/internal/metrics/`:**
- Purpose: Prometheus metrics export
- Contains: Metrics struct, HTTP server for metrics endpoint
- Key files: `metrics.go`

**`web/src/app/`:**
- Purpose: Next.js App Router; each page is a route
- Contains: Page components, layouts, callback handlers
- Key files: All `page.tsx` files are routes; `layout.tsx` nests children

**`web/src/app/(dashboard)/`:**
- Purpose: Protected dashboard routes (wrapped in route group for shared layout)
- Contains: Dashboard page, sub-pages (devices, vehicles, history, etc.), DashboardMap component
- Key files: `page.tsx` (root map), `layout.tsx` (sidebar + header), `dashboard-map.tsx` (client component)

**`web/src/components/map/`:**
- Purpose: Leaflet map integration and vehicle markers
- Contains: TrackingMap (dynamic import), VehicleMarker (icon, popup), history player
- Key files: `tracking-map.tsx` (main map with layers), `vehicle-marker.tsx` (marker rendering), `history-player.tsx` (playback UI)

**`web/src/lib/supabase/`:**
- Purpose: Supabase client setup, middleware, session management
- Contains: Client initialization, middleware for session refresh and auth guards
- Key files: `client.ts` (browser), `server.ts` (server), `middleware.ts` (request handler)

**`web/src/lib/actions/`:**
- Purpose: Server Actions for data fetching and mutations
- Contains: Functions marked with "use server" for CRUD, queries, auth
- Key files: `devices.ts`, `vehicles.ts`, `positions.ts`, `alerts.ts`, `geofences.ts`, `reports.ts`, `auth.ts`, `utils.ts` (getTenantId)

**`web/src/lib/hooks/`:**
- Purpose: Custom React hooks
- Contains: Realtime subscription hook
- Key files: `use-realtime-positions.ts`

**`web/src/lib/db/`:**
- Purpose: Drizzle ORM client initialization
- Contains: Single db instance exported
- Key files: `index.ts` (drizzle(postgres(...)))

**`supabase/migrations/`:**
- Purpose: Sequential SQL migrations applied in order
- Contains: DDL for schema, RLS policies, triggers
- Order matters: Extensions/enums → Tenants → Devices → Positions → Geofences/Alerts → RLS → Updates → Pending → Realtime

## Key File Locations

**Entry Points:**
- `gateway/cmd/gateway/main.go`: Gateway startup, DB init, server listen
- `web/src/app/layout.tsx`: Web app root layout and metadata
- `web/src/app/auth/callback/route.ts`: Supabase OAuth callback handler
- `web/src/app/(dashboard)/page.tsx`: Dashboard map page

**Configuration:**
- `gateway/.env`: Gateway env vars (DATABASE_URL, TCP_PORT, METRICS_PORT)
- `web/.env.local`: Web env vars (Supabase keys, DATABASE_URL)
- `Makefile`: Build and run commands

**Core Logic:**
- `gateway/internal/protocol/protocol.go`: Position model and Parser interface
- `gateway/internal/storage/writer.go`: Batch writer and device cache
- `gateway/internal/alerts/engine.go`: Alert rule evaluation
- `web/src/lib/actions/`: All CRUD and queries (server actions)
- `web/src/lib/hooks/use-realtime-positions.ts`: Real-time subscription logic

**Testing:**
- `gateway/internal/**/*_test.go`: Go test files in same package as code
- `web/src/**/*.test.ts` or `.spec.ts`: Jest/Vitest tests (if present)

## Naming Conventions

**Files:**
- Go: `lowercase_with_underscores.go` (e.g., `tcp.go`, `writer_test.go`)
- TypeScript: `lowercase-with-dashes.ts` or `camelCase.ts` (mix observed, follow existing pattern in each dir)
- React components: `PascalCase.tsx` (e.g., `TrackingMap.tsx`, `VehicleMarker.tsx`)
- Pages: `page.tsx`, `layout.tsx`, `route.ts`
- Server Actions: `camelCase.ts` with `"use server"` directive (e.g., `getDevices`, `createDevice`)

**Directories:**
- Go packages: `lowercase_no_spaces` (e.g., `internal/server`, `internal/storage`)
- Next.js routes: Route groups in parentheses (e.g., `(dashboard)`, `(auth)`); segment names in lowercase (e.g., `/devices`, `/vehicles`)
- Component directories: `lowercase` (e.g., `components/map`, `components/dashboard`)
- Utility/lib: `lowercase` (e.g., `lib/supabase`, `lib/actions`)

## Where to Add New Code

**New Feature (e.g., geofence trigger alerts):**
- Primary code: 
  - Gateway: New evaluator in `gateway/internal/alerts/engine.go` (add case to evaluateRule switch)
  - Web: New Server Action in `web/src/lib/actions/geofences.ts` or extend existing
  - UI: New page or component in `web/src/app/(dashboard)/geofences/` or new component
- Tests: 
  - Gateway: `gateway/internal/alerts/engine_test.go` (add test case)
  - Web: Co-located `.test.ts` or in test directory (if configured)

**New Component/Module:**
- Implementation:
  - Reusable component: `web/src/components/{feature}/ComponentName.tsx`
  - Feature page: `web/src/app/(dashboard)/{feature}/page.tsx`
  - Server Action: `web/src/lib/actions/{feature}.ts`
  - Gateway protocol parser: `gateway/internal/protocol/{protocol}.go`

**Utilities:**
- Shared helpers: `web/src/lib/utils.ts` (for small utilities) or new file `web/src/lib/{domain}/helpers.ts`
- Go helpers: `gateway/internal/{package}/helpers.go` or in existing package file

**Database Schema:**
- New table/fields: `supabase/migrations/{timestamp}_{description}.sql`
- Must include RLS policy for any new table with tenant data
- Run `make db-types` after push to regenerate `web/src/types/database.ts`

## Special Directories

**`gateway/bin/`:**
- Purpose: Compiled binaries (generated, not committed)
- Generated: Yes (by `go build`)
- Committed: No

**`web/.next/`:**
- Purpose: Next.js build output cache
- Generated: Yes (by `npm run build` or dev server)
- Committed: No

**`web/node_modules/`:**
- Purpose: npm dependencies
- Generated: Yes (by `npm install`)
- Committed: No

**`supabase/.temp/`:**
- Purpose: Supabase CLI temporary files
- Generated: Yes (by `supabase` CLI)
- Committed: No

**`docs/superpowers/`:**
- Purpose: GSD-managed feature specs and plans
- Structure: `specs/` (user-written requirements), `plans/` (auto-generated implementation plans with code)
- Committed: Yes (part of workflow)

---

*Structure analysis: 2026-04-04*
