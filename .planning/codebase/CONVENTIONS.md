# Coding Conventions

**Analysis Date:** 2026-04-05

## Naming Patterns

**Files:**
- Use `kebab-case` for TypeScript modules and React components in `web/src/`, for example `web/src/components/map/dashboard-follow-bar.tsx`, `web/src/components/map/history-query-toolbar.tsx`, and `web/src/lib/map/dashboard-map-utils.ts`.
- Keep Next.js entry files on framework-reserved names only: `web/src/app/layout.tsx`, `web/src/app/(dashboard)/page.tsx`, and `web/src/app/auth/callback/route.ts`.
- Keep Go source files short, lowercase, and folder-aligned, for example `gateway/internal/storage/writer.go`, `gateway/internal/protocol/suntech_binary.go`, and `simulator/internal/suntech/generator.go`.
- Name tests next to the implementation with the platform-native suffix: `web/src/lib/history/history-player-utils.test.ts` and `gateway/internal/alerts/engine_test.go`.

**Functions:**
- Export React components and TypeScript types in `PascalCase`, for example `DashboardMap` in `web/src/app/(dashboard)/dashboard-map.tsx` and `DashboardFollowBar` in `web/src/components/map/dashboard-follow-bar.tsx`.
- Name hooks with the `use*` prefix, as in `useRealtimePositions` from `web/src/lib/hooks/use-realtime-positions.ts`.
- Name utility and server-action functions in `camelCase` with verb-first names, as in `getDevices`, `createDevice`, `filterDashboardVehicles`, and `formatLastSignalRelative` from `web/src/lib/actions/devices.ts` and `web/src/lib/map/dashboard-map-utils.ts`.
- In Go, export constructors as `New*` and methods in `PascalCase` only when the package API needs them, for example `NewEngine`, `UpdateRules`, `Evaluate`, and `NewPendingWriter` in `gateway/internal/alerts/engine.go` and `gateway/internal/storage/pending.go`.

**Variables:**
- Use `camelCase` for local variables, props, handlers, and derived values in TypeScript, for example `selectedDeviceId`, `handleCancelFollow`, `visibleSummaryLabel`, and `positionsMap` in `web/src/app/(dashboard)/dashboard-map.tsx` and `web/src/lib/hooks/use-realtime-positions.ts`.
- Prefer descriptive handler names for UI callbacks: `handleSelectVehicle`, `handleFitAll`, and `onExitFollow` in `web/src/app/(dashboard)/dashboard-map.tsx` and `web/src/components/map/dashboard-follow-bar.tsx`.
- Keep Go receiver names short and conventional, such as `e` for `Engine` in `gateway/internal/alerts/engine.go`, `w` for `Writer` in `gateway/internal/storage/writer.go`, and `pw` for `PendingWriter` in `gateway/internal/storage/pending.go`.

**Types:**
- Declare TypeScript props and domain types with `type` aliases in `PascalCase`, for example `DashboardMapProps`, `DashboardMobileSheetState`, and `DashboardVehicleFilter` in `web/src/app/(dashboard)/dashboard-map.tsx`, `web/src/components/map/dashboard-mobile-sheet.tsx`, and `web/src/lib/map/dashboard-map-utils.ts`.
- Use union literals for closed UI state when the set is small and explicit, for example `"collapsed" | "expanded"` in `web/src/components/map/dashboard-mobile-sheet.tsx` and `"all" | "moving" | "stopped" | "offline"` in `web/src/lib/map/dashboard-map-utils.ts`.
- Use exported Go structs with field names in `PascalCase` for package APIs, for example `Config`, `Rule`, `Alert`, and `Engine` in `gateway/internal/config/config.go` and `gateway/internal/alerts/engine.go`.

## Code Style

**Formatting:**
- No Prettier, Biome, or `.editorconfig` configuration is detected at the project root. The explicit formatter-style signal in `web/` is `web/eslint.config.mjs`, and the Go services rely on standard Go formatting conventions.
- Match the dominant TypeScript style outside generated UI primitives: use double quotes, semicolons, trailing commas where multiline formatting introduces them, and explicit type annotations for props and exported helpers. This style appears in `web/src/app/layout.tsx`, `web/src/lib/actions/devices.ts`, `web/src/lib/map/dashboard-map-utils.ts`, and `web/src/components/map/dashboard-mobile-sheet.tsx`.
- Preserve the existing generated `shadcn`/Base UI style inside `web/src/components/ui/` and `web/src/lib/utils.ts`. Those files use double quotes without semicolons, for example `web/src/components/ui/button.tsx` and `web/src/lib/utils.ts`. Do not normalize those files to a different style unless the whole generated set is being refreshed together.
- Keep Go files `gofmt`-compatible: tabs for indentation, grouped imports, and braces on the same line. This is consistent across `gateway/cmd/gateway/main.go`, `gateway/internal/config/config.go`, and `simulator/internal/suntech/generator.go`.

