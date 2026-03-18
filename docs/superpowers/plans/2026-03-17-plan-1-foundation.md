# Plan 1: Foundation & Database Setup

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up the project structure, Supabase database schema with RLS, and scaffold the Go Gateway and Next.js projects so all subsequent plans have a working foundation.

**Architecture:** Monorepo with `gateway/` (Go) and `web/` (Next.js) as sibling directories. Database managed via Supabase CLI migrations (raw SQL). Supabase SDK for auth/realtime on the frontend, Drizzle ORM for type-safe data queries in API routes.

**Tech Stack:** Go 1.22+, Next.js 15, TypeScript, Supabase CLI, PostgreSQL + PostGIS, Drizzle ORM, Tailwind CSS, shadcn/ui

**Spec:** `docs/superpowers/specs/2026-03-17-vehicle-tracker-design.md`

---

### Task 1: Project Structure & Git Setup

**Files:**
- Create: `.gitignore`
- Create: `Makefile`
- Create: `docker-compose.yml` (placeholder for Phase 2)

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p gateway/cmd/gateway gateway/internal/{server,protocol,storage,alerts,config}
mkdir -p simulator/cmd/simulator
mkdir -p supabase/migrations
```

- [ ] **Step 2: Create .gitignore**

```gitignore
# Dependencies
node_modules/
vendor/

# Build
.next/
out/
gateway/bin/
simulator/bin/

# Environment
.env
.env.local
.env.production.local
web/.env.local

# Supabase
supabase/.temp/

# IDE
.vscode/
.idea/
*.swp

# OS
.DS_Store
Thumbs.db

# Superpowers
.superpowers/

# Docker
docker-compose.override.yml
```

- [ ] **Step 3: Create Makefile**

```makefile
.PHONY: help gateway web simulator db-push db-types db-reset

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# --- Gateway ---
gateway-build: ## Build the Go gateway
	cd gateway && go build -o bin/gateway ./cmd/gateway

gateway-run: ## Run the Go gateway
	cd gateway && go run ./cmd/gateway

gateway-test: ## Run gateway tests
	cd gateway && go test ./... -v

# --- Web ---
web-install: ## Install web dependencies
	cd web && npm install

web-dev: ## Run Next.js dev server
	cd web && npm run dev

web-build: ## Build Next.js for production
	cd web && npm run build

web-test: ## Run web tests
	cd web && npm test

# --- Simulator ---
simulator-build: ## Build the device simulator
	cd simulator && go build -o bin/simulator ./cmd/simulator

simulator-run: ## Run the device simulator
	cd simulator && go run ./cmd/simulator

# --- Database ---
db-push: ## Push migrations to Supabase
	supabase db push

db-types: ## Generate TypeScript types from Supabase
	supabase gen types typescript --project-id "$(SUPABASE_PROJECT_ID)" > web/src/types/database.ts

db-reset: ## Reset database (WARNING: deletes all data)
	supabase db reset

db-migration: ## Create a new migration (usage: make db-migration name=my_migration)
	supabase migration new $(name)
```

- [ ] **Step 4: Create docker-compose.yml placeholder**

```yaml
# docker-compose.yml — Phase 2: Self-hosted setup
# For now, we use Supabase Cloud + Oracle Cloud + Vercel (all free tier)
# This file will be populated when migrating to VPS self-hosted

version: "3.8"

services:
  # Uncomment when migrating to Phase 2
  # gateway:
  #   build: ./gateway
  #   ports:
  #     - "5001:5001"
  #     - "9090:9090"
  #   env_file: .env
  #   restart: unless-stopped
```

- [ ] **Step 5: Commit**

```bash
git add .gitignore Makefile docker-compose.yml gateway/ simulator/ supabase/
git commit -m "chore: scaffold project directory structure"
```

---

### Task 2: Go Gateway Module Init

**Files:**
- Create: `gateway/go.mod`
- Create: `gateway/cmd/gateway/main.go`
- Create: `gateway/internal/config/config.go`

- [ ] **Step 1: Initialize Go module**

```bash
cd gateway && go mod init github.com/otavioajr/tracker/gateway
```

- [ ] **Step 2: Create main.go placeholder**

```go
// gateway/cmd/gateway/main.go
package main

