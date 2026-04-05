# External Integrations

**Analysis Date:** 2026-04-05

## APIs & External Services

**Backend Platform:**
- Supabase - provides PostgreSQL, Auth, Realtime, and local platform services for the application
  - SDK/Client: `@supabase/ssr`, `@supabase/supabase-js`, and Supabase CLI from `web/package.json` and `Makefile`
  - Auth: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` documented in `CLAUDE.md`
  - Implementation: `web/src/lib/supabase/client.ts`, `web/src/lib/supabase/server.ts`, `web/src/lib/supabase/middleware.ts`, `web/src/lib/actions/*.ts`, and `supabase/config.toml`

**Device Network:**
- Suntech GPS devices - raw TCP ingestion of tracker messages into the gateway
  - SDK/Client: custom protocol parser and registry in `gateway/internal/protocol/suntech.go`, `gateway/internal/protocol/suntech_binary.go`, and `gateway/internal/protocol/protocol.go`
  - Auth: no external auth provider; device trust is established by IMEI/serial lookup in `gateway/internal/storage/writer.go`
  - Implementation: `gateway/internal/server/tcp.go`, `gateway/cmd/gateway/main.go`, and `simulator/cmd/simulator/main.go`

**Map Tile Providers:**
- CARTO - light and dark basemaps for the live map UI
  - SDK/Client: `leaflet` and `react-leaflet` from `web/package.json`
  - Auth: none
  - Implementation: `web/src/components/map/tracking-map.tsx`
- OpenStreetMap tile servers - detailed street basemap
  - SDK/Client: `leaflet` and `react-leaflet` from `web/package.json`
  - Auth: none
  - Implementation: `web/src/components/map/tracking-map.tsx` and `web/src/components/map/history-player.tsx`
- Esri World Imagery - satellite basemap
  - SDK/Client: `leaflet` and `react-leaflet` from `web/package.json`
  - Auth: none
  - Implementation: `web/src/components/map/tracking-map.tsx`

## Data Storage

**Databases:**
- Supabase PostgreSQL 17 with PostGIS
  - Connection: `DATABASE_URL`
  - Client: `pgxpool` in `gateway/cmd/gateway/main.go`, `postgres` plus `drizzle` in `web/src/lib/db/index.ts`, and Supabase JS queries in `web/src/lib/actions/*.ts`
  - Schema: `supabase/migrations/20260318104209_extensions_and_enums.sql`, `supabase/migrations/20260318104457_positions.sql`, and related migrations in `supabase/migrations/*.sql`
- Supabase Realtime over `latest_positions`
  - Connection: Supabase project URL from `NEXT_PUBLIC_SUPABASE_URL`
  - Client: `.channel(...).on("postgres_changes", ...)` in `web/src/lib/hooks/use-realtime-positions.ts`
  - Publication path: `supabase/migrations/20260403_latest_positions_realtime.sql`

**File Storage:**
- Local filesystem fallback only in the gateway buffer
  - Path source: `BUFFER_FALLBACK_PATH` loaded by `gateway/internal/config/config.go`
  - Implementation: `gateway/internal/storage/buffer.go`
- Supabase Storage is enabled in local platform config at `supabase/config.toml`, but no application code under `web/src/**` or `gateway/**` uses `supabase.storage`

**Caching:**
- None as an external service
- In-process device cache: `gateway/internal/storage/writer.go`
- In-memory realtime position state: `web/src/lib/hooks/use-realtime-positions.ts`

## Authentication & Identity

**Auth Provider:**
- Supabase Auth
  - Implementation: email/password login, signup, and logout in `web/src/lib/actions/auth.ts`; session refresh and route protection in `web/src/lib/supabase/middleware.ts` and `web/src/proxy.ts`; auth code exchange callback in `web/src/app/auth/callback/route.ts`
  - Tenant/profile provisioning: `supabase/migrations/20260318104558_rls_policies.sql` creates `public.handle_new_user()` and RLS helper functions tied to `auth.uid()`

## Monitoring & Observability

**Error Tracking:**
- None detected

**Logs:**
- Structured JSON logs via `log/slog` in `gateway/cmd/gateway/main.go`
- No third-party log drain, tracing SDK, or error aggregation client is detected in `gateway/**` or `web/src/**`

**Metrics:**
- Gateway HTTP metrics and health endpoints at `/metrics` and `/health`
  - Implementation: `gateway/internal/metrics/metrics.go`
  - Exposure: started from `gateway/cmd/gateway/main.go`

## CI/CD & Deployment

**Hosting:**
- Supabase hosts the managed database, auth, and realtime platform implied by `supabase/config.toml` and `web/src/lib/supabase/*.ts`
- The gateway has a container build target in `gateway/Dockerfile`
- The web app has no checked-in hosting manifest; it is prepared for a standard Next.js build/start flow through `web/package.json`

**CI Pipeline:**
- None detected
- No `.github/workflows/*`, `vercel.json`, `.vercel/`, `netlify.toml`, `fly.toml`, or `railway.json` are present in the repository scan

## Environment Configuration

**Required env vars:**
- Gateway runtime: `DATABASE_URL`, `TCP_PORT`, `METRICS_PORT`, `RULE_SYNC_INTERVAL`, `BUFFER_CAPACITY`, `FLUSH_INTERVAL`, `FLUSH_SIZE`, `BUFFER_FALLBACK_PATH` from `gateway/internal/config/config.go`
- Web runtime: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `DATABASE_URL` from `web/src/lib/supabase/*.ts`, `web/src/lib/db/index.ts`, and `web/drizzle.config.ts`
- Documented web secret contract: `SUPABASE_SERVICE_ROLE_KEY` in `CLAUDE.md`
- Local Supabase-only optional secrets referenced through `env(...)` in `supabase/config.toml`: `OPENAI_API_KEY`, `SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN`, `SUPABASE_AUTH_EXTERNAL_APPLE_SECRET`, `S3_HOST`, `S3_REGION`, `S3_ACCESS_KEY`, and `S3_SECRET_KEY`

**Secrets location:**
- `gateway/.env` and `web/.env.local` are present for local secrets
- `gateway/.env.example` and `web/.env.local.example` are present as example config files
- `supabase/config.toml` references additional local secrets via `env(...)` instead of inline values for optional integrations

## Webhooks & Callbacks

**Incoming:**
- `GET /auth/callback` in `web/src/app/auth/callback/route.ts` handles Supabase auth code exchange callbacks
- No payment, messaging, or third-party provider webhooks are detected in `web/src/**`, `gateway/**`, or `simulator/**`

**Outgoing:**
- The web map UI requests external tile images from CARTO, OpenStreetMap, and Esri in `web/src/components/map/tracking-map.tsx` and `web/src/components/map/history-player.tsx`
- The web app sends authenticated data and realtime requests to Supabase through `web/src/lib/supabase/*.ts`, `web/src/lib/actions/*.ts`, and `web/src/lib/hooks/use-realtime-positions.ts`
- The gateway writes directly to PostgreSQL and polls alert rules through `gateway/internal/storage/writer.go`, `gateway/internal/storage/pending.go`, and `gateway/internal/alerts/sync.go`

---

*Integration audit: 2026-04-05*
