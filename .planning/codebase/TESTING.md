# Testing Patterns

**Analysis Date:** 2026-04-05

## Test Framework

**Runner:**
- `web/` uses `Vitest 3.2.4` from `web/package.json`.
- Config lives in `web/vitest.config.ts`.
- `gateway/` and `simulator/` use the Go standard `testing` package via `go test`, driven from the root `Makefile`, `gateway/go.mod`, and `simulator/go.mod`.

**Assertion Library:**
- `web/` uses Vitest `expect` plus `@testing-library/react` for DOM rendering and interaction in files like `web/src/app/(dashboard)/dashboard-map.test.tsx` and `web/src/components/map/dashboard-follow-bar.test.tsx`.
- `gateway/` and `simulator/` use plain `testing` assertions with `t.Fatal`, `t.Fatalf`, `t.Error`, and `t.Errorf`, as in `gateway/internal/config/config_test.go` and `simulator/internal/suntech/generator_test.go`.

**Run Commands:**
```bash
make gateway-test                  # Runs `cd gateway && go test ./... -v`
make web-test                      # Runs `cd web && npm test`
cd simulator && go test ./... -v   # Run simulator tests directly
cd web && npx vitest run src/lib/map/dashboard-map-utils.test.ts
cd gateway && go test -v -run TestSuntechParse ./internal/protocol
```

## Test File Organization

**Location:**
- Keep tests co-located with the implementation file they cover.
- In `web/`, tests sit under the same `src/` tree as production files, for example `web/src/lib/map/dashboard-map-utils.ts` with `web/src/lib/map/dashboard-map-utils.test.ts`, and `web/src/components/map/dashboard-mobile-sheet.tsx` with `web/src/components/map/dashboard-mobile-sheet.test.tsx`.
- In `gateway/`, tests sit beside package files inside `internal/`, for example `gateway/internal/alerts/engine.go` with `gateway/internal/alerts/engine_test.go` and `gateway/internal/server/tcp.go` with `gateway/internal/server/tcp_test.go`.
- In `simulator/`, tests follow the same package-local pattern, for example `simulator/internal/suntech/generator.go` with `simulator/internal/suntech/generator_test.go`.

**Naming:**
- Use `*.test.ts` and `*.test.tsx` in `web/src/`.
- Use `*_test.go` in Go packages.
- Name the suite after the module or component under test, such as `"dashboard-map-utils"`, `"DashboardMap"`, `"HistoryQueryToolbar"`, and `TestLoad_Defaults`.

**Structure:**
```text
web/src/lib/map/dashboard-map-utils.ts
web/src/lib/map/dashboard-map-utils.test.ts

web/src/components/map/dashboard-follow-bar.tsx
web/src/components/map/dashboard-follow-bar.test.tsx

gateway/internal/protocol/suntech.go
gateway/internal/protocol/suntech_test.go

simulator/internal/suntech/generator.go
simulator/internal/suntech/generator_test.go
```

## Test Structure

**Suite Organization:**
```typescript
// `web/src/components/map/dashboard-follow-bar.test.tsx`
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("DashboardFollowBar", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the followed vehicle summary and exit action", () => {
    const handleExitFollow = vi.fn();
    render(/* component */);
    fireEvent.click(screen.getByRole("button", { name: "Sair do follow" }));
    expect(handleExitFollow).toHaveBeenCalledTimes(1);
  });
});
```

```go
// `gateway/internal/protocol/suntech_test.go`
func TestSuntechParse(t *testing.T) {
	p := NewSuntechParser()

	t.Run("valid STT message", func(t *testing.T) {
		pos, err := p.Parse(data)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if pos.IMEI != "123456789012345" {
			t.Errorf("IMEI = %q, want %q", pos.IMEI, "123456789012345")
		}
	})
}
```