import (
	"fmt"
	"os"

	"github.com/otavioajr/tracker/gateway/internal/config"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to load config: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("tracker gateway starting on :%d\n", cfg.TCPPort)
}
```

- [ ] **Step 3: Create config.go**

```go
// gateway/internal/config/config.go
package config

import (
	"fmt"
	"os"
	"strconv"
)

type Config struct {
	TCPPort     int
	DatabaseURL string
	MetricsPort int
}

func Load() (*Config, error) {
	cfg := &Config{
		TCPPort:     5001,
		MetricsPort: 9090,
	}

	if port := os.Getenv("TCP_PORT"); port != "" {
		p, err := strconv.Atoi(port)
		if err != nil {
			return nil, fmt.Errorf("invalid TCP_PORT: %w", err)
		}
		cfg.TCPPort = p
	}

	cfg.DatabaseURL = os.Getenv("DATABASE_URL")
	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}

	if port := os.Getenv("METRICS_PORT"); port != "" {
		p, err := strconv.Atoi(port)
		if err != nil {
			return nil, fmt.Errorf("invalid METRICS_PORT: %w", err)
		}
		cfg.MetricsPort = p
	}

	return cfg, nil
}
```

- [ ] **Step 4: Write config test**

```go
// gateway/internal/config/config_test.go
package config

import (
	"testing"
)

func TestLoad_Defaults(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://test:test@localhost/test")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.TCPPort != 5001 {
		t.Errorf("expected TCPPort 5001, got %d", cfg.TCPPort)
	}
	if cfg.MetricsPort != 9090 {
		t.Errorf("expected MetricsPort 9090, got %d", cfg.MetricsPort)
	}
}

func TestLoad_MissingDatabaseURL(t *testing.T) {
	_, err := Load()
	if err == nil {
		t.Fatal("expected error for missing DATABASE_URL")
	}
}

func TestLoad_CustomPorts(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://test:test@localhost/test")
	t.Setenv("TCP_PORT", "6001")
	t.Setenv("METRICS_PORT", "9191")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.TCPPort != 6001 {
		t.Errorf("expected TCPPort 6001, got %d", cfg.TCPPort)
	}
	if cfg.MetricsPort != 9191 {
		t.Errorf("expected MetricsPort 9191, got %d", cfg.MetricsPort)
	}
}
```

- [ ] **Step 5: Run tests**

Run: `cd gateway && go test ./... -v`
Expected: All 3 tests PASS

- [ ] **Step 6: Create .env.example**

```env
# gateway/.env.example
DATABASE_URL=postgresql://postgres:password@db.your-project.supabase.co:5432/postgres
TCP_PORT=5001
METRICS_PORT=9090
```

- [ ] **Step 7: Commit**

```bash
git add gateway/
git commit -m "feat: init Go gateway module with config"
```

---

### Task 3: Simulator Module Init

**Files:**
- Create: `simulator/go.mod`
- Create: `simulator/cmd/simulator/main.go`

- [ ] **Step 1: Initialize Go module**

```bash
cd simulator && go mod init github.com/otavioajr/tracker/simulator
```

- [ ] **Step 2: Create simulator main.go placeholder**

```go
// simulator/cmd/simulator/main.go
package main

import "fmt"

func main() {
	fmt.Println("tracker device simulator")
	fmt.Println("usage: simulator --host <gateway-host> --port <gateway-port> --imei <device-imei>")
}
```

- [ ] **Step 3: Commit**

```bash
git add simulator/
git commit -m "chore: init device simulator module"
```

---

### Task 4: Next.js Project Setup

**Files:**
- Create: `web/` (full Next.js project via create-next-app)
- Create: `web/.env.local.example`

- [ ] **Step 1: Create Next.js app**

```bash
npx create-next-app@latest web \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*" \
  --use-npm \
  --no-turbopack
```

- [ ] **Step 2: Install dependencies**

```bash
cd web && npm install @supabase/supabase-js @supabase/ssr drizzle-orm postgres zod leaflet react-leaflet
cd web && npm install -D drizzle-kit @types/leaflet
```

- [ ] **Step 3: Create .env.local.example**

```env
# web/.env.local.example
# Copy to .env.local and fill in values

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Database (direct connection for Drizzle)
DATABASE_URL=postgresql://postgres:password@db.your-project.supabase.co:5432/postgres
```

- [ ] **Step 4: Create Supabase client (browser)**

```typescript
// web/src/lib/supabase/client.ts
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

