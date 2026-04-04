# Coding Conventions

**Analysis Date:** 2026-04-04

## Naming Patterns

**Files (TypeScript/TSX):**
- kebab-case for files: `tracking-map.tsx`, `vehicle-table.tsx`, `use-realtime-positions.ts`
- Suffix patterns: hooks start with `use-` (e.g., `use-realtime-positions.ts`)
- Suffix patterns: tests use `.test.ts` or `_test.go` (Go)
- Server action files use descriptive names: `devices.ts`, `vehicles.ts`, `positions.ts`, `alerts.ts`

**Functions (TypeScript):**
- camelCase for regular functions: `getDevices()`, `createDevice()`, `deleteVehicle()`
- camelCase for React components: `TrackingMap`, `VehicleTable`, `VehicleMarker`
- camelCase for hooks: `useRealtimePositions`
- Private functions with underscore prefix: `_parseRuleRows()` (when needed)

**Functions (Go):**
- PascalCase for exported functions: `NewWriter()`, `NewEngine()`, `LoadDevices()`, `Evaluate()`
- camelCase for unexported methods: `evaluateRule()`, `evaluateSpeed()`, `decodeBCD3()`
- Interface methods: PascalCase, single or dual letter receivers: `func (e *Engine) Evaluate(...)`

**Variables:**
- camelCase: `positions`, `devices`, `isActive`, `vehicleId`, `deviceId`
- PascalCase for struct fields in Go: `DeviceID`, `TenantID`, `VehicleID`, `Latitude`, `Longitude`
- Avoid Hungarian notation or prefixes except for booleans

**Types/Interfaces:**
- PascalCase in TypeScript: `VehiclePosition`, `TrackingMapProps`, `GeoJsonPoint`
- PascalCase in Go structs: `Position`, `Rule`, `Alert`, `Engine`, `Writer`, `DeviceInfo`
- Type aliases use PascalCase: `type GeoJsonPoint = { ... }`

**Constants:**
- Go: UPPERCASE_WITH_UNDERSCORES in file scope (e.g., `ST300MessageType` for const iota)
- TypeScript: camelCase or UPPERCASE depending on context (see tracking-map: `SAO_PAULO` for constants)

## Code Style

**Formatting:**
- ESLint with Next.js config: `eslint.config.mjs` extends `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`
- No .prettierrc in source (uses ESLint defaults)
- TypeScript target: ES2017, strict mode enabled
- Line length: following eslint defaults (typically 120 characters)

**Linting:**
- Run via: `cd web && npm run lint`
- Configuration: `web/eslint.config.mjs`
- Uses Next.js core web vitals rules plus TypeScript support
- All TypeScript strict checks enabled

**Go Code Style:**
- Standard Go formatting (gofmt implied)
- Use of `slog` for structured logging throughout gateway
- Return early pattern: `if err != nil { return err }` or `if err != nil { logger.Error(...); os.Exit(1) }`
- Error wrapping with `fmt.Errorf(..., %w, err)` for context preservation

## Import Organization

**TypeScript/Next.js Order:**
1. React/Next.js imports: `import React, { useEffect } from "react"`
2. Next.js imports: `import { revalidatePath } from "next/cache"`, `import dynamic from "next/dynamic"`
3. Third-party packages: `import { createClient } from "@/lib/supabase/server"`
4. Internal imports from `@/`: `import { getTenantId } from "./utils"`
5. Type imports: `import type { VehiclePosition } from "@/lib/actions/positions"`

**Path Aliases:**
- `@/*` maps to `src/*` (configured in `web/tsconfig.json`)
- Absolute imports preferred over relative: `@/components/ui/button` not `../../components/ui/button`

**Go Import Order:**
1. Standard library: `"context"`, `"fmt"`, `"log/slog"`
2. Third-party: `"github.com/jackc/pgx/v5"`, `"github.com/jackc/pgx/v5/pgxpool"`
3. Internal: `"github.com/otavioajr/tracker/gateway/internal/..."`

## Error Handling

**TypeScript/Server Actions:**
- Return `{ error: errorMessage }` on failure (see `web/src/lib/actions/devices.ts`)
- Return `{ success: true }` on success
- Throw `new Error(message)` for server action errors (see `getTenantId()`)
- Use try-catch implicit in server actions (not shown but standard pattern)
- Return early on error: `if (error) return { error: error.message }`

**Go:**
- Named return values for errors: `func (e *Engine) Evaluate(...) []Alert`
- Multiple returns: `pos, err := p.Parse(data)` with immediate check
- Error wrapping pattern: `return fmt.Errorf("package: context: %w", err)`
- Logger usage: `logger.Error("message", "error", err)` with structured fields
- Fatal errors: `os.Exit(1)` after logging (see `main.go`)

**JavaScript Error Messages:**
- Localized messages in Portuguese when user-facing (see "Não autenticado", "Perfil não encontrado")
- Technical error messages typically passed directly from Supabase: `error.message`

## Logging

**Framework:** 
- Go: `log/slog` with JSON handler in main.go
- TypeScript: No logging infrastructure configured in codebase

**Patterns (Go):**
- Initialize JSON logger in `main()`: `slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug}))`
- Structured fields: `logger.Error("failed to load config", "error", err)`
- Log before fatal exit: `logger.Error(...); os.Exit(1)`
- Info-level for successful operations: `logger.Info("connected to database")`

## Comments

**When to Comment:**
- Public functions and types in Go: Use godoc comments (see `// Writer batches GPS positions...`)
- Complex algorithms or non-obvious logic: Add inline comments
- Field explanations in structs: Document purpose before field definition
- Protocol parsing: Document expected format (see protocol package comments)

**JSDoc/TSDoc:**
- Not systematically used in codebase
- TypeScript uses inline type annotations instead
- Function signatures self-documenting through types

**Go Comments:**
- godoc format: `// FunctionName does X` on exported items
- Private function comments: `// functionName does X` (lowercase)

## Function Design

**Size:** 
- Prefer small, focused functions (<50 lines typical)
- Gateway handlers and parsers: 30-80 lines
- React components: 40-100 lines (tracking-map.tsx is 145 lines as exception for complex map setup)

**Parameters:**
- Server actions use `FormData` as single parameter: `createDevice(formData: FormData)`
- React components: Props object with TypeScript interface: `TrackingMapProps`
- Go: Use config structs for multiple parameters: `WriterConfig` passed to `NewWriter(cfg WriterConfig)`
- Go receivers: Pointer receivers for methods that modify: `func (e *Engine)`, `func (w *Writer)`

**Return Values:**
- Server actions: Object with `{ error?: string }` or `{ success: true }` shape
- Go: `error` always last return value
- Multiple returns in Go: `pos, err := p.Parse(data)` with zero-value fallback for non-error returns
- React hooks return current state or array (see `useRealtimePositions`: returns `VehiclePosition[]`)

## Module Design

**Exports:**
- TypeScript: Named exports preferred: `export async function getDevices()`
- TypeScript: Default exports for React components: `export function TrackingMap(...)`
- Go: Exported types and functions start with capital letter
- Go: Unexported helpers (lowercase) are defined in same file

**Barrel Files:**
- Not systematically used in `web/src/components/ui/` (each component imports directly)
- lib structure uses direct imports: `from "@/lib/supabase/server"`

**File Organization:**
- Server actions grouped by domain: `web/src/lib/actions/devices.ts`, `vehicles.ts`, `positions.ts`
- Components grouped by feature: `web/src/components/map/`, `web/src/components/vehicles/`
- Gateway internal packages by domain: `gateway/internal/protocol/`, `alerts/`, `storage/`

---

*Convention analysis: 2026-04-04*
