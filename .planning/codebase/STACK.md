# Technology Stack

**Analysis Date:** 2026-04-05

## Languages

**Primary:**
- Go 1.24.0 in `gateway/go.mod` for the TCP ingestion service in `gateway/cmd/gateway/main.go`
- Go 1.26.1 in `simulator/go.mod` for the GPS traffic generator in `simulator/cmd/simulator/main.go`
- TypeScript 5 in `web/package.json` and `web/tsconfig.json` for the Next.js app in `web/src/**`
- SQL for PostgreSQL/Supabase schema management in `supabase/migrations/*.sql`

**Secondary:**
- CSS via Tailwind CSS v4 in `web/postcss.config.mjs` and `web/src/app/globals.css`
- JSON and TOML config in `web/components.json`, `web/tsconfig.json`, and `supabase/config.toml`

## Runtime

**Environment:**
- Node.js is required for `web/`; the repo does not pin a version, and the current local toolchain reports Node.js 25.2.1 from `node -v`
- npm is required for `web/`; the current local toolchain reports npm 11.6.2 from `npm -v`
- Go is required for `gateway/` and `simulator/`; `gateway/go.mod` requires Go 1.24.0, `simulator/go.mod` requires Go 1.26.1, and the current local toolchain reports Go 1.26.1 from `go version`
- Supabase CLI is required by `Makefile` for database workflows; the current local toolchain reports Supabase CLI 2.75.0 from `supabase --version`

**Package Manager:**
- npm for the web app in `web/package.json`
- Go modules for `gateway/` in `gateway/go.mod` and `gateway/go.sum`
- Go modules for `simulator/` in `simulator/go.mod`
- Lockfile: present in `web/package-lock.json` and `gateway/go.sum`

## Frameworks

**Core:**
- Next.js 16.1.7 in `web/package.json` for the App Router application in `web/src/app/**`
- React 19.2.3 in `web/package.json` for UI components in `web/src/components/**`
- Supabase SSR/Auth clients in `web/src/lib/supabase/client.ts`, `web/src/lib/supabase/server.ts`, and `web/src/lib/supabase/middleware.ts`
- Drizzle ORM with `postgres-js` in `web/src/lib/db/index.ts` for direct PostgreSQL access from the web service
- Native Go networking in `gateway/internal/server/tcp.go` and `simulator/cmd/simulator/main.go` for raw TCP device traffic

**Testing:**
- Vitest 3.2.4 in `web/package.json` with config in `web/vitest.config.ts`
- `@testing-library/react` 16.3.0 in `web/package.json` for web component tests in `web/src/**/*.test.tsx`
- Go's built-in `testing` package in `gateway/internal/**/*_test.go` and `simulator/internal/**/*_test.go`

**Build/Dev:**
- Tailwind CSS v4 and `@tailwindcss/postcss` in `web/package.json` and `web/postcss.config.mjs`
- ESLint 9 with `eslint-config-next` in `web/eslint.config.mjs`
- Drizzle Kit in `web/drizzle.config.ts`
- Supabase CLI workflows in `Makefile` and `supabase/config.toml`
- Docker image build for the gateway in `gateway/Dockerfile`

## Key Dependencies

**Critical:**
- `@supabase/supabase-js` ^2.99.2 in `web/package.json` for auth, table queries, and realtime channels used by `web/src/lib/actions/*.ts` and `web/src/lib/hooks/use-realtime-positions.ts`
- `@supabase/ssr` ^0.9.0 in `web/package.json` for cookie-aware browser/server clients in `web/src/lib/supabase/*.ts`
- `drizzle-orm` ^0.45.1 and `postgres` ^3.4.8 in `web/package.json` for direct PostgreSQL access in `web/src/lib/db/index.ts`
- `github.com/jackc/pgx/v5` v5.8.0 in `gateway/go.mod` for PostgreSQL pooling in `gateway/cmd/gateway/main.go`, `gateway/internal/storage/*.go`, and `gateway/internal/alerts/sync.go`

**Infrastructure:**
- `leaflet` ^1.9.4 and `react-leaflet` ^5.0.0 in `web/package.json` for the map UI in `web/src/components/map/tracking-map.tsx` and `web/src/components/map/history-player.tsx`
- `next-themes` ^0.4.6 in `web/package.json` for theme-aware UI elements such as `web/src/components/ui/sonner.tsx`
- `@base-ui/react`, `shadcn`, `class-variance-authority`, `tailwind-merge`, and `lucide-react` in `web/package.json` for the component system configured by `web/components.json`
- PostGIS enabled by `supabase/migrations/20260318104209_extensions_and_enums.sql` for geospatial tables in `supabase/migrations/20260318104457_positions.sql` and `supabase/migrations/20260318104529_geofences_and_alerts.sql`

## Configuration

**Environment:**
- The gateway loads `DATABASE_URL`, `TCP_PORT`, `METRICS_PORT`, `RULE_SYNC_INTERVAL`, `BUFFER_CAPACITY`, `FLUSH_INTERVAL`, `FLUSH_SIZE`, and `BUFFER_FALLBACK_PATH` in `gateway/internal/config/config.go`
- The web app reads `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `web/src/lib/supabase/client.ts`, `web/src/lib/supabase/server.ts`, and `web/src/lib/supabase/middleware.ts`
- The web app reads `DATABASE_URL` in `web/src/lib/db/index.ts` and `web/drizzle.config.ts`
- `CLAUDE.md` documents `SUPABASE_SERVICE_ROLE_KEY` as part of the web environment contract, even though the checked-in application code shown in `web/src/**` does not read it directly
- Secret-bearing env files exist at `gateway/.env`, `gateway/.env.example`, `web/.env.local`, and `web/.env.local.example`

**Build:**
- `Makefile` is the top-level task runner for build, test, and database commands
- `web/next.config.ts` configures `outputFileTracingRoot` and Turbopack root for the Next.js app
- `web/tsconfig.json` defines strict TypeScript settings and the `@/*` alias
- `web/postcss.config.mjs`, `web/eslint.config.mjs`, `web/vitest.config.ts`, and `web/components.json` control frontend tooling
- `supabase/config.toml` controls the local Supabase stack, including API, database, auth, realtime, and storage services

## Platform Requirements

**Development:**
- Use Go for `gateway/` and `simulator/`, Node.js/npm for `web/`, and Supabase CLI for database operations defined in `Makefile`
- Local database and auth development depend on the Supabase stack configured in `supabase/config.toml`
- The repository includes `gateway/Dockerfile` and `docker-compose.yml`, so Docker is part of the local operational surface even though most day-to-day commands are exposed through `Makefile`

**Production:**
- The gateway is containerizable via `gateway/Dockerfile`
- The web app is buildable with `next build --webpack` and startable with `next start` from `web/package.json`
- The database target is Supabase/PostgreSQL 17 with PostGIS, as configured in `supabase/config.toml` and enabled by `supabase/migrations/20260318104209_extensions_and_enums.sql`
- No deployment-specific manifest for the web app is checked in; `vercel.json`, `.vercel/`, and `.github/workflows/*` are not detected in the repository

---

*Stack analysis: 2026-04-05*