- [ ] **Step 5: Create Supabase client (server)**

```typescript
// web/src/lib/supabase/server.ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method is called from a Server Component
            // when the user session needs refreshing. This can be ignored
            // if you have middleware refreshing user sessions.
          }
        },
      },
    }
  );
}
```

- [ ] **Step 6: Create Supabase middleware**

```typescript
// web/src/lib/supabase/middleware.ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Redirect unauthenticated users to login (except for auth pages)
  if (
    !user &&
    !request.nextUrl.pathname.startsWith("/login") &&
    !request.nextUrl.pathname.startsWith("/register") &&
    !request.nextUrl.pathname.startsWith("/auth")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
```

- [ ] **Step 7: Create middleware.ts**

```typescript
// web/src/middleware.ts
import { updateSession } from "@/lib/supabase/middleware";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

- [ ] **Step 8: Create placeholder database types**

```typescript
// web/src/types/database.ts
// This file will be auto-generated by `supabase gen types typescript`
// For now, use a placeholder to unblock development

export type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};
```

- [ ] **Step 9: Verify the app builds**

Run: `cd web && npm run build`
Expected: Build succeeds

- [ ] **Step 10: Commit**

```bash
git add web/
git commit -m "feat: init Next.js project with Supabase SDK"
```

---

### Task 5: Supabase Project Setup

**Files:**
- Create: `supabase/config.toml` (via supabase init)

- [ ] **Step 1: Install Supabase CLI**

```bash
brew install supabase/tap/supabase
```

- [ ] **Step 2: Login to Supabase**

```bash
supabase login
```

- [ ] **Step 3: Initialize Supabase in the project**

```bash
supabase init
```

This creates `supabase/config.toml`. If it already exists (from our mkdir), it will update it.

- [ ] **Step 4: Create a Supabase project via dashboard**

Go to https://supabase.com/dashboard and create a new project. Note the:
- Project ID
- Project URL
- Anon key
- Service role key
- Database password

- [ ] **Step 5: Link to the cloud project**

```bash
supabase link --project-ref <your-project-id>
```

- [ ] **Step 6: Fill in web/.env.local**

```bash
cp web/.env.local.example web/.env.local
# Edit web/.env.local with your Supabase project values
```

- [ ] **Step 7: Commit**

```bash
git add supabase/config.toml
git commit -m "chore: link Supabase project"
```

---

### Task 6: Database Migration — Extensions & Enums

**Files:**
- Create: `supabase/migrations/20260317000001_extensions_and_enums.sql`

- [ ] **Step 1: Create migration**

```bash
supabase migration new extensions_and_enums
```

- [ ] **Step 2: Write migration SQL**

```sql
-- supabase/migrations/<timestamp>_extensions_and_enums.sql

-- Enable PostGIS for geospatial queries
CREATE EXTENSION IF NOT EXISTS postgis;

-- Enums
CREATE TYPE tenant_plan AS ENUM ('free', 'starter', 'pro', 'enterprise');
CREATE TYPE user_role AS ENUM ('admin_platform', 'client');
CREATE TYPE device_protocol AS ENUM ('suntech');
CREATE TYPE geofence_type AS ENUM ('inclusion', 'exclusion');
CREATE TYPE alert_type AS ENUM ('speed', 'geofence', 'ignition', 'battery');
CREATE TYPE alert_severity AS ENUM ('info', 'warning', 'critical');
```

- [ ] **Step 3: Apply migration**

Run: `supabase db push`
Expected: Migration applied successfully

- [ ] **Step 4: Verify via Supabase Studio**

Open Supabase Dashboard → SQL Editor → Run:
```sql
SELECT typname FROM pg_type WHERE typname IN ('tenant_plan', 'user_role', 'device_protocol', 'alert_type');
```
Expected: 4 rows returned

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/
git commit -m "feat: add PostGIS extension and enums"
```

---

### Task 7: Database Migration — Tenants & Profiles