**Patterns:**
- In `web/`, pure utility tests run in the default Node environment from `web/vitest.config.ts`; DOM tests opt into `jsdom` per file with `// @vitest-environment jsdom`, as seen in `web/src/app/(dashboard)/dashboard-map.test.tsx` and `web/src/components/map/history-query-toolbar.test.tsx`.
- Component tests usually import `cleanup`, `render`, `screen`, and occasionally `fireEvent` from Testing Library, then call `cleanup()` in `afterEach`. This pattern is consistent in `web/src/components/map/dashboard-follow-bar.test.tsx`, `web/src/components/map/dashboard-mobile-sheet.test.tsx`, and `web/src/components/map/history-selected-point-card.test.tsx`.
- Go tests keep setup local to each package and prefer `t.Run` for grouped parser/decoder cases, as in `gateway/internal/protocol/suntech_test.go` and `gateway/internal/protocol/suntech_binary_test.go`.
- Backend tests keep fixtures close to the assertion site and avoid global setup or shared test packages.

## Mocking

**Framework:** `vi.mock` in `web/`; hand-written stubs, test doubles, and real local resources in Go.

**Patterns:**
```typescript
// `web/src/app/(dashboard)/dashboard-map.test.tsx`
vi.mock("next/dynamic", () => ({
  default: () => TrackingMapStub,
}));

vi.mock("@/lib/hooks/use-realtime-positions", () => ({
  useRealtimePositions: <T,>(positions: T[]) => positions,
}));
```

```typescript
// `web/src/components/map/history-map-controller.test.ts`
vi.mock("react-leaflet", () => ({
  useMap: () => null,
}));
```

```go
// `gateway/internal/server/tcp_test.go`
type mockHandler struct {
	positions []*protocol.Position
}

func (m *mockHandler) HandlePosition(pos *protocol.Position) {
	m.positions = append(m.positions, pos)
}
```

**What to Mock:**
- Mock browser-only or heavy runtime dependencies in `web/`, especially `next/dynamic`, `react-leaflet`, and realtime hooks. The current suite does this in `web/src/app/(dashboard)/dashboard-map.test.tsx` and `web/src/components/map/history-map-controller.test.ts`.
- Stub child components or transport edges only when the parent behavior is the real subject of the test. `TrackingMapStub` in `web/src/app/(dashboard)/dashboard-map.test.tsx` is the model to copy.
- In Go, prefer narrow interface stubs or temporary real resources over framework mocking. Examples include `mockHandler` in `gateway/internal/server/tcp_test.go` and `t.TempDir()` plus on-disk files in `gateway/internal/storage/buffer_test.go`.

**What NOT to Mock:**
- Do not mock pure utility modules such as `web/src/lib/map/dashboard-map-utils.ts`, `web/src/lib/history/history-player-utils.ts`, or parser helpers in `gateway/internal/protocol/`.
- Do not replace basic data-shaping logic with mocks when inline fixtures are enough. The current tests exercise real functions directly in `web/src/lib/map/position-location.test.ts`, `gateway/internal/alerts/engine_test.go`, and `simulator/internal/suntech/generator_test.go`.

## Fixtures and Factories

**Test Data:**
```typescript
// `web/src/lib/history/history-player-utils.test.ts`
const positions = [
  {
    device_id: "device-1",
    latitude: -23.55,
    longitude: -46.63,
    heading: 0,
    speed: 0,
    ignition: true,
    server_time: "2026-04-05T10:00:00.000Z",
  },
];
```

```typescript
// `web/src/app/(dashboard)/dashboard-map.test.tsx`
const positions = [
  {
    device_id: "truck-1",
    latitude: -23.5,
    longitude: -46.6,
    speed: 42,
    vehicle_name: "Truck 01",
  },
];
```

```go
// `gateway/internal/storage/buffer_test.go`
func makeTestPosition(imei string) *protocol.Position {
	return &protocol.Position{IMEI: imei, Latitude: -23.55, Longitude: -46.63}
}
```

