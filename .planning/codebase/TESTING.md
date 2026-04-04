# Testing Patterns

**Analysis Date:** 2026-04-04

## Test Framework

**Go:**
- Framework: `testing` (standard library)
- Config: No separate config file (uses Go test conventions)
- Run all tests: `make gateway-test` or `cd gateway && go test ./... -v`
- Run single test: `cd gateway && go test -v -run TestName ./internal/package/`

**TypeScript/Next.js:**
- No test runner currently configured
- Package.json has `"test": "jest"` placeholder in scripts but no jest config detected
- Run command: `make web-test` (currently undefined)
- No test files found in web/ source tree (outside node_modules)

## Test File Organization

**Go Location (Co-located):**
- Test files sit alongside source in same directory
- Pattern: `package_name.go` paired with `package_name_test.go`
- Examples:
  - `gateway/internal/protocol/suntech.go` ↔ `gateway/internal/protocol/suntech_test.go`
  - `gateway/internal/alerts/engine.go` ↔ `gateway/internal/alerts/engine_test.go`
  - `gateway/internal/storage/writer.go` ↔ `gateway/internal/storage/writer_test.go`

**Naming Convention (Go):**
- Test functions: `TestXxx(t *testing.T)` - follows Go standard
- Subtests: `t.Run("description", func(t *testing.T) { ... })`
- Helper functions: `ptrStr(s string) *string` (package-scoped, lowercase)

## Test Structure

**Go Test Suite Organization:**

```go
package protocol

import (
	"testing"
	"time"
)

func TestSuntechIdentify(t *testing.T) {
	p := NewSuntechParser()

	tests := []struct {
		name string
		data string
		want bool
	}{
		{"ST300 STT message", "ST300STT;...", true},
		{"Unknown protocol", "UNKNOWN;...", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := p.Identify([]byte(tt.data))
			if got != tt.want {
				t.Errorf("Identify(%q) = %v, want %v", tt.data, got, tt.want)
			}
		})
	}
}

func TestSuntechParse(t *testing.T) {
	p := NewSuntechParser()

	t.Run("valid STT message", func(t *testing.T) {
		data := []byte("ST300STT;...")
		pos, err := p.Parse(data)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if pos.IMEI != "123456789012345" {
			t.Errorf("IMEI = %q, want %q", pos.IMEI, "123456789012345")
		}
	})

	t.Run("too few fields", func(t *testing.T) {
		data := []byte("ST300STT;123")
		_, err := p.Parse(data)
		if err == nil {
			t.Error("expected error for too few fields")
		}
	})
}
```

**Patterns Observed:**
- Table-driven tests for multiple scenarios (see `TestSuntechIdentify`)
- Subtests with `t.Run()` for test grouping and independent execution
- Setup inside test function (no fixtures or test helpers loaded)
- Direct assertions with `t.Errorf()` and `t.Fatalf()`

## Mocking

**Go Mocking Strategy:**
- No external mocking framework (gomock, testify, etc.)
- Manual test doubles created in test files
- Example from `gateway/internal/storage/writer_test.go`:
  ```go
  func ptrStr(s string) *string { return &s }

  w := &Writer{
    devices: map[string]DeviceInfo{
      "imei123":   info,
      "serial456": info,
    },
  }
  ```
- Dependency injection through struct fields enables testing without mocks