**Files:**
- Create: `supabase/migrations/<timestamp>_tenants_and_profiles.sql`

- [ ] **Step 1: Create migration**

```bash
supabase migration new tenants_and_profiles
```

- [ ] **Step 2: Write migration SQL**

```sql
-- Tenants table
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  plan tenant_plan NOT NULL DEFAULT 'free',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Profiles table (extends auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role user_role NOT NULL DEFAULT 'client',
  full_name TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_tenant_id ON profiles(tenant_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

Note: The `on_auth_user_created` trigger that creates a profile row will be added in Task 11 (RLS & Triggers), since it depends on understanding how tenant assignment works during onboarding.

- [ ] **Step 3: Apply migration**

Run: `supabase db push`
Expected: Migration applied successfully

- [ ] **Step 4: Verify tables exist**

Run in Supabase SQL Editor:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('tenants', 'profiles');
```
Expected: 2 rows

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/
git commit -m "feat: add tenants and profiles tables"
```

---

### Task 8: Database Migration — Devices & Vehicles

**Files:**
- Create: `supabase/migrations/<timestamp>_devices_and_vehicles.sql`

- [ ] **Step 1: Create migration**

```bash
supabase migration new devices_and_vehicles
```

- [ ] **Step 2: Write migration SQL**

```sql
-- Devices table
CREATE TABLE devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  imei TEXT NOT NULL UNIQUE,
  protocol device_protocol NOT NULL DEFAULT 'suntech',
  model TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  last_communication_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_devices_tenant_id ON devices(tenant_id);
CREATE INDEX idx_devices_imei ON devices(imei);

-- Vehicles table
CREATE TABLE vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  device_id UUID UNIQUE REFERENCES devices(id) ON DELETE SET NULL,
  plate TEXT NOT NULL,
  brand TEXT,
  model TEXT,
  year INT,
  color TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vehicles_tenant_id ON vehicles(tenant_id);
CREATE INDEX idx_vehicles_device_id ON vehicles(device_id);

-- Triggers
CREATE TRIGGER set_devices_updated_at
  BEFORE UPDATE ON devices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_vehicles_updated_at
  BEFORE UPDATE ON vehicles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

- [ ] **Step 3: Apply migration**

Run: `supabase db push`
Expected: Migration applied successfully

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/
git commit -m "feat: add devices and vehicles tables"
```

---

### Task 9: Database Migration — Positions (Partitioned)

**Files:**
- Create: `supabase/migrations/<timestamp>_positions.sql`

- [ ] **Step 1: Create migration**

```bash
supabase migration new positions
```

- [ ] **Step 2: Write migration SQL**

```sql
-- Positions table (partitioned by month on server_time)
-- NOTE: PostgreSQL does not support foreign keys on partitioned tables.
-- Referential integrity for device_id and tenant_id is enforced at the
-- application layer (Go Gateway validates IMEI → device before inserting).
CREATE TABLE positions (
  id BIGSERIAL,
  device_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  location GEOMETRY(POINT, 4326) NOT NULL,
  speed DOUBLE PRECISION,
  heading DOUBLE PRECISION,
  ignition BOOLEAN,
  altitude DOUBLE PRECISION,
  satellites INT,
  raw_data JSONB,
  device_time TIMESTAMPTZ NOT NULL,
  server_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id, server_time)
) PARTITION BY RANGE (server_time);

-- Create partitions for current and next month
CREATE TABLE positions_2026_03 PARTITION OF positions
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

CREATE TABLE positions_2026_04 PARTITION OF positions
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

-- Indexes (created on parent, applied to all partitions)
CREATE INDEX idx_positions_device_id ON positions(device_id);
CREATE INDEX idx_positions_tenant_id ON positions(tenant_id);
CREATE INDEX idx_positions_device_time ON positions(device_id, server_time DESC);
CREATE INDEX idx_positions_location ON positions USING GIST(location);
```

- [ ] **Step 3: Apply migration**

Run: `supabase db push`
Expected: Migration applied successfully

- [ ] **Step 4: Verify partitions**

Run in Supabase SQL Editor:
```sql
SELECT inhrelid::regclass AS partition_name
FROM pg_inherits
WHERE inhparent = 'positions'::regclass;
```
Expected: `positions_2026_03` and `positions_2026_04`

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/
git commit -m "feat: add partitioned positions table with PostGIS"
```