**Location:**
- Keep fixtures inside the test file that uses them. No centralized fixtures, factories, or shared setup directory is detected in `web/src/`, `gateway/internal/`, or `simulator/internal/`.
- Prefer top-level `const` or `var` arrays for reusable frontend fixtures, as in `web/src/lib/history/history-player-utils.test.ts` and `web/src/app/(dashboard)/dashboard-map.test.tsx`.
- Prefer small package-local helper functions in Go for repeated struct literals, as in `gateway/internal/storage/buffer_test.go` and `gateway/internal/storage/writer_test.go`.

## Coverage

**Requirements:** No enforced coverage threshold or coverage gate is configured.

**View Coverage:**
```bash
cd gateway && go test -cover ./...
cd simulator && go test -cover ./...
# `web/` has no coverage script or provider dependency configured in `web/package.json`.
```

## Test Types

**Unit Tests:**
- Most of the suite is unit-level and exercises pure helpers or isolated package logic.
- Frontend utility unit tests live in files such as `web/src/lib/map/dashboard-map-utils.test.ts`, `web/src/lib/map/position-location.test.ts`, and `web/src/lib/history/history-player-utils.test.ts`.
- Go package unit tests cover config, alert evaluation, SQL building, buffering, and protocol parsing in `gateway/internal/config/config_test.go`, `gateway/internal/alerts/engine_test.go`, `gateway/internal/storage/writer_test.go`, and `gateway/internal/protocol/suntech_binary_test.go`.

**Integration Tests:**
- `gateway/internal/server/tcp_test.go` is the clearest integration-style test. It spins up a real TCP server, uses `net.Dial`, writes protocol frames, and waits for the handler to observe parsed positions.
- `web/src/app/(dashboard)/dashboard-map.test.tsx` is a UI integration test at the component boundary. It renders the map container, drives list selection, and verifies follow-mode behavior while stubbing only the heavy map/realtime dependencies.
- Disk-backed behavior is also exercised with real temp directories in `gateway/internal/storage/buffer_test.go`.

**E2E Tests:**
- Not used.
- No Playwright, Cypress, or browser automation test config is detected in the repository.

## Common Patterns

**Async Testing:**
```typescript
// `web/src/app/(dashboard)/dashboard-map.test.tsx`
const matches = await screen.findAllByRole("button", {
  name: /selecionar Truck 01/i,
});
fireEvent.click(matches[0]);
expect(await screen.findByText("followed:truck-1")).toBeTruthy();
```

```go
// `gateway/internal/server/tcp_test.go`
go srv.Start()
defer srv.Stop()
time.Sleep(100 * time.Millisecond)

conn, err := net.Dial("tcp", srv.Addr())
if err != nil {
	t.Fatalf("failed to connect: %v", err)
}
```

- In `web/`, use async `findBy*` queries when UI state changes after an event, as in `web/src/app/(dashboard)/dashboard-map.test.tsx`.
- Use fake timers for deterministic time logic in frontend utilities. `web/src/lib/map/dashboard-map-utils.test.ts` calls `vi.useFakeTimers()` and `vi.setSystemTime(...)`, then restores timers in `afterEach`.
- In Go networking tests, the current suite uses short `time.Sleep` windows to wait for goroutines and socket handling in `gateway/internal/server/tcp_test.go`. Keep sleeps minimal and local if you extend that package.

**Error Testing:**
```go
// `gateway/internal/protocol/suntech_test.go`
data := []byte("ST300STT;123456789012345;04")
_, err := p.Parse(data)
if err == nil {
	t.Error("expected error for too few fields")
}
```

```go
// `gateway/internal/config/config_test.go`
_, err := Load()
if err == nil {
	t.Fatal("expected error for missing DATABASE_URL")
}
```

- Most explicit error-path coverage is currently in Go, especially config and parser tests under `gateway/internal/config/` and `gateway/internal/protocol/`.
- Frontend tests are currently stronger on rendered state and derived values than on rejected promises or server-action failures. If you add tests for `web/src/lib/actions/*.ts`, follow the existing plain-object result shape from those action modules.

---

*Testing analysis: 2026-04-05*
