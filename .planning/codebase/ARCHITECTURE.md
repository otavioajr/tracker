# Architecture

**Analysis Date:** 2026-04-04

## Pattern Overview

**Overall:** Three-tier microservices architecture with a Go TCP gateway receiving real-time GPS data, a PostgreSQL database with real-time subscriptions (Supabase), and a Next.js SPA dashboard. Multi-tenant SaaS with Row-Level Security (RLS) for data isolation.

**Key Characteristics:**
- Event-driven: GPS positions flow in → evaluation → storage → real-time broadcast
- Resilient buffering: Write failures fall back to disk buffering
- Protocol-agnostic: Registry pattern supports multiple GPS device protocols
- Real-time: Supabase Realtime for position updates; WebSocket subscriptions in React
- Multi-tenant: Tenant isolation via RLS policies on all tables

## Layers

**TCP Gateway (`gateway/cmd/gateway/main.go`):**
- Purpose: Receive incoming GPS device data via TCP, parse using protocol registry, evaluate alert rules in-memory, batch write to PostgreSQL with resilience
- Location: `gateway/cmd/gateway/main.go` (entry point), internal packages: `config`, `server`, `protocol`, `storage`, `alerts`, `metrics`
- Contains: TCP connection handler, protocol parsers (Suntech binary + ASCII), alert engine, batch writer, buffering logic, metrics exporter
- Depends on: PostgreSQL (via pgxpool), device/alert state (loaded from DB)
- Used by: GPS devices sending data via Suntech protocol

**Protocol Layer (`gateway/internal/protocol/`):**
- Purpose: Abstract device protocol handling via registry pattern
- Location: `gateway/internal/protocol/protocol.go` (interface), `gateway/internal/protocol/suntech.go` (ASCII), `gateway/internal/protocol/suntech_binary.go` (binary)
- Contains: `Parser` interface, `Position` data model, `Registry` for routing to correct parser
- Depends on: Nothing (pure parsing)
- Used by: TCP server to identify and parse incoming data

**Storage Layer (`gateway/internal/storage/`):**
- Purpose: Persist positions to PostgreSQL with automatic retry/buffering and maintain device cache
- Location: `gateway/internal/storage/writer.go` (batch writer), `gateway/internal/storage/buffer.go` (disk fallback), `gateway/internal/storage/pending.go` (unregistered devices)
- Contains: Batching logic (flushes at interval or size threshold), device cache keyed by IMEI, DB writer with connection pooling, file-based fallback buffer
- Depends on: PostgreSQL connection pool (`pgxpool`)
- Used by: Gateway handler to persist positions and track unknown devices

**Alert Engine (`gateway/internal/alerts/`):**
- Purpose: Evaluate alert rules in-memory on every position, evaluate against device/tenant context, persist triggered alerts
- Location: `gateway/internal/alerts/engine.go` (evaluation), `gateway/internal/alerts/sync.go` (background rule syncer)
- Contains: Rule store, rule evaluators (speed, ignition, battery), alert types
- Depends on: PostgreSQL for loading rules and persisting alerts
- Used by: Gateway handler to evaluate each position

**Web Application (`web/src/`):**
- Purpose: Multi-tenant SaaS dashboard with real-time map, device/vehicle CRUD, alerts, geofences, history playback, reports
- Location: `web/src/app/` (Next.js App Router), `web/src/lib/` (business logic), `web/src/components/` (UI)
- Contains: Auth pages, dashboard pages, server actions (CRUD), React components, Supabase clients, hooks for real-time subscriptions
- Depends on: Supabase (auth, database, Realtime subscriptions)
- Used by: End users via browser

**Authentication (`web/src/lib/supabase/`):**
- Purpose: Supabase Auth integration, session management, RLS enforcement via authenticated user context
- Location: `web/src/lib/supabase/client.ts` (browser client), `web/src/lib/supabase/server.ts` (server client), `web/src/lib/supabase/middleware.ts` (session update)
- Contains: Supabase client initialization, middleware for session refresh
- Depends on: Supabase Auth API
- Used by: All pages and server actions

**Database (`supabase/migrations/`):**
- Purpose: Multi-tenant PostgreSQL with PostGIS, time-partitioned positions table, Realtime subscriptions
- Location: `supabase/migrations/` (9 sequential migrations)
- Contains: Tables (tenants, profiles, devices, vehicles, positions, geofences, alerts, latest_positions), RLS policies, PostGIS geometry column, time partitioning on positions
- Depends on: PostgreSQL extensions (PostGIS, uuid-ossp)
- Used by: Gateway (write positions, read devices/rules), Web (read/write via Supabase client with RLS)

## Data Flow

**GPS Position Ingestion:**
1. GPS device connects via TCP to gateway on port 5001
2. TCP server receives raw bytes, passes to protocol registry
3. Registry identifies protocol (Suntech binary or ASCII), parser extracts Position struct
4. Position sent to gateway handler → alert engine evaluates rules → position enqueued to batch writer
5. Batch writer accumulates positions, flushes every 1s or at 100 size threshold to `positions` table
6. On write error: positions buffered to disk (`buffer.db`)
7. Triggered alerts inserted to `alerts` table (separate write path)

**Real-Time Position Broadcast (Dashboard):**
1. Server Action `getLatestPositions()` fetches latest position per device from `positions` table
2. Dashboard page loads with initial positions, renders map with markers
3. React hook `useRealtimePositions()` subscribes to Supabase Realtime changes on `latest_positions` table
4. When new position inserted, PostgreSQL trigger updates `latest_positions` materialized view
5. Realtime subscription delivers change → React state updates → markers move on map