---

### Task 10: Database Migration — Geofences, Alerts & Rules

**Files:**
- Create: `supabase/migrations/<timestamp>_geofences_and_alerts.sql`

- [ ] **Step 1: Create migration**

```bash
supabase migration new geofences_and_alerts
```

- [ ] **Step 2: Write migration SQL**

```sql
-- Geofences table
CREATE TABLE geofences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  area GEOMETRY(POLYGON, 4326) NOT NULL,
  type geofence_type NOT NULL DEFAULT 'inclusion',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_geofences_tenant_id ON geofences(tenant_id);
CREATE INDEX idx_geofences_area ON geofences USING GIST(area);

-- Alerts table
CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  type alert_type NOT NULL,
  severity alert_severity NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_alerts_tenant_id ON alerts(tenant_id);
CREATE INDEX idx_alerts_device_id ON alerts(device_id);
CREATE INDEX idx_alerts_created_at ON alerts(tenant_id, created_at DESC);

-- Alert Rules table
CREATE TABLE alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
  type alert_type NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  notify_email BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_alert_rules_tenant_id ON alert_rules(tenant_id);

-- Triggers
CREATE TRIGGER set_geofences_updated_at
  BEFORE UPDATE ON geofences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_alert_rules_updated_at
  BEFORE UPDATE ON alert_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

- [ ] **Step 3: Apply migration**

Run: `supabase db push`
Expected: Migration applied successfully

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/
git commit -m "feat: add geofences, alerts, and alert_rules tables"
```

---

### Task 11: Database Migration — RLS Policies & Auth Trigger

**Files:**
- Create: `supabase/migrations/<timestamp>_rls_policies.sql`

- [ ] **Step 1: Create migration**

```bash
supabase migration new rls_policies
```

- [ ] **Step 2: Write migration SQL**

```sql
-- Helper function: get tenant_id from the authenticated user's JWT
CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS UUID AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function: check if user is platform admin
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin_platform'
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- =====================
-- ENABLE RLS
-- =====================
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE geofences ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_rules ENABLE ROW LEVEL SECURITY;

-- =====================
-- TENANTS policies
-- =====================
-- Platform admins can do everything
CREATE POLICY "admin_all_tenants" ON tenants
  FOR ALL USING (public.is_platform_admin());

-- Clients can only read their own tenant
CREATE POLICY "client_read_own_tenant" ON tenants
  FOR SELECT USING (id = public.get_user_tenant_id());

-- =====================
-- PROFILES policies
-- =====================
CREATE POLICY "admin_all_profiles" ON profiles
  FOR ALL USING (public.is_platform_admin());

CREATE POLICY "client_read_own_profile" ON profiles
  FOR SELECT USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "client_update_own_profile" ON profiles
  FOR UPDATE USING (id = auth.uid());

-- =====================
-- DEVICES policies
-- =====================
CREATE POLICY "admin_all_devices" ON devices
  FOR ALL USING (public.is_platform_admin());

CREATE POLICY "client_manage_own_devices" ON devices
  FOR ALL
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- =====================
-- VEHICLES policies
-- =====================
CREATE POLICY "admin_all_vehicles" ON vehicles
  FOR ALL USING (public.is_platform_admin());

CREATE POLICY "client_manage_own_vehicles" ON vehicles
  FOR ALL
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- =====================
-- POSITIONS policies
-- =====================
CREATE POLICY "admin_read_all_positions" ON positions
  FOR SELECT USING (public.is_platform_admin());

CREATE POLICY "client_read_own_positions" ON positions
  FOR SELECT USING (tenant_id = public.get_user_tenant_id());

-- INSERT is done by the Gateway using service_role key (bypasses RLS)
-- No INSERT policy needed for regular users

-- =====================
-- GEOFENCES policies
-- =====================
CREATE POLICY "admin_all_geofences" ON geofences
  FOR ALL USING (public.is_platform_admin());

CREATE POLICY "client_manage_own_geofences" ON geofences
  FOR ALL
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- =====================
-- ALERTS policies
-- =====================
CREATE POLICY "admin_all_alerts" ON alerts
  FOR ALL USING (public.is_platform_admin());

CREATE POLICY "client_read_own_alerts" ON alerts
  FOR SELECT USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "client_update_own_alerts" ON alerts
  FOR UPDATE USING (tenant_id = public.get_user_tenant_id());

-- =====================
-- ALERT_RULES policies
-- =====================
CREATE POLICY "admin_all_alert_rules" ON alert_rules
  FOR ALL USING (public.is_platform_admin());

CREATE POLICY "client_manage_own_alert_rules" ON alert_rules
  FOR ALL
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- =====================
-- AUTH TRIGGER: auto-create profile on signup
-- =====================
-- Note: tenant_id must be passed as user metadata during signup
-- e.g., supabase.auth.signUp({ email, password, options: { data: { tenant_id, full_name } } })

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  _tenant_id UUID;
BEGIN
  -- Validate tenant_id is provided and exists
  _tenant_id := (NEW.raw_user_meta_data->>'tenant_id')::UUID;

  IF _tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id is required in user metadata';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = _tenant_id AND active = true) THEN
    RAISE EXCEPTION 'tenant_id % does not exist or is inactive', _tenant_id;
  END IF;

  -- Always assign 'client' role on signup.
  -- Admin role is assigned separately via admin-only API using service_role key.
  INSERT INTO public.profiles (id, tenant_id, full_name, role)
  VALUES (
    NEW.id,
    _tenant_id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'client'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

- [ ] **Step 3: Apply migration**

Run: `supabase db push`
Expected: Migration applied successfully

- [ ] **Step 4: Verify RLS is enabled**

Run in Supabase SQL Editor:
```sql
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public' AND tablename IN (
  'tenants', 'profiles', 'devices', 'vehicles',
  'positions', 'geofences', 'alerts', 'alert_rules'
);
```
Expected: All 8 rows show `rowsecurity = true`

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/
git commit -m "feat: add RLS policies and auth trigger"
```