**Linting:**
- Use the Next.js ESLint flat config in `web/eslint.config.mjs`. It extends `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`, with only ignore-path overrides.
- Treat TypeScript strictness from `web/tsconfig.json` as part of the convention: `strict`, `isolatedModules`, `moduleResolution: "bundler"`, and the `@/*` alias are all enabled.
- No repository-level JavaScript formatting rule-set beyond ESLint is configured, so keep changes small and follow the surrounding file exactly.
- No Go linter config such as `.golangci.yml` is detected. Follow idiomatic Go and the patterns already present in `gateway/` and `simulator/`.

## Import Organization

**Order:**
1. Framework, platform, or standard-library imports first. Examples: `import type { Metadata, Viewport } from "next";` in `web/src/app/layout.tsx` and the standard-library block in `gateway/cmd/gateway/main.go`.
2. Third-party package imports next. Examples: `lucide-react`, `next/dynamic`, `@testing-library/react`, and `github.com/jackc/pgx/v5` in `web/src/app/(dashboard)/dashboard-map.tsx`, `web/src/components/map/dashboard-follow-bar.test.tsx`, and `gateway/cmd/gateway/main.go`.
3. Internal alias imports after external packages in `web/`, using `@/`, for example in `web/src/app/(dashboard)/dashboard-map.tsx`, `web/src/lib/actions/devices.ts`, and `web/src/components/map/dashboard-follow-bar.tsx`.
4. Relative imports last, especially for sibling component types and local tests, for example `./dashboard-follow-bar` in `web/src/components/map/dashboard-follow-bar.test.tsx` and `./types` in `web/src/components/map/dashboard-follow-bar.tsx`.

**Path Aliases:**
- Use the `@/*` alias defined in `web/tsconfig.json` for imports rooted under `web/src/`.
- Prefer the alias for cross-directory imports in `web/`, such as `@/lib/map/dashboard-map-utils` in `web/src/components/map/dashboard-follow-bar.tsx`.
- Use relative imports only for same-folder modules and tests, such as `./dashboard-map` in `web/src/app/(dashboard)/dashboard-map.test.tsx`.
- In Go, import project packages with the full module path declared in `gateway/go.mod` and `simulator/go.mod`, for example `github.com/otavioajr/tracker/gateway/internal/protocol` in `gateway/internal/alerts/engine.go`.

## Error Handling

**Patterns:**
- In TypeScript server actions, throw for unrecoverable read/auth failures and return plain result objects for form mutations. `web/src/lib/actions/devices.ts` throws on `getDevices()` failure but returns `{ error: string }` or `{ success: true }` from `createDevice`, `updateDevice`, and `deleteDevice`. Keep that split consistent when extending an action file.
- Central auth helpers should throw domain-specific user-facing errors, as in `web/src/lib/actions/utils.ts` with `"Não autenticado"` and `"Perfil não encontrado"`. Reuse the helper instead of duplicating auth checks in every action.
- In Go, return wrapped errors from low-level parsing/config code with `fmt.Errorf("...: %w", err)`, as in `gateway/internal/config/config.go`. Keep context at the point of failure rather than returning raw errors.
- Handle process-level failures at the edge of the app. `gateway/cmd/gateway/main.go` logs and exits after `config.Load()`, `pgxpool.ParseConfig`, `pgxpool.NewWithConfig`, and `pool.Ping`. Follow that pattern instead of calling `os.Exit` deep inside packages.

## Logging

**Framework:** `slog` in Go, no application logging framework detected in `web/`.

**Patterns:**
- Use structured `slog` logging with stable keys in the Go services. Examples include `logger.Error("failed to load config", "error", err)` in `gateway/cmd/gateway/main.go` and `w.logger.Error("failed to flush positions", "count", len(positions), "error", err)` in `gateway/internal/storage/writer.go`.
- Pass loggers through config or constructors instead of using package-global loggers when a component is long-lived. This pattern appears in `gateway/internal/server/tcp.go`, `gateway/internal/alerts/sync.go`, and `gateway/internal/storage/writer.go`.
- Fallback to `slog.Default()` only when the caller omitted a logger, as in `gateway/internal/server/tcp.go` and `gateway/internal/alerts/sync.go`.
- Avoid adding `console.log` in `web/src/`. No `console.*` usage is detected in the inspected frontend source.

