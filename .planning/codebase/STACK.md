# Technology Stack

**Analysis Date:** 2026-04-04

## Languages

**Primary:**
- Go 1.24 - Gateway TCP server
- Go 1.26.1 - Device simulator
- TypeScript 5 - Web dashboard and UI
- JavaScript - Build tooling

**Secondary:**
- SQL (PostgreSQL) - Database migrations and schema

## Runtime

**Environment:**
- Node.js (via Next.js 16) - Web frontend and server actions
- Go standard library - Gateway and simulator binaries

**Package Manager:**
- npm 10+ - Web dependencies (defined in `web/package.json`)
- Go modules - Gateway and simulator dependencies

**Lockfile:**
- `package-lock.json` - Present (npm)
- `go.sum` - Present (19 dependencies total)

## Frameworks

**Core:**
- Next.js 16.1.7 - React-based framework for web dashboard (`web/`)
- React 19.2.3 - UI component library
- React DOM 19.2.3 - DOM rendering

**Mapping & Visualization:**
- Leaflet 1.9.4 - Interactive map library
- react-leaflet 5.0.0 - React bindings for Leaflet
- Dynamically imported in `web/src/components/map/` to avoid SSR issues

**Styling & UI:**
- Tailwind CSS 4 - Utility-first CSS framework
- PostCSS 4 - CSS processing pipeline (`web/postcss.config.mjs`)
- Shadcn UI (base-nova theme) - Pre-built component library
- next-themes 0.4.6 - Dark mode support

**Database & ORM:**
- Drizzle ORM 0.45.1 - Type-safe SQL query builder
- drizzle-kit 0.31.10 - Migration and schema generation
- postgres 3.4.8 - PostgreSQL client for Node.js

**Backend Stack (Gateway):**
- jackc/pgx/v5 5.8.0 - PostgreSQL driver for Go
- jackc/pgpassfile - PostgreSQL password file support
- jackc/puddle/v2 - Connection pool management

**Authentication & Auth:**
- @supabase/supabase-js 2.99.2 - Supabase client library
- @supabase/ssr 0.9.0 - Server-side rendering helpers for auth

**Development & Tooling:**
- ESLint 9 - JavaScript/TypeScript linting
- eslint-config-next 16.1.7 - Next.js ESLint rules
- TypeScript with strict mode enabled
- Vite/Next.js build system (Turbopack in Next.js 16+)

**Utilities:**
- zod 4.3.6 - TypeScript-first schema validation
- clsx 2.1.1 - Conditional CSS class merging
- tailwind-merge 3.5.0 - Tailwind CSS class conflict resolution
- class-variance-authority 0.7.1 - Type-safe component variants
- lucide-react 0.577.0 - Icon library
- sonner 2.0.7 - Toast notification library
- tw-animate-css 1.4.0 - Tailwind CSS animation utilities

## Configuration

**Environment Variables:**

**Gateway (`gateway/.env`):**
- `DATABASE_URL` - PostgreSQL connection string (required)
- `TCP_PORT` - TCP server port (default: 5001)
- `METRICS_PORT` - Prometheus metrics port (default: 9090)
- `RULE_SYNC_INTERVAL` - Alert rule sync interval (default: 30s)
- `BUFFER_CAPACITY` - Resilience buffer capacity (default: 10000)
- `FLUSH_INTERVAL` - Position batch flush interval (default: 1s)
- `FLUSH_SIZE` - Position batch size (default: 100)
- `BUFFER_FALLBACK_PATH` - Fallback buffer file path (default: ./buffer.jsonl)

**Web (`web/.env.local`):**
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL (public, required)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key (public, required)
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (server-side only, required)
- `DATABASE_URL` - PostgreSQL direct connection (for Drizzle, required)

**Build Configuration:**
- `tsconfig.json` - TypeScript compiler options with strict mode, ES2017 target
- `next.config.ts` - Empty config (uses defaults)
- `drizzle.config.ts` - Drizzle ORM configuration pointing to PostgreSQL
- `eslint.config.mjs` - ESLint configuration with Next.js core web vitals and TypeScript rules
- `postcss.config.mjs` - PostCSS plugins for Tailwind CSS v4

## Platform Requirements

**Development:**
- Node.js 18+ (for Next.js 16)
- Go 1.24+ (for gateway)
- Go 1.26.1+ (for simulator, if needed)
- npm 10+ (or pnpm/yarn compatible)
- Supabase CLI (for database management, optional local development)

**Production:**
- Vercel (free tier) - Hosting for web dashboard (`web/`)
- Oracle Cloud VPS - Gateway server (port 5001 for TCP, 9090 for metrics)
- Supabase Cloud - PostgreSQL database with PostGIS and Row-Level Security
- Docker (Phase 2 planned) - Self-hosting option via `docker-compose.yml`

**Database:**
- PostgreSQL 13+ with PostGIS extension enabled
- Row-Level Security (RLS) policies for multi-tenant isolation
- Time-partitioned positions table for historical data
- Supabase Realtime publication on `latest_positions` table

## Storage & Media

**File Storage:**
- Local filesystem only - No external storage (S3, GCS, etc.) integrated
- Buffer fallback: Local JSONL file (`./buffer.jsonl`) for resilience

## Monitoring & Metrics

**Observability:**
- Custom Prometheus-compatible metrics endpoint on port 9090
- Metrics exposed: active connections, positions received/flushed, flush errors, alerts triggered
- Health check endpoint at `/health`
- Structured JSON logging via Go's `log/slog` package

## Security

**Encryption:**
- TLS/SSL: Not configured in code (assumed at network/infra level)
- Password files: Handled via jackc/pgpassfile

**Secrets Management:**
- Environment variables only (no secrets management service)
- Supabase Row-Level Security for data access control
- Service role key stored server-side only

## Build & Deployment

**Web:**
- Build command: `npm run build` → Production-optimized Next.js bundle
- Start command: `npm start` → Next.js production server
- Development: `npm run dev` → Next.js dev server with hot reload

**Gateway:**
- Build: `go build -o bin/gateway ./cmd/gateway` → Standalone binary
- Run: `go run ./cmd/gateway` or `./bin/gateway`

**Simulator:**
- Build: `go build -o bin/simulator ./cmd/simulator`
- Run: `go run ./cmd/simulator` or `./bin/simulator`

**Database:**
- Migrations: Supabase CLI (`supabase db push`)
- Type generation: Supabase CLI → `web/src/types/database.ts`
- Reset (destructive): `supabase db reset`

---

*Stack analysis: 2026-04-04*