---

### Task 12: Generate Supabase TypeScript Types

**Files:**
- Modify: `web/src/types/database.ts` (auto-generated)
- Create: `web/drizzle.config.ts`

- [ ] **Step 1: Generate types from Supabase**

```bash
supabase gen types typescript --project-id "<your-project-id>" > web/src/types/database.ts
```

- [ ] **Step 2: Verify generated types contain our tables**

Open `web/src/types/database.ts` and confirm it includes types for: `tenants`, `profiles`, `devices`, `vehicles`, `positions`, `geofences`, `alerts`, `alert_rules`.

- [ ] **Step 3: Create Drizzle config**

```typescript
// web/drizzle.config.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

- [ ] **Step 4: Create Drizzle schema (introspect from Supabase)**

```bash
cd web && npx drizzle-kit pull
```

This generates a Drizzle schema file from the existing database. Move the generated schema to `src/lib/db/schema.ts`.

- [ ] **Step 5: Create Drizzle client**

```typescript
// web/src/lib/db/index.ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString, { prepare: false });

export const db = drizzle(client, { schema });
```

- [ ] **Step 6: Verify the app still builds**

Run: `cd web && npm run build`
Expected: Build succeeds

- [ ] **Step 7: Commit**

```bash
git add web/src/types/database.ts web/drizzle.config.ts web/src/lib/db/ web/drizzle/
git commit -m "feat: generate Supabase types and Drizzle schema"
```

---

### Task 13: Seed Data for Development

**Files:**
- Create: `supabase/seed.sql`

- [ ] **Step 1: Write seed SQL**

```sql
-- supabase/seed.sql
-- Development seed data — creates a test tenant, user, devices, and vehicles

-- Test tenant
INSERT INTO tenants (id, name, slug, plan)
VALUES ('a0000000-0000-0000-0000-000000000001', 'Demo Fleet', 'demo-fleet', 'starter')
ON CONFLICT (id) DO NOTHING;

