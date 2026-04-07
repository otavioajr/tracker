# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GPS fleet tracking platform (multi-tenant SaaS). Monorepo with three services:

- **Gateway** (`gateway/`) — Go 1.24 TCP server that receives GPS device data (Suntech protocol), buffers positions, evaluates alert rules, writes to PostgreSQL
- **Web** (`web/`) — Next.js 16 dashboard with real-time map tracking, device/vehicle CRUD, history playback, geofences, alerts, reports
- **Simulator** (`simulator/`) — Go 1.26 tool that generates fake GPS positions and sends them to the gateway via TCP

Database is Supabase (PostgreSQL + PostGIS) with Row-Level Security for tenant isolation. Migrations live in `supabase/migrations/`.

## Common Commands

All commands can be run via the root Makefile:

```bash
# Gateway
make gateway-build          # Build binary to gateway/bin/gateway
make gateway-run            # Run with go run
make gateway-test           # Run all tests: cd gateway && go test ./... -v

# Web (Next.js 16 + React 19)
make web-install            # npm install
make web-dev                # Next.js dev server
make web-build              # Production build
make web-test               # Run tests
cd web && npm run lint      # ESLint

# Simulator
make simulator-build
make simulator-run

# Database (requires Supabase CLI)
make db-push                # Push migrations to Supabase
make db-reset               # Reset database (destructive)
make db-migration name=X    # Create new migration
make db-types               # Generate TypeScript types → web/src/types/database.ts
```

Run a single Go test: `cd gateway && go test -v -run TestName ./internal/package/`

## Architecture

### Gateway (`gateway/`)

Entry point: `cmd/gateway/main.go`. TCP server on port 5001, metrics on 9090.

Internal packages:
- `config` — env-based configuration (requires `DATABASE_URL`)
- `server` — TCP connection handler
- `protocol` — Suntech GPS protocol parser, protocol registry
- `storage` — DB writer with buffered fallback, device cache
- `alerts` — Alert rule engine (`engine.go`) and rule syncer (`sync.go`)
- `metrics` — Prometheus-compatible metrics

### Web (`web/`)

Next.js App Router with route groups:
- `(auth)/` — login, register (public)
- `(dashboard)/` — all authenticated pages: map, devices, vehicles, history, alerts, geofences, reports

Key directories:
- `src/lib/supabase/` — client/server/middleware auth helpers
- `src/lib/actions/` — Server Actions: auth, devices, vehicles, positions, alerts, geofences, reports, pending-devices, utils
- `src/lib/db/` — Drizzle ORM client (`index.ts`; schema defined in migrations, not a static schema file)
- `src/lib/hooks/` — `use-realtime-positions.ts` for real-time position subscriptions
- `src/components/map/` — Leaflet map components: tracking-map, vehicle-marker, history-player (dynamically imported for SSR)
- `src/components/ui/` — Shadcn UI components (base-nova style)
- `src/types/database.ts` — Auto-generated Supabase types (via `make db-types`)

UI stack: Tailwind CSS v4, Shadcn UI (base-nova), next-themes for dark mode, Leaflet/react-leaflet for maps.

### Database

9 migrations in order: extensions/enums → tenants/profiles → devices/vehicles → positions (time-partitioned) → geofences/alerts → RLS policies → vehicle_id on positions → serial/pending devices → vehicle name field.

Multi-tenant via `tenant_id` on all tables + RLS policies using `auth.uid()` → profile → tenant lookup. Seed data in `supabase/seed.sql`.

## Environment Variables

Gateway (`gateway/.env`): `DATABASE_URL`, `TCP_PORT` (default 5001), `METRICS_PORT` (default 9090)

Web (`web/.env.local`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`

Example files: `gateway/.env.example`, `web/.env.local.example`

When creating a git worktree for this repository, always copy `web/.env.local` from the main workspace into the worktree's `web/.env.local` before running or testing the web app.

## Additional Notes
- When the user says "Use the agent teams or in portuguese use "Use o times de agentes" always use TeamCreate."
