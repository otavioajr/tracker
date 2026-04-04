# External Integrations

**Analysis Date:** 2026-04-04

## APIs & External Services

**Supabase API:**
- PostgreSQL database as a service
  - SDK/Client: @supabase/supabase-js 2.99.2
  - Server-side: @supabase/ssr 0.9.0
  - Auth: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
  - Service role: SUPABASE_SERVICE_ROLE_KEY (server actions only)

**GPS Device Gateway (Internal):**
- TCP server on port 5001 receives Suntech protocol GPS data
- Binary and ASCII protocol support via dual parsers in `gateway/internal/protocol/`
- No external API calls; gateway reads from connected devices

## Data Storage

**Databases:**
- Supabase (PostgreSQL 13+)
  - Connection: `DATABASE_URL` environment variable
  - ORM: Drizzle ORM 0.45.1 via `web/src/lib/db/index.ts`
  - Driver: postgres 3.4.8 (Node.js) and jackc/pgx/v5 5.8.0 (Go)
  - Features: PostGIS extension, Row-Level Security, time partitioning

**Database Schema Components:**
- Tenants table - Multi-tenancy foundation
- Profiles table - User profiles linked to tenants
- Devices table - GPS tracking devices (IMEI-based)
- Vehicles table - Company vehicles linked to devices
- Positions table - Partitioned by time (monthly), stores GPS coordinates as GEOMETRY
- Latest_positions table - Non-partitioned view for Supabase Realtime
- Geofences table - Inclusion/exclusion zones
- Alerts table - Alert events with severity levels
- Pending_devices table - Devices awaiting activation
- Serial_devices table - Device serial number tracking

**File Storage:**
- Local filesystem only (resilience buffer: `./buffer.jsonl`)
- No S3, GCS, or cloud storage integration

**Caching:**
- None configured
- In-memory state management via React hooks (`useRealtimePositions`)

## Authentication & Identity

**Auth Provider:**
- Supabase Authentication (built-in JWT)
  - Implementation: Middleware-based session refresh in `web/src/lib/supabase/middleware.ts`
  - User lookup via auth.getUser() in Next.js middleware
  - Tenant association via profiles table (auth.uid → profile.user_id → profile.tenant_id)

**Auth Flow:**
1. Login/Register via Supabase Auth endpoints
2. Session stored in HTTP-only cookies (managed by @supabase/ssr)
3. Middleware (`middleware.ts`) refreshes session on each request
4. Protected routes: Redirect to /login if no valid session
5. Public routes: /login, /register, /auth/*

**Authorization:**
- Row-Level Security (RLS) policies on all data tables
- Two role levels: admin_platform (manage all tenants) and client (own tenant only)
- Policies enforce tenant_id matching via get_user_tenant_id() SQL function

## Monitoring & Observability

**Error Tracking:**
- None (no Sentry, Datadog, etc.)
- Structured logging via slog in Go services
- Browser console logs in web dashboard

**Logs:**
- Go gateway: JSON-formatted structured logs to stdout
- Next.js web: Console logs and browser DevTools
- Supabase: Logs available via Supabase dashboard (not queried from app)

**Metrics:**
- Custom HTTP endpoint on port 9090
  - /metrics - JSON metrics (active connections, positions received/flushed, alerts triggered)
  - /health - Health check (plain JSON {status: ok})
- No Prometheus scraping configured
- Prometheus client: Custom in-house implementation via `gateway/internal/metrics/`

## CI/CD & Deployment

**Hosting:**
- Web dashboard: Vercel (free tier) - Next.js deployment with serverless functions
- Gateway: Oracle Cloud VPS (ubuntu@137.131.168.96) - TCP server binary on port 5001
- Database: Supabase Cloud - Managed PostgreSQL
- Simulator: Runs locally or on same VPS as gateway

**CI Pipeline:**
- None detected (no GitHub Actions, GitLab CI, etc.)
- Manual deployment via git push (Vercel) or SSH (VPS)

**Deployment Artifacts:**
- Web: Vercel builds on git push, no Docker
- Gateway: Go binary compiled locally, SCP to VPS, systemd restart
- Database: Supabase CLI migrations pushed manually via `supabase db push`

## Environment Configuration

**Required Environment Variables:**

**Gateway:**
```
DATABASE_URL=postgresql://user:pass@host:5432/db
TCP_PORT=5001                          # Optional, default 5001
METRICS_PORT=9090                      # Optional, default 9090
RULE_SYNC_INTERVAL=30s                 # Optional, default 30s
BUFFER_CAPACITY=10000                  # Optional, default 10000
FLUSH_INTERVAL=1s                      # Optional, default 1s
FLUSH_SIZE=100                         # Optional, default 100
BUFFER_FALLBACK_PATH=./buffer.jsonl    # Optional, default ./buffer.jsonl
```

**Web:**
```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx...
SUPABASE_SERVICE_ROLE_KEY=eyJxxx...     # Server-side only
DATABASE_URL=postgresql://user:pass@host:5432/db
```

**Secrets Location:**
- Environment files (not committed): `.env` (gateway), `.env.local` (web)
- Example files in repo: `gateway/.env.example`, `web/.env.local.example`
- No secrets vault (AWS Secrets Manager, Vault, etc.)

## Webhooks & Callbacks

**Incoming Webhooks:**
- None detected
- Gateway only receives TCP connections from devices

**Outgoing Webhooks:**
- None detected
- No callbacks to external services
- Alert records stored in database, not sent to external endpoints

## Real-Time Communication

**Supabase Realtime:**
- Subscription: `channel("realtime:latest_positions")`
- Watches: postgres_changes on `latest_positions` table
- Implementation: `web/src/lib/hooks/use-realtime-positions.ts`
- Event types: INSERT, UPDATE, DELETE
- Frontend updates vehicle positions in real-time without polling

**Network Protocol:**
- TCP (binary/ASCII Suntech protocol) for device-to-gateway communication
- WebSocket (Supabase Realtime) for browser-to-database subscriptions

## Data Flow Integrations

**Device → Gateway → Database:**
1. GPS device sends TCP packet (Suntech protocol) to gateway:5001
2. Gateway parser decodes position data (IMEI, location, speed, heading, etc.)
3. Position buffered in memory, flushed to positions table on interval/size threshold
4. Insert trigger updates latest_positions table (for Realtime)
5. Alert rules evaluated in-memory, matched alerts inserted into alerts table

**Dashboard → Realtime → UI:**
1. Web dashboard subscribes to latest_positions via Supabase Realtime
2. On new position INSERT, postgres_changes event fires
3. React hook updates in-memory position map
4. Components re-render with latest vehicle locations
5. Leaflet map markers update in real-time

## External Service Dependencies

**Critical (Core Functionality):**
- Supabase (PostgreSQL, Auth, Realtime) - Database, authentication, real-time sync
- Oracle Cloud VPS - Gateway server hosting

**Non-Critical:**
- Vercel - Web hosting (can self-host Next.js)
- Suntech GPS Device Network - Device connectivity (customer-provided)

## Backup & Recovery

**Database Backups:**
- Supabase Cloud handles PostgreSQL backups automatically
- No custom backup strategy configured

**Position Data Resilience:**
- In-memory buffer (10,000 positions default) in gateway process
- Fallback JSONL file (`./buffer.jsonl`) if database flush fails
- Buffer flushed on startup to catch missed inserts during downtime

---

*Integration audit: 2026-04-04*