-- Test devices
INSERT INTO devices (id, tenant_id, imei, protocol, model, active)
VALUES
  ('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '123456789012345', 'suntech', 'ST340LC', true),
  ('d0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', '123456789012346', 'suntech', 'ST340LC', true),
  ('d0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', '123456789012347', 'suntech', 'ST340LC', true)
ON CONFLICT (id) DO NOTHING;

-- Test vehicles
INSERT INTO vehicles (id, tenant_id, device_id, plate, brand, model, year, color)
VALUES
  ('v0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'ABC-1234', 'Toyota', 'Hilux', 2023, 'Branco'),
  ('v0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'DEF-5678', 'Fiat', 'Strada', 2024, 'Prata'),
  ('v0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003', 'GHI-9012', 'VW', 'Saveiro', 2022, 'Preto')
ON CONFLICT (id) DO NOTHING;

-- Test geofence (polygon around São Paulo city center)
INSERT INTO geofences (id, tenant_id, name, area, type)
VALUES (
  'g0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'Base SP',
  ST_GeomFromText('POLYGON((-46.66 -23.55, -46.64 -23.55, -46.64 -23.53, -46.66 -23.53, -46.66 -23.55))', 4326),
  'inclusion'
)
ON CONFLICT (id) DO NOTHING;

-- Test alert rules
INSERT INTO alert_rules (id, tenant_id, device_id, type, config, notify_email, active)
VALUES
  ('r0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', NULL, 'speed', '{"max_speed": 120}', false, true),
  ('r0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', NULL, 'geofence', '{"geofence_id": "g0000000-0000-0000-0000-000000000001"}', false, true)
ON CONFLICT (id) DO NOTHING;
```

- [ ] **Step 2: Apply seed data**

Run in Supabase SQL Editor or via CLI:
```bash
supabase db push
# Then run seed manually:
psql "$DATABASE_URL" -f supabase/seed.sql
```

Or paste the SQL directly in Supabase Studio SQL Editor.

- [ ] **Step 3: Create test user via Supabase Dashboard**

Go to Supabase Dashboard → Authentication → Users → Create User:
- Email: `demo@tracker.dev`
- Password: `demo123456`
- User Metadata: `{"tenant_id": "a0000000-0000-0000-0000-000000000001", "full_name": "Demo User", "role": "client"}`

Verify that a row was automatically created in `public.profiles` with the correct `tenant_id`.

- [ ] **Step 4: Create platform admin user**

Go to Supabase Dashboard → Authentication → Create User:
- Email: `admin@tracker.dev`
- Password: `admin123456`
- User Metadata: `{"tenant_id": "a0000000-0000-0000-0000-000000000001", "full_name": "Admin"}`

Then promote to admin via SQL (since the trigger always assigns 'client'):
```sql
UPDATE profiles SET role = 'admin_platform'
WHERE id = (SELECT id FROM auth.users WHERE email = 'admin@tracker.dev');
```

- [ ] **Step 5: Verify RLS works**

In Supabase SQL Editor, test as the demo user:
```sql
-- This should return only devices from tenant a000...001
SELECT * FROM devices;
```

- [ ] **Step 6: Commit**

```bash
git add supabase/seed.sql
git commit -m "feat: add development seed data"
```

---

### Task 14: Verify Everything Works End-to-End

- [ ] **Step 1: Run gateway tests**

Run: `cd gateway && go test ./... -v`
Expected: All tests PASS

- [ ] **Step 2: Build web app**

Run: `cd web && npm run build`
Expected: Build succeeds

- [ ] **Step 3: Start web dev server and verify login**

Run: `cd web && npm run dev`
Open: http://localhost:3000
Expected: Redirected to /login (middleware working)

- [ ] **Step 4: Verify database schema is complete**

Run in Supabase SQL Editor:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```
Expected: `alert_rules, alerts, devices, geofences, positions, profiles, tenants, vehicles`

- [ ] **Step 5: Verify seed data**

```sql
SELECT count(*) as tenants FROM tenants;     -- Expected: 1
SELECT count(*) as devices FROM devices;     -- Expected: 3
SELECT count(*) as vehicles FROM vehicles;   -- Expected: 3
SELECT count(*) as geofences FROM geofences; -- Expected: 1
SELECT count(*) as rules FROM alert_rules;   -- Expected: 2
```

- [ ] **Step 6: Final commit with any fixes**

```bash
git add -A
git commit -m "chore: verify foundation setup complete"
```