**What to Mock:**
- Database operations: Not directly mocked; tests use in-memory data structures
- HTTP clients: Not tested in codebase (gateway doesn't make outbound requests)
- Configuration: Pass test config structs directly to constructors

**What NOT to Mock:**
- Protocol parsing logic: Always test real parser behavior
- Business logic (alert rules, device lookups): Test with real data structures
- Time-dependent logic: Use `time.Date()` to set expected values

## Fixtures and Factories

**Test Data Creation (Go):**
- Minimal fixture pattern - create data inline in tests
- Factory helper functions: `ptrStr()` creates pointer to string (see `gateway/internal/storage/writer_test.go`)
- Example fixture from `gateway/internal/alerts/engine_test.go`:
  ```go
  func TestEvaluateSpeedRule(t *testing.T) {
    engine := NewEngine()
    engine.UpdateRules([]Rule{
      {ID: "r1", TenantID: "t1", DeviceID: "", Type: "speed", Config: map[string]any{"max_speed": float64(120)}},
    })
  ```

**Location:** Test fixtures created inline, no separate fixture files

## Coverage

**Requirements:** No coverage requirements enforced in codebase

**View Coverage (Go):**
```bash
cd gateway && go test ./... -cover
cd gateway && go test ./... -coverprofile=coverage.out && go tool cover -html=coverage.out
```

## Test Types

**Unit Tests (Go):**
- Scope: Individual parser functions, protocol parsing, alert rule evaluation
- Approach: Test public interface methods with multiple input scenarios
- Examples: `TestSuntechParse()`, `TestEvaluateSpeedRule()`, `TestBuildBatchSQL()`
- Coverage: Parser edge cases (empty data, malformed input), business logic (speed exceeded, battery low)

**Integration Tests:**
- Not present in codebase
- Would test database writes, message flow through gateway pipeline

**E2E Tests:**
- Not configured
- Could test full GPS message → database write → alert trigger flow

## Common Patterns

**Assertion Style (Go):**
```go
// Error assertions
if err != nil {
	t.Errorf("expected no error, got %v", err)
}

// Equality assertions
if pos.Latitude != -23.550520 {
	t.Errorf("Latitude = %f, want %f", pos.Latitude, -23.550520)
}

// Fatal assertions (stop test immediately)
if len(alerts) != 1 {
	t.Fatalf("expected 1 alert, got %d", len(alerts))
}

// Boolean assertions
if !pos.Ignition {
	t.Error("Ignition = false, want true")
}
```

**Error Path Testing:**
```go
t.Run("too few fields", func(t *testing.T) {
	data := []byte("ST300STT;123456789012345;04")
	_, err := p.Parse(data)
	if err == nil {
		t.Error("expected error for too few fields")
	}
})
```

**Setup Pattern (Go):**
- No setup fixtures
- Inline construction in test functions
- Consistent with Go standard library testing approach
- Example from `gateway/internal/storage/writer_test.go`:
  ```go
  w := &Writer{
    devices: map[string]DeviceInfo{
      "imei123":   info,
      "serial456": info,
    },
  }
  ```

**Device Lookup Testing (Dual Key Pattern):**
```go
func TestLookupDevice_DualKey(t *testing.T) {
	info := DeviceInfo{DeviceID: "d1", TenantID: "t1"}
	w := &Writer{
		devices: map[string]DeviceInfo{
			"imei123":   info,
			"serial456": info,
		},
	}
	got, ok := w.LookupDevice("imei123")
	if !ok {
		t.Fatal("expected found by IMEI")
	}
	if got.DeviceID != "d1" {
		t.Errorf("got %s", got.DeviceID)
	}
	_, ok = w.LookupDevice("serial456")
	if !ok {
		t.Fatal("expected found by serial")
	}
}
```

## Test Coverage by Package

**gateway/internal/protocol:**
- `suntech_test.go`: Tests Suntech STT text protocol parsing, ACK generation, message identification
- `suntech_binary_test.go`: Tests binary protocol, coordinate decoding, BCD decoding functions
- Key tests: Valid messages, malformed input, edge cases (too few fields)

**gateway/internal/alerts:**
- `engine_test.go`: Tests rule evaluation for speed, ignition, battery alerts
- `sync_test.go`: Tests rule row parsing from database rows
- Pattern: Engine initialized, rules updated, then positions evaluated for alert triggers

**gateway/internal/storage:**
- `writer_test.go`: Tests batch SQL generation, device lookup with dual keys (IMEI and serial)
- `buffer_test.go`: Tests in-memory buffer for position fallback
- `pending_test.go`: Tests pending device tracking

**gateway/internal/config:**
- `config_test.go`: Configuration loading from environment variables

**gateway/internal/server:**
- `tcp_test.go`: TCP connection handling

---

*Testing analysis: 2026-04-04*