## Comments

**When to Comment:**
- Keep comments sparse and limited to orchestration boundaries, protocol caveats, and non-obvious sequencing. Examples include `// Shared database pool`, `// Protocol registry (binary must be checked before ASCII)`, and `// Start background goroutines` in `gateway/cmd/gateway/main.go`.
- Prefer expressive names over explanatory comments for UI state and helpers. Files such as `web/src/app/(dashboard)/dashboard-map.tsx` and `web/src/lib/map/dashboard-map-utils.ts` rely almost entirely on naming instead of comments.
- Use inline comments in tests only when a binary or protocol detail needs decoding context, as in `gateway/internal/protocol/suntech_binary_test.go`.

**JSDoc/TSDoc:**
- JSDoc and TSDoc are not part of the current codebase convention. No representative source file in `web/src/`, `gateway/internal/`, or `simulator/internal/` uses API docblocks.
- Prefer local types plus readable names over docblocks unless a future public API requires generated docs.

## Function Design

**Size:** Keep functions focused on one layer of responsibility.
- UI components assemble state, derive display labels, and delegate heavy logic to helpers. `web/src/app/(dashboard)/dashboard-map.tsx` depends on `web/src/lib/map/dashboard-map-utils.ts` instead of embedding status logic directly.
- Put pure computation into `web/src/lib/` or package-local Go helpers. Examples: `filterDashboardVehicles` in `web/src/lib/map/dashboard-map-utils.ts` and `evaluateSpeed` in `gateway/internal/alerts/engine.go`.
- Constructors in Go accept config structs instead of long parameter lists where dependencies grow, as in `gateway/internal/server/tcp.go` and `gateway/internal/storage/writer.go`.

**Parameters:**
- Type React props explicitly with a local `type` alias, then destructure in the function signature, as in `web/src/components/map/dashboard-mobile-sheet.tsx` and `web/src/components/map/dashboard-follow-bar.tsx`.
- Accept `FormData` directly in server actions that back forms, as in `web/src/lib/actions/devices.ts`, `web/src/lib/actions/vehicles.ts`, and `web/src/lib/actions/geofences.ts`.
- In Go tests and helpers, prefer small literal structs over builder layers, as in `gateway/internal/alerts/engine_test.go` and `gateway/internal/storage/writer_test.go`.

**Return Values:**
- Return plain arrays, strings, or lightweight objects from TypeScript helpers. `web/src/lib/map/dashboard-map-utils.ts` and `web/src/lib/history/history-player-utils.ts` follow this consistently.
- Return mutation results from server actions as small plain objects with either `success` or `error`, matching `web/src/lib/actions/devices.ts`.
- In Go, return `(value, error)` or `(value, ok)` pairs instead of exceptions or sentinel globals, as in `gateway/internal/config/config.go` and `gateway/internal/storage/writer.go`.

## Module Design

**Exports:**
- Prefer named exports in TypeScript modules. Examples include `DashboardMap` in `web/src/app/(dashboard)/dashboard-map.tsx`, `DashboardFollowBar` in `web/src/components/map/dashboard-follow-bar.tsx`, and helper exports in `web/src/lib/map/dashboard-map-utils.ts`.
- Reserve default exports for Next.js entry files only, such as `web/src/app/layout.tsx`, `web/src/app/(dashboard)/page.tsx`, and `web/src/app/(auth)/login/page.tsx`.
- In Go, keep exported surface area minimal and package-scoped. Types and constructors are exported when other packages need them; helper methods such as `evaluateRule` and `saveAlert` stay unexported in `gateway/internal/alerts/engine.go` and `gateway/cmd/gateway/main.go`.

**Barrel Files:**
- No barrel files are detected in `web/src/`, `gateway/internal/`, or `simulator/internal/`.
- Import concrete modules directly, for example `@/lib/hooks/use-realtime-positions` in `web/src/app/(dashboard)/dashboard-map.tsx` and `github.com/otavioajr/tracker/gateway/internal/protocol` in `gateway/internal/server/tcp.go`.
- Add new modules as direct files in the relevant directory instead of introducing `index.ts` re-export layers unless the surrounding folder already depends on one. The only inspected `index.ts` with a concrete purpose is `web/src/lib/db/index.ts`.

---

*Convention analysis: 2026-04-05*