**Device Registration Flow:**
1. Unknown IMEI arrives → `pending.Track()` records IMEI + remote IP to `pending_devices` table
2. Admin links pending device to actual device record in UI
3. Gateway reloads device cache every 30s via `LoadDevices()`
4. Future positions from that IMEI now found in cache → persisted normally

**State Management:**
- Gateway: In-memory device cache (keyed by IMEI), alert rules cache (in alert engine)
- Web: Client-side React state (Map position tracking), server-side session via Supabase Auth
- Database: Source of truth for all state (devices, positions, rules, alerts, geofences)

## Key Abstractions

**Position (`gateway/internal/protocol/protocol.go`):**
- Purpose: Unified data model for GPS position across all device protocols
- Examples: Struct with IMEI, latitude, longitude, speed, heading, battery, timestamp, raw data
- Pattern: Common struct extracted from different protocol formats; all parsers return same type

**Parser Interface (`gateway/internal/protocol/protocol.go`):**
- Purpose: Protocol abstraction allowing new device types without changing gateway core
- Examples: `Parser` interface with methods `Identify(data)`, `Parse(data)`, `ACK(data)`, `Name()`
- Pattern: Registry pattern; each parser identifies its format, parses to common Position struct, returns ACK bytes

**DeviceInfo Cache (`gateway/internal/storage/writer.go`):**
- Purpose: Map IMEI → {DeviceID, TenantID, VehicleID} for quick lookup on each position without DB hit
- Examples: Map[string]DeviceInfo, reloaded every 30s in background goroutine
- Pattern: In-memory cache with periodic refresh; miss path writes to pending_devices table

**Rule Evaluator (`gateway/internal/alerts/engine.go`):**
- Purpose: Strategy pattern for different alert types (speed, ignition, battery)
- Examples: Methods `evaluateSpeed()`, `evaluateIgnition()`, `evaluateBattery()`
- Pattern: Switch on rule.Type, each evaluator checks rule.Config and position data, returns Alert if triggered

**Server Actions (`web/src/lib/actions/`):**
- Purpose: Backend functions callable from React components, automatically serialize/deserialize
- Examples: `getDevices()`, `createDevice(formData)`, `getPositionHistory()`, `getAlerts()`
- Pattern: `"use server"` directive; form data passed from client, mutations revalidate cache paths

**Real-Time Hook (`web/src/lib/hooks/use-realtime-positions.ts`):**
- Purpose: Subscribe to position changes, maintain client-side Map state, sync with server state
- Examples: Takes initial positions array, returns live-updating array as Supabase Realtime delivers changes
- Pattern: useEffect subscribes to channel, cleanup unsubscribes; state merges new values with existing by device_id

## Entry Points

**Gateway TCP Server (`gateway/cmd/gateway/main.go`):**
- Location: `gateway/cmd/gateway/main.go`
- Triggers: `go run ./cmd/gateway` or binary execution
- Responsibilities: Initialize DB pool, load config, start TCP server, start background workers (flusher, device reloader, rule syncer, metrics server), handle SIGINT for graceful shutdown

**Web Root Layout (`web/src/app/layout.tsx`):**
- Location: `web/src/app/layout.tsx`
- Triggers: Browser navigation to any URL
- Responsibilities: Set page metadata, load fonts (Plus Jakarta Sans, JetBrains Mono), apply Tailwind/dark mode styling

**Web Middleware (`web/src/lib/supabase/middleware.ts`):**
- Location: Invoked before every route via `middleware.ts` in web root
- Triggers: Every request
- Responsibilities: Refresh Supabase session cookies, redirect unauthenticated users to /login (except auth pages)

**Dashboard Page (`web/src/app/(dashboard)/page.tsx`):**
- Location: `web/src/app/(dashboard)/page.tsx`
- Triggers: Route /dashboard
- Responsibilities: Call server action `getLatestPositions()`, pass to DashboardMap component

**Auth Callback Route (`web/src/app/auth/callback/route.ts`):**
- Location: `web/src/app/auth/callback/route.ts`
- Triggers: Supabase redirects here after email confirmation
- Responsibilities: Exchange callback code for session, redirect to dashboard

## Error Handling

**Strategy:** Fail-open with buffering at write layer; in-memory rule evaluation never fails (rules are self-contained).

**Patterns:**
- **Write failures:** Position write fails → callback `OnFlushError()` enqueues to disk buffer → buffer can be replayed later
- **Database connection:** Shared connection pool with 5-min timeout; if pool exhausted, new writes wait or eventually timeout
- **Rule evaluation:** Unknown rule type returns `(Alert{}, false)` silently; malformed rule config returns false
- **Protocol parse:** Unknown protocol returns nil parser → position ignored with log warning
- **Auth failures:** Unauthenticated requests redirected to /login by middleware; invalid tokens handled by Supabase SDK
- **Realtime subscription:** If subscription fails, React component still shows initial server data; subscription retries automatically

## Cross-Cutting Concerns

**Logging:** Gateway uses structured logging (`slog` with JSON handler to stdout); Web uses console.log for client-side, server actions can use console.log

**Validation:** 
- Gateway: Parser validates protocol format and extracts fields; invalid data logged and ignored
- Web: Form validation at UI level (HTML5) + server-side form parsing; Supabase RLS validates tenant_id
- Database: NOT NULL constraints, check constraints on alert_severity/type enums

**Authentication:** 
- Gateway: No auth (assumes secure network); all positions written under tenant inferred from device cache
- Web: Supabase Auth (email/password + magic link); JWTs in cookies; session refresh in middleware
- Database: RLS policies use `auth.uid()` → profile → tenant_id to filter rows per user

**Multi-tenancy:** 
- Every data table has `tenant_id` column
- RLS policies filter by user's tenant_id (via JOIN through profiles)
- Gateway writes using device's cached tenant_id
- Web cannot see rows from other tenants

---

*Architecture analysis: 2026-04-04*
