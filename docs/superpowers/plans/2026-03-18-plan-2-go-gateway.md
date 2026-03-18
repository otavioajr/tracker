# Plan 2: Go Gateway Implementation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-ready TCP gateway in Go that receives GPS positions from Suntech devices, stores them in PostgreSQL (Supabase), evaluates alert rules, and exposes metrics.

**Architecture:** TCP server with 1 goroutine per connection. Incoming bytes are routed through a protocol parser (interface-based, starting with Suntech). Parsed positions are sent to a batch writer that flushes to PostgreSQL periodically. An alert engine evaluates rules in-memory against each position. A resilience buffer prevents data loss during database outages.

**Tech Stack:** Go 1.23+, pgx (PostgreSQL driver), PostGIS, net (TCP)

**Spec:** `docs/superpowers/specs/2026-03-17-vehicle-tracker-design.md`

**Existing code:** `gateway/internal/config/` (config + tests), `gateway/cmd/gateway/main.go` (placeholder)

---

## File Structure

```
gateway/
├── cmd/gateway/main.go                     # MODIFY — wire all components, graceful shutdown
├── internal/
│   ├── config/config.go                    # MODIFY — add RuleSyncInterval, BufferSize, FlushInterval
│   ├── protocol/
│   │   ├── protocol.go                     # CREATE — Parser interface, Position struct, registry
│   │   ├── suntech.go                      # CREATE — Suntech ST300/ST340 parser
│   │   └── suntech_test.go                 # CREATE — Parser tests with real packets
│   ├── server/
│   │   ├── tcp.go                          # CREATE — TCP listener, connection handler, IMEI lookup
│   │   └── tcp_test.go                     # CREATE — Server tests
│   ├── storage/
│   │   ├── writer.go                       # CREATE — PostgreSQL batch writer using pgx
│   │   ├── writer_test.go                  # CREATE — Writer tests
│   │   ├── buffer.go                       # CREATE — In-memory ring buffer + disk fallback
│   │   └── buffer_test.go                  # CREATE — Buffer tests
│   ├── alerts/
│   │   ├── engine.go                       # CREATE — Rule evaluation (speed, ignition, battery)
│   │   ├── engine_test.go                  # CREATE — Engine tests
│   │   ├── sync.go                         # CREATE — Poll alert_rules from DB
│   │   └── sync_test.go                    # CREATE — Sync tests
│   └── metrics/
│       └── metrics.go                      # CREATE — HTTP metrics endpoint
├── Dockerfile                              # CREATE — Multi-stage build

simulator/
├── cmd/simulator/main.go                   # MODIFY — full CLI with flags
├── internal/
│   └── suntech/
│       ├── generator.go                    # CREATE — Generate Suntech packets
│       └── generator_test.go               # CREATE — Generator tests
```

---

### Task 1: Protocol Interface & Position Struct

**Files:**
- Create: `gateway/internal/protocol/protocol.go`

- [ ] **Step 1: Create protocol.go**

```go
// gateway/internal/protocol/protocol.go
package protocol

import "time"

// Position represents a parsed GPS position from any device protocol.
type Position struct {
	IMEI       string
	Latitude   float64
	Longitude  float64
	Speed      float64   // km/h
	Heading    float64   // degrees 0-360
	Altitude   float64
	Satellites int
	Ignition   bool
	Battery    float64 // volts
	DeviceTime time.Time
	RawData    string // original message for debugging
}

// Parser defines the interface that all device protocol parsers must implement.
type Parser interface {
	// Identify returns true if the data matches this parser's protocol.
	Identify(data []byte) bool
	// Parse extracts a Position from raw device data.
	Parse(data []byte) (*Position, error)
	// ACK returns the acknowledgment bytes to send back to the device, or nil if none needed.
	ACK(data []byte) []byte
	// Name returns the protocol name (e.g., "suntech").
	Name() string
}

// Registry holds registered parsers and routes data to the correct one.
type Registry struct {
	parsers []Parser
}

// NewRegistry creates a parser registry with the given parsers.
func NewRegistry(parsers ...Parser) *Registry {
	return &Registry{parsers: parsers}
}

// Find returns the first parser that identifies the data, or nil.
func (r *Registry) Find(data []byte) Parser {
	for _, p := range r.parsers {
		if p.Identify(data) {
			return p
		}
	}
	return nil
}
```

- [ ] **Step 2: Commit**

```bash
git add gateway/internal/protocol/protocol.go
git commit -m "feat(gateway): add protocol interface and Position struct"
```

---

### Task 2: Suntech Protocol Parser

**Files:**
- Create: `gateway/internal/protocol/suntech.go`
- Create: `gateway/internal/protocol/suntech_test.go`

The Suntech ST300/ST340 protocol is text-based with semicolon-separated fields. A typical STT (Status Tracking) message:

```
ST300STT;123456789012345;04;374;20260318;10:30:00;0CD4A;-23.550520;-046.633308;000.000;000.00;11;1;0;12.24
```

Fields: Header+Type(0);IMEI(1);Model(2);SW(3);Date(4);Time(5);Cell(6);Lat(7);Lon(8);Speed(9);Course(10);Sats(11);Fix(12);Ignition/IO(13);Battery(14)

- [ ] **Step 1: Write suntech_test.go**

```go
// gateway/internal/protocol/suntech_test.go
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
		{"ST300 STT message", "ST300STT;123456789012345;04;374;20260318;10:30:00;0CD4A;-23.550520;-046.633308;000.000;000.00;11;1;0;12.24", true},
		{"ST340 STT message", "ST340STT;123456789012345;04;374;20260318;10:30:00;0CD4A;-23.550520;-046.633308;000.000;000.00;11;1;0;12.24", true},
		{"Unknown protocol", "UNKNOWN;data;here", false},
		{"Empty data", "", false},
		{"Too short", "ST3", false},
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
		data := []byte("ST300STT;123456789012345;04;374;20260318;10:30:00;0CD4A;-23.550520;-046.633308;045.500;127.30;11;1;1;12.24")

		pos, err := p.Parse(data)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if pos.IMEI != "123456789012345" {
			t.Errorf("IMEI = %q, want %q", pos.IMEI, "123456789012345")
		}
		if pos.Latitude != -23.550520 {
			t.Errorf("Latitude = %f, want %f", pos.Latitude, -23.550520)
		}
		if pos.Longitude != -46.633308 {
			t.Errorf("Longitude = %f, want %f", pos.Longitude, -46.633308)
		}
		if pos.Speed != 45.5 {
			t.Errorf("Speed = %f, want %f", pos.Speed, 45.5)
		}
		if pos.Heading != 127.30 {
			t.Errorf("Heading = %f, want %f", pos.Heading, 127.30)
		}
		if pos.Satellites != 11 {
			t.Errorf("Satellites = %d, want %d", pos.Satellites, 11)
		}
		if !pos.Ignition {
			t.Error("Ignition = false, want true")
		}

		expectedTime := time.Date(2026, 3, 18, 10, 30, 0, 0, time.UTC)
		if !pos.DeviceTime.Equal(expectedTime) {
			t.Errorf("DeviceTime = %v, want %v", pos.DeviceTime, expectedTime)
		}
	})

	t.Run("too few fields", func(t *testing.T) {
		data := []byte("ST300STT;123456789012345;04")
		_, err := p.Parse(data)
		if err == nil {
			t.Error("expected error for too few fields")
		}
	})

	t.Run("invalid latitude", func(t *testing.T) {
		data := []byte("ST300STT;123456789012345;04;374;20260318;10:30:00;0CD4A;INVALID;-046.633308;000.000;000.00;11;1;0;12.24")
		_, err := p.Parse(data)
		if err == nil {
			t.Error("expected error for invalid latitude")
		}
	})
}

func TestSuntechACK(t *testing.T) {
	p := NewSuntechParser()
	ack := p.ACK([]byte("ST300STT;123456789012345;..."))
	// Suntech STT messages don't require ACK
	if ack != nil {
		t.Errorf("ACK should be nil for STT messages, got %v", ack)
	}
}

func TestSuntechName(t *testing.T) {
	p := NewSuntechParser()
	if p.Name() != "suntech" {
		t.Errorf("Name() = %q, want %q", p.Name(), "suntech")
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd gateway && go test ./internal/protocol/ -v`
Expected: FAIL — NewSuntechParser not defined

- [ ] **Step 3: Implement suntech.go**

```go
// gateway/internal/protocol/suntech.go
package protocol

import (
	"fmt"
	"strconv"
	"strings"
	"time"
)

const (
	suntechMinFields = 13
	suntechPrefix300 = "ST300"
	suntechPrefix340 = "ST340"
)

// SuntechParser parses Suntech ST300/ST340 GPS tracker messages.
type SuntechParser struct{}

// NewSuntechParser creates a new Suntech protocol parser.
func NewSuntechParser() *SuntechParser {
	return &SuntechParser{}
}

func (p *SuntechParser) Name() string { return "suntech" }

func (p *SuntechParser) Identify(data []byte) bool {
	s := string(data)
	return strings.HasPrefix(s, suntechPrefix300) || strings.HasPrefix(s, suntechPrefix340)
}

func (p *SuntechParser) Parse(data []byte) (*Position, error) {
	raw := strings.TrimRight(string(data), "\r\n")
	fields := strings.Split(raw, ";")

	if len(fields) < suntechMinFields {
		return nil, fmt.Errorf("suntech: expected at least %d fields, got %d", suntechMinFields, len(fields))
	}

	imei := fields[1]

	lat, err := strconv.ParseFloat(fields[7], 64)
	if err != nil {
		return nil, fmt.Errorf("suntech: invalid latitude %q: %w", fields[7], err)
	}

	lon, err := strconv.ParseFloat(fields[8], 64)
	if err != nil {
		return nil, fmt.Errorf("suntech: invalid longitude %q: %w", fields[8], err)
	}

	speed, err := strconv.ParseFloat(fields[9], 64)
	if err != nil {
		return nil, fmt.Errorf("suntech: invalid speed %q: %w", fields[9], err)
	}

	heading, err := strconv.ParseFloat(fields[10], 64)
	if err != nil {
		return nil, fmt.Errorf("suntech: invalid heading %q: %w", fields[10], err)
	}

	sats, err := strconv.Atoi(fields[11])
	if err != nil {
		return nil, fmt.Errorf("suntech: invalid satellites %q: %w", fields[11], err)
	}

	// Parse ignition from IO field (field 13): "1" = on, "0" = off
	ignition := false
	if len(fields) > 13 {
		ignition = fields[13] == "1"
	}

	// Parse device time from date (field 4) + time (field 5)
	deviceTime, err := time.Parse("20060102;15:04:05", fields[4]+";"+fields[5])
	if err != nil {
		return nil, fmt.Errorf("suntech: invalid datetime %q;%q: %w", fields[4], fields[5], err)
	}

	return &Position{
		IMEI:       imei,
		Latitude:   lat,
		Longitude:  lon,
		Speed:      speed,
		Heading:    heading,
		Satellites: sats,
		Ignition:   ignition,
		DeviceTime: deviceTime,
		RawData:    raw,
	}, nil
}

func (p *SuntechParser) ACK(data []byte) []byte {
	// Suntech STT messages don't require acknowledgment
	return nil
}
```

- [ ] **Step 4: Run tests**

Run: `cd gateway && go test ./internal/protocol/ -v`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add gateway/internal/protocol/
git commit -m "feat(gateway): add Suntech ST300/ST340 protocol parser"
```

---

### Task 3: PostgreSQL Batch Writer

**Files:**
- Create: `gateway/internal/storage/writer.go`
- Create: `gateway/internal/storage/writer_test.go`

- [ ] **Step 1: Add pgx dependency**

```bash
cd gateway && go get github.com/jackc/pgx/v5
```

- [ ] **Step 2: Write writer_test.go**

```go
// gateway/internal/storage/writer_test.go
package storage

import (
	"testing"
	"time"

	"github.com/otavioajr/tracker/gateway/internal/protocol"
)

func TestBuildBatchSQL(t *testing.T) {
	positions := []*protocol.Position{
		{
			IMEI:       "123456789012345",
			Latitude:   -23.55,
			Longitude:  -46.63,
			Speed:      60.0,
			Heading:    180.0,
			Satellites: 10,
			Ignition:   true,
			DeviceTime: time.Date(2026, 3, 18, 10, 0, 0, 0, time.UTC),
			RawData:    "raw1",
		},
		{
			IMEI:       "123456789012346",
			Latitude:   -23.56,
			Longitude:  -46.64,
			Speed:      0.0,
			Heading:    0.0,
			Satellites: 8,
			Ignition:   false,
			DeviceTime: time.Date(2026, 3, 18, 10, 1, 0, 0, time.UTC),
			RawData:    "raw2",
		},
	}

	// Test that DeviceInfo lookup is used correctly
	devices := map[string]DeviceInfo{
		"123456789012345": {DeviceID: "d0000000-0000-0000-0000-000000000001", TenantID: "a0000000-0000-0000-0000-000000000001"},
		"123456789012346": {DeviceID: "d0000000-0000-0000-0000-000000000002", TenantID: "a0000000-0000-0000-0000-000000000001"},
	}

	sql, args := buildBatchInsert(positions, devices)

	if sql == "" {
		t.Fatal("expected non-empty SQL")
	}
	if len(args) != 22 { // 11 args per position * 2 positions
		t.Errorf("expected 22 args, got %d", len(args))
	}
}

func TestBuildBatchSQL_SkipsUnknownDevices(t *testing.T) {
	positions := []*protocol.Position{
		{IMEI: "unknown_imei", Latitude: -23.55, Longitude: -46.63, DeviceTime: time.Now(), RawData: "raw"},
	}

	sql, args := buildBatchInsert(positions, map[string]DeviceInfo{})
	if sql != "" {
		t.Error("expected empty SQL when all devices are unknown")
	}
	if len(args) != 0 {
		t.Errorf("expected 0 args, got %d", len(args))
	}
}
```

- [ ] **Step 3: Implement writer.go**

```go
// gateway/internal/storage/writer.go
package storage

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/otavioajr/tracker/gateway/internal/protocol"
)

// DeviceInfo maps an IMEI to its database IDs.
type DeviceInfo struct {
	DeviceID string
	TenantID string
}

// Writer batches GPS positions and flushes them to PostgreSQL.
type Writer struct {
	pool          *pgxpool.Pool
	devices       map[string]DeviceInfo // IMEI -> DeviceInfo
	mu            sync.RWMutex
	batch         []*protocol.Position
	batchMu       sync.Mutex
	flushInterval time.Duration
	flushSize     int
	onFlushError  func([]*protocol.Position) // callback when flush fails (for buffer)
	logger        *slog.Logger
}

// WriterConfig configures the batch writer.
type WriterConfig struct {
	Pool          *pgxpool.Pool // shared pool — do NOT close from writer
	FlushInterval time.Duration // default 1s
	FlushSize     int           // default 100
	OnFlushError  func([]*protocol.Position)
	Logger        *slog.Logger
}

// NewWriter creates a new PostgreSQL batch writer using a shared pool.
func NewWriter(cfg WriterConfig) *Writer {
	if cfg.FlushInterval == 0 {
		cfg.FlushInterval = time.Second
	}
	if cfg.FlushSize == 0 {
		cfg.FlushSize = 100
	}
	if cfg.Logger == nil {
		cfg.Logger = slog.Default()
	}

	return &Writer{
		pool:          cfg.Pool,
		devices:       make(map[string]DeviceInfo),
		flushInterval: cfg.FlushInterval,
		flushSize:     cfg.FlushSize,
		onFlushError:  cfg.OnFlushError,
		logger:        cfg.Logger,
	}
}

// LoadDevices fetches all active devices from the database and caches them.
func (w *Writer) LoadDevices(ctx context.Context) error {
	rows, err := w.pool.Query(ctx, "SELECT id, tenant_id, imei FROM devices WHERE active = true")
	if err != nil {
		return fmt.Errorf("storage: failed to load devices: %w", err)
	}
	defer rows.Close()

	devices := make(map[string]DeviceInfo)
	for rows.Next() {
		var id, tenantID, imei string
		if err := rows.Scan(&id, &tenantID, &imei); err != nil {
			return fmt.Errorf("storage: failed to scan device: %w", err)
		}
		devices[imei] = DeviceInfo{DeviceID: id, TenantID: tenantID}
	}

	w.mu.Lock()
	w.devices = devices
	w.mu.Unlock()

	w.logger.Info("loaded devices", "count", len(devices))
	return nil
}

// LookupDevice returns the DeviceInfo for an IMEI, if registered.
func (w *Writer) LookupDevice(imei string) (DeviceInfo, bool) {
	w.mu.RLock()
	defer w.mu.RUnlock()
	info, ok := w.devices[imei]
	return info, ok
}

// Enqueue adds a position to the batch. Triggers flush if batch is full.
func (w *Writer) Enqueue(pos *protocol.Position) {
	w.batchMu.Lock()
	w.batch = append(w.batch, pos)
	shouldFlush := len(w.batch) >= w.flushSize
	w.batchMu.Unlock()

	if shouldFlush {
		go w.Flush(context.Background())
	}
}

// Flush writes all queued positions to PostgreSQL.
func (w *Writer) Flush(ctx context.Context) {
	w.batchMu.Lock()
	if len(w.batch) == 0 {
		w.batchMu.Unlock()
		return
	}
	positions := w.batch
	w.batch = nil
	w.batchMu.Unlock()

	w.mu.RLock()
	devices := w.devices
	w.mu.RUnlock()

	sql, args := buildBatchInsert(positions, devices)
	if sql == "" {
		return
	}

	_, err := w.pool.Exec(ctx, sql, args...)
	if err != nil {
		w.logger.Error("failed to flush positions", "count", len(positions), "error", err)
		if w.onFlushError != nil {
			w.onFlushError(positions)
		}
		return
	}

	w.logger.Debug("flushed positions", "count", len(positions))
}

// StartFlusher runs periodic flush on an interval. Call in a goroutine.
func (w *Writer) StartFlusher(ctx context.Context) {
	ticker := time.NewTicker(w.flushInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			w.Flush(context.Background()) // final flush
			return
		case <-ticker.C:
			w.Flush(ctx)
		}
	}
}

// UpdateLastCommunication updates the device's last_communication_at timestamp.
func (w *Writer) UpdateLastCommunication(ctx context.Context, imei string) {
	info, ok := w.LookupDevice(imei)
	if !ok {
		return
	}
	_, err := w.pool.Exec(ctx, "UPDATE devices SET last_communication_at = now() WHERE id = $1", info.DeviceID)
	if err != nil {
		w.logger.Error("failed to update last_communication_at", "imei", imei, "error", err)
	}
}

// Close flushes remaining positions. Does NOT close the shared pool.
func (w *Writer) Close() {
	w.Flush(context.Background())
}

// buildBatchInsert constructs a multi-row INSERT statement.
func buildBatchInsert(positions []*protocol.Position, devices map[string]DeviceInfo) (string, []any) {
	var values []string
	var args []any
	paramIdx := 1

	for _, pos := range positions {
		info, ok := devices[pos.IMEI]
		if !ok {
			continue
		}

		rawJSON, _ := json.Marshal(map[string]string{"raw": pos.RawData})

		values = append(values, fmt.Sprintf(
			"($%d, $%d, ST_SetSRID(ST_MakePoint($%d, $%d), 4326), $%d, $%d, $%d, $%d, $%d, $%d::jsonb, $%d, now())",
			paramIdx, paramIdx+1, paramIdx+2, paramIdx+3,
			paramIdx+4, paramIdx+5, paramIdx+6, paramIdx+7,
			paramIdx+8, paramIdx+9, paramIdx+10,
		))
		args = append(args,
			info.DeviceID, info.TenantID,
			pos.Longitude, pos.Latitude,
			pos.Speed, pos.Heading, pos.Ignition, pos.Altitude,
			pos.Satellites, string(rawJSON), pos.DeviceTime,
		)
		paramIdx += 11
	}

	if len(values) == 0 {
		return "", nil
	}

	sql := fmt.Sprintf(
		"INSERT INTO positions (device_id, tenant_id, location, speed, heading, ignition, altitude, satellites, raw_data, device_time, server_time) VALUES %s",
		strings.Join(values, ", "),
	)

	return sql, args
}
```

- [ ] **Step 4: Run tests**

Run: `cd gateway && go test ./internal/storage/ -v`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add gateway/internal/storage/writer.go gateway/internal/storage/writer_test.go gateway/go.mod gateway/go.sum
git commit -m "feat(gateway): add PostgreSQL batch writer"
```

---

### Task 4: Resilience Buffer

**Files:**
- Create: `gateway/internal/storage/buffer.go`
- Create: `gateway/internal/storage/buffer_test.go`

- [ ] **Step 1: Write buffer_test.go**

```go
// gateway/internal/storage/buffer_test.go
package storage

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/otavioajr/tracker/gateway/internal/protocol"
)

func makeTestPosition(imei string) *protocol.Position {
	return &protocol.Position{
		IMEI:       imei,
		Latitude:   -23.55,
		Longitude:  -46.63,
		Speed:      60.0,
		DeviceTime: time.Date(2026, 3, 18, 10, 0, 0, 0, time.UTC),
		RawData:    "test",
	}
}

func TestBuffer_EnqueueAndDrain(t *testing.T) {
	buf := NewBuffer(100, "")

	buf.Enqueue(makeTestPosition("imei1"))
	buf.Enqueue(makeTestPosition("imei2"))

	positions := buf.Drain(10)
	if len(positions) != 2 {
		t.Fatalf("expected 2 positions, got %d", len(positions))
	}

	// After drain, buffer should be empty
	positions = buf.Drain(10)
	if len(positions) != 0 {
		t.Errorf("expected 0 positions after drain, got %d", len(positions))
	}
}

func TestBuffer_CapacityLimit(t *testing.T) {
	buf := NewBuffer(3, "")

	for i := 0; i < 5; i++ {
		buf.Enqueue(makeTestPosition("imei"))
	}

	// Should only have 3 (oldest dropped)
	positions := buf.Drain(10)
	if len(positions) != 3 {
		t.Fatalf("expected 3 positions (capacity), got %d", len(positions))
	}
}

func TestBuffer_DiskFallback(t *testing.T) {
	dir := t.TempDir()
	fallbackPath := filepath.Join(dir, "buffer.jsonl")
	buf := NewBuffer(2, fallbackPath)

	// Fill beyond capacity — excess should go to disk
	for i := 0; i < 5; i++ {
		buf.Enqueue(makeTestPosition("imei"))
	}

	// Check disk file exists and has content
	data, err := os.ReadFile(fallbackPath)
	if err != nil {
		t.Fatalf("expected disk fallback file: %v", err)
	}
	if len(data) == 0 {
		t.Error("expected non-empty disk fallback file")
	}
}

func TestBuffer_LoadFromDisk(t *testing.T) {
	dir := t.TempDir()
	fallbackPath := filepath.Join(dir, "buffer.jsonl")

	// Create a buffer, overflow to disk
	buf1 := NewBuffer(2, fallbackPath)
	for i := 0; i < 4; i++ {
		buf1.Enqueue(makeTestPosition("imei"))
	}

	// New buffer loads from disk on creation
	buf2 := NewBuffer(10, fallbackPath)
	positions := buf2.Drain(10)

	// Should have disk positions + memory positions from buf1 are gone (separate instance)
	if len(positions) < 2 {
		t.Errorf("expected at least 2 positions from disk, got %d", len(positions))
	}
}

func TestBuffer_Size(t *testing.T) {
	buf := NewBuffer(100, "")
	if buf.Size() != 0 {
		t.Errorf("expected size 0, got %d", buf.Size())
	}

	buf.Enqueue(makeTestPosition("imei"))
	if buf.Size() != 1 {
		t.Errorf("expected size 1, got %d", buf.Size())
	}
}
```

- [ ] **Step 2: Implement buffer.go**

```go
// gateway/internal/storage/buffer.go
package storage

import (
	"bufio"
	"encoding/json"
	"log/slog"
	"os"
	"sync"

	"github.com/otavioajr/tracker/gateway/internal/protocol"
)

// Buffer is an in-memory ring buffer for positions with disk fallback.
type Buffer struct {
	mu           sync.Mutex
	positions    []*protocol.Position
	capacity     int
	fallbackPath string
}

// NewBuffer creates a buffer. If fallbackPath is set, positions that exceed
// capacity are spilled to disk, and on creation any existing fallback file is loaded.
func NewBuffer(capacity int, fallbackPath string) *Buffer {
	b := &Buffer{
		positions: make([]*protocol.Position, 0, capacity),
		capacity:  capacity,
		fallbackPath: fallbackPath,
	}

	if fallbackPath != "" {
		b.loadFromDisk()
	}

	return b
}

// Enqueue adds a position. If at capacity, oldest is dropped (or spilled to disk).
func (b *Buffer) Enqueue(pos *protocol.Position) {
	b.mu.Lock()
	defer b.mu.Unlock()

	if len(b.positions) >= b.capacity {
		if b.fallbackPath != "" {
			// Spill oldest to disk
			b.appendToDisk(b.positions[0])
			b.positions = b.positions[1:]
		} else {
			// Drop oldest
			b.positions = b.positions[1:]
		}
	}

	b.positions = append(b.positions, pos)
}

// EnqueueBatch adds multiple positions.
func (b *Buffer) EnqueueBatch(positions []*protocol.Position) {
	for _, pos := range positions {
		b.Enqueue(pos)
	}
}

// Drain removes and returns up to n positions from the buffer.
func (b *Buffer) Drain(n int) []*protocol.Position {
	b.mu.Lock()
	defer b.mu.Unlock()

	if n > len(b.positions) {
		n = len(b.positions)
	}
	if n == 0 {
		return nil
	}

	drained := make([]*protocol.Position, n)
	copy(drained, b.positions[:n])
	b.positions = b.positions[n:]

	return drained
}

// Size returns the number of positions in the buffer.
func (b *Buffer) Size() int {
	b.mu.Lock()
	defer b.mu.Unlock()
	return len(b.positions)
}

func (b *Buffer) appendToDisk(pos *protocol.Position) {
	f, err := os.OpenFile(b.fallbackPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		slog.Error("buffer: failed to open fallback file", "error", err)
		return
	}
	defer f.Close()

	data, err := json.Marshal(pos)
	if err != nil {
		slog.Error("buffer: failed to marshal position", "error", err)
		return
	}
	f.Write(data)
	f.Write([]byte("\n"))
}

func (b *Buffer) loadFromDisk() {
	f, err := os.Open(b.fallbackPath)
	if err != nil {
		return // file doesn't exist yet
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	count := 0
	for scanner.Scan() {
		var pos protocol.Position
		if err := json.Unmarshal(scanner.Bytes(), &pos); err != nil {
			slog.Error("buffer: failed to unmarshal position from disk", "error", err)
			continue
		}
		b.positions = append(b.positions, &pos)
		count++
	}

	if count > 0 {
		slog.Info("buffer: loaded positions from disk", "count", count)
		// Remove the file after loading
		os.Remove(b.fallbackPath)
	}
}
```

- [ ] **Step 3: Run tests**

Run: `cd gateway && go test ./internal/storage/ -v -run TestBuffer`
Expected: All buffer tests PASS

- [ ] **Step 4: Commit**

```bash
git add gateway/internal/storage/buffer.go gateway/internal/storage/buffer_test.go
git commit -m "feat(gateway): add resilience buffer with disk fallback"
```

---

### Task 5: Alert Engine

**Files:**
- Create: `gateway/internal/alerts/engine.go`
- Create: `gateway/internal/alerts/engine_test.go`

- [ ] **Step 1: Write engine_test.go**

```go
// gateway/internal/alerts/engine_test.go
package alerts

import (
	"testing"

	"github.com/otavioajr/tracker/gateway/internal/protocol"
)

func TestEvaluateSpeedRule(t *testing.T) {
	engine := NewEngine()
	engine.UpdateRules([]Rule{
		{ID: "r1", TenantID: "t1", DeviceID: "", Type: "speed", Config: map[string]any{"max_speed": float64(120)}},
	})

	// Over speed limit
	alerts := engine.Evaluate(&protocol.Position{IMEI: "imei1", Speed: 130}, "d1", "t1")
	if len(alerts) != 1 {
		t.Fatalf("expected 1 alert, got %d", len(alerts))
	}
	if alerts[0].Type != "speed" {
		t.Errorf("expected type 'speed', got %q", alerts[0].Type)
	}
	if alerts[0].Severity != "warning" {
		t.Errorf("expected severity 'warning', got %q", alerts[0].Severity)
	}

	// Under speed limit
	alerts = engine.Evaluate(&protocol.Position{IMEI: "imei1", Speed: 100}, "d1", "t1")
	if len(alerts) != 0 {
		t.Errorf("expected 0 alerts, got %d", len(alerts))
	}
}

func TestEvaluateIgnitionRule(t *testing.T) {
	engine := NewEngine()
	engine.UpdateRules([]Rule{
		{ID: "r2", TenantID: "t1", DeviceID: "", Type: "ignition", Config: map[string]any{}},
	})

	// Ignition on
	alerts := engine.Evaluate(&protocol.Position{IMEI: "imei1", Ignition: true}, "d1", "t1")
	if len(alerts) != 1 {
		t.Fatalf("expected 1 alert for ignition on, got %d", len(alerts))
	}

	// Ignition off
	alerts = engine.Evaluate(&protocol.Position{IMEI: "imei1", Ignition: false}, "d1", "t1")
	if len(alerts) != 0 {
		t.Errorf("expected 0 alerts for ignition off, got %d", len(alerts))
	}
}

func TestEvaluateDeviceSpecificRule(t *testing.T) {
	engine := NewEngine()
	engine.UpdateRules([]Rule{
		{ID: "r3", TenantID: "t1", DeviceID: "d1", Type: "speed", Config: map[string]any{"max_speed": float64(80)}},
	})

	// Matching device
	alerts := engine.Evaluate(&protocol.Position{IMEI: "imei1", Speed: 90}, "d1", "t1")
	if len(alerts) != 1 {
		t.Fatalf("expected 1 alert for matching device, got %d", len(alerts))
	}

	// Different device — rule shouldn't apply
	alerts = engine.Evaluate(&protocol.Position{IMEI: "imei2", Speed: 90}, "d2", "t1")
	if len(alerts) != 0 {
		t.Errorf("expected 0 alerts for different device, got %d", len(alerts))
	}
}
```

- [ ] **Step 2: Implement engine.go**

```go
// gateway/internal/alerts/engine.go
package alerts

import (
	"fmt"
	"sync"

	"github.com/otavioajr/tracker/gateway/internal/protocol"
)

// Rule represents an alert rule loaded from the database.
type Rule struct {
	ID       string
	TenantID string
	DeviceID string // empty = applies to all devices in tenant
	Type     string // "speed", "ignition", "battery", "geofence"
	Config   map[string]any
}

// Alert represents a triggered alert to be saved.
type Alert struct {
	TenantID string
	DeviceID string
	Type     string
	Severity string
	Message  string
	Metadata map[string]any
}

// Engine evaluates alert rules against incoming positions.
type Engine struct {
	mu    sync.RWMutex
	rules []Rule
}

// NewEngine creates a new alert engine.
func NewEngine() *Engine {
	return &Engine{}
}

// UpdateRules replaces all rules with a fresh set.
func (e *Engine) UpdateRules(rules []Rule) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.rules = rules
}

// Evaluate checks all applicable rules against a position and returns triggered alerts.
func (e *Engine) Evaluate(pos *protocol.Position, deviceID, tenantID string) []Alert {
	e.mu.RLock()
	defer e.mu.RUnlock()

	var triggered []Alert

	for _, rule := range e.rules {
		// Rule must match tenant
		if rule.TenantID != tenantID {
			continue
		}
		// If rule is device-specific, must match device
		if rule.DeviceID != "" && rule.DeviceID != deviceID {
			continue
		}

		if alert, ok := e.evaluateRule(rule, pos, deviceID); ok {
			triggered = append(triggered, alert)
		}
	}

	return triggered
}

func (e *Engine) evaluateRule(rule Rule, pos *protocol.Position, deviceID string) (Alert, bool) {
	switch rule.Type {
	case "speed":
		return e.evaluateSpeed(rule, pos, deviceID)
	case "ignition":
		return e.evaluateIgnition(rule, pos, deviceID)
	case "battery":
		// Battery alerts would check pos.Battery if we had that field
		// For now, skip — will be implemented when device sends battery data
		return Alert{}, false
	default:
		return Alert{}, false
	}
}

func (e *Engine) evaluateSpeed(rule Rule, pos *protocol.Position, deviceID string) (Alert, bool) {
	maxSpeed, ok := rule.Config["max_speed"].(float64)
	if !ok {
		return Alert{}, false
	}

	if pos.Speed > maxSpeed {
		return Alert{
			TenantID: rule.TenantID,
			DeviceID: deviceID,
			Type:     "speed",
			Severity: "warning",
			Message:  fmt.Sprintf("Velocidade %.0f km/h excede limite de %.0f km/h", pos.Speed, maxSpeed),
			Metadata: map[string]any{"speed": pos.Speed, "max_speed": maxSpeed, "rule_id": rule.ID},
		}, true
	}

	return Alert{}, false
}

func (e *Engine) evaluateIgnition(rule Rule, pos *protocol.Position, deviceID string) (Alert, bool) {
	if pos.Ignition {
		return Alert{
			TenantID: rule.TenantID,
			DeviceID: deviceID,
			Type:     "ignition",
			Severity: "info",
			Message:  "Ignição ligada",
			Metadata: map[string]any{"ignition": true, "rule_id": rule.ID},
		}, true
	}

	return Alert{}, false
}
```

- [ ] **Step 3: Run tests**

Run: `cd gateway && go test ./internal/alerts/ -v`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add gateway/internal/alerts/engine.go gateway/internal/alerts/engine_test.go
git commit -m "feat(gateway): add alert evaluation engine"
```

---

### Task 6: Alert Rule Sync

**Files:**
- Create: `gateway/internal/alerts/sync.go`
- Create: `gateway/internal/alerts/sync_test.go`

- [ ] **Step 1: Write sync_test.go**

```go
// gateway/internal/alerts/sync_test.go
package alerts

import (
	"testing"
)

func TestParseRuleRows(t *testing.T) {
	// Simulate rows from database
	rows := []ruleRow{
		{ID: "r1", TenantID: "t1", DeviceID: nil, Type: "speed", Config: `{"max_speed": 120}`, Active: true},
		{ID: "r2", TenantID: "t1", DeviceID: strPtr("d1"), Type: "ignition", Config: `{}`, Active: true},
		{ID: "r3", TenantID: "t1", DeviceID: nil, Type: "speed", Config: `{"max_speed": 80}`, Active: false}, // inactive
	}

	rules := parseRuleRows(rows)

	if len(rules) != 2 {
		t.Fatalf("expected 2 active rules, got %d", len(rules))
	}

	if rules[0].ID != "r1" {
		t.Errorf("expected first rule ID 'r1', got %q", rules[0].ID)
	}
	if rules[1].DeviceID != "d1" {
		t.Errorf("expected second rule DeviceID 'd1', got %q", rules[1].DeviceID)
	}
}

func strPtr(s string) *string { return &s }
```

- [ ] **Step 2: Implement sync.go**

```go
// gateway/internal/alerts/sync.go
package alerts

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type ruleRow struct {
	ID       string
	TenantID string
	DeviceID *string
	Type     string
	Config   string
	Active   bool
}

// Syncer periodically loads alert rules from the database into the engine.
type Syncer struct {
	pool     *pgxpool.Pool
	engine   *Engine
	interval time.Duration
	logger   *slog.Logger
}

// NewSyncer creates a rule syncer.
func NewSyncer(pool *pgxpool.Pool, engine *Engine, interval time.Duration, logger *slog.Logger) *Syncer {
	if logger == nil {
		logger = slog.Default()
	}
	return &Syncer{pool: pool, engine: engine, interval: interval, logger: logger}
}

// Start runs the sync loop. Call in a goroutine.
func (s *Syncer) Start(ctx context.Context) {
	// Initial sync
	if err := s.sync(ctx); err != nil {
		s.logger.Error("initial rule sync failed", "error", err)
	}

	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := s.sync(ctx); err != nil {
				s.logger.Error("rule sync failed", "error", err)
			}
		}
	}
}

func (s *Syncer) sync(ctx context.Context) error {
	rows, err := s.pool.Query(ctx,
		"SELECT id, tenant_id, device_id, type, config::text, active FROM alert_rules")
	if err != nil {
		return fmt.Errorf("alerts: failed to query rules: %w", err)
	}
	defer rows.Close()

	var ruleRows []ruleRow
	for rows.Next() {
		var r ruleRow
		if err := rows.Scan(&r.ID, &r.TenantID, &r.DeviceID, &r.Type, &r.Config, &r.Active); err != nil {
			return fmt.Errorf("alerts: failed to scan rule: %w", err)
		}
		ruleRows = append(ruleRows, r)
	}

	rules := parseRuleRows(ruleRows)
	s.engine.UpdateRules(rules)
	s.logger.Debug("synced alert rules", "count", len(rules))
	return nil
}

func parseRuleRows(rows []ruleRow) []Rule {
	var rules []Rule
	for _, r := range rows {
		if !r.Active {
			continue
		}

		var config map[string]any
		json.Unmarshal([]byte(r.Config), &config)

		deviceID := ""
		if r.DeviceID != nil {
			deviceID = *r.DeviceID
		}

		rules = append(rules, Rule{
			ID:       r.ID,
			TenantID: r.TenantID,
			DeviceID: deviceID,
			Type:     r.Type,
			Config:   config,
		})
	}
	return rules
}
```

- [ ] **Step 3: Run tests**

Run: `cd gateway && go test ./internal/alerts/ -v`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add gateway/internal/alerts/sync.go gateway/internal/alerts/sync_test.go
git commit -m "feat(gateway): add alert rule sync from database"
```

---

### Task 7: TCP Server

**Files:**
- Create: `gateway/internal/server/tcp.go`
- Create: `gateway/internal/server/tcp_test.go`

- [ ] **Step 1: Write tcp_test.go**

```go
// gateway/internal/server/tcp_test.go
package server

import (
	"fmt"
	"net"
	"testing"
	"time"

	"github.com/otavioajr/tracker/gateway/internal/protocol"
)

// mockHandler records received positions
type mockHandler struct {
	positions []*protocol.Position
}

func (m *mockHandler) HandlePosition(pos *protocol.Position) {
	m.positions = append(m.positions, pos)
}

func (m *mockHandler) IsRegistered(imei string) bool {
	return imei == "123456789012345"
}

func TestTCPServer_AcceptsConnection(t *testing.T) {
	handler := &mockHandler{}
	registry := protocol.NewRegistry(protocol.NewSuntechParser())

	srv := New(Config{
		Port:            0, // random port
		ReadTimeout:     5 * time.Second,
		IdleTimeout:     10 * time.Second,
		Logger:          nil,
	}, registry, handler)

	go srv.Start()
	defer srv.Stop()

	// Wait for server to be ready
	time.Sleep(100 * time.Millisecond)
	addr := srv.Addr()

	conn, err := net.Dial("tcp", addr)
	if err != nil {
		t.Fatalf("failed to connect: %v", err)
	}
	defer conn.Close()

	// Send a valid Suntech message
	msg := "ST300STT;123456789012345;04;374;20260318;10:30:00;0CD4A;-23.550520;-046.633308;045.500;127.30;11;1;1;12.24\r\n"
	_, err = conn.Write([]byte(msg))
	if err != nil {
		t.Fatalf("failed to write: %v", err)
	}

	// Wait for processing
	time.Sleep(200 * time.Millisecond)

	if len(handler.positions) != 1 {
		t.Fatalf("expected 1 position, got %d", len(handler.positions))
	}
	if handler.positions[0].IMEI != "123456789012345" {
		t.Errorf("IMEI = %q, want %q", handler.positions[0].IMEI, "123456789012345")
	}
}

func TestTCPServer_RejectsUnknownDevice(t *testing.T) {
	handler := &mockHandler{}
	registry := protocol.NewRegistry(protocol.NewSuntechParser())

	srv := New(Config{
		Port:        0,
		ReadTimeout: 5 * time.Second,
		IdleTimeout: 10 * time.Second,
	}, registry, handler)

	go srv.Start()
	defer srv.Stop()
	time.Sleep(100 * time.Millisecond)

	conn, err := net.Dial("tcp", srv.Addr())
	if err != nil {
		t.Fatalf("failed to connect: %v", err)
	}
	defer conn.Close()

	// Send message with unregistered IMEI
	msg := "ST300STT;999999999999999;04;374;20260318;10:30:00;0CD4A;-23.55;-046.63;0;0;11;1;0;12.24\r\n"
	conn.Write([]byte(msg))
	time.Sleep(200 * time.Millisecond)

	if len(handler.positions) != 0 {
		t.Errorf("expected 0 positions for unknown device, got %d", len(handler.positions))
	}
}

func TestTCPServer_MultipleMessages(t *testing.T) {
	handler := &mockHandler{}
	registry := protocol.NewRegistry(protocol.NewSuntechParser())

	srv := New(Config{
		Port:        0,
		ReadTimeout: 5 * time.Second,
		IdleTimeout: 10 * time.Second,
	}, registry, handler)

	go srv.Start()
	defer srv.Stop()
	time.Sleep(100 * time.Millisecond)

	conn, err := net.Dial("tcp", srv.Addr())
	if err != nil {
		t.Fatalf("failed to connect: %v", err)
	}
	defer conn.Close()

	for i := 0; i < 3; i++ {
		msg := fmt.Sprintf("ST300STT;123456789012345;04;374;20260318;10:%02d:00;0CD4A;-23.55;-046.63;%03d.0;0;11;1;0;12.24\r\n", i, i*10)
		conn.Write([]byte(msg))
	}

	time.Sleep(300 * time.Millisecond)

	if len(handler.positions) != 3 {
		t.Errorf("expected 3 positions, got %d", len(handler.positions))
	}
}
```

- [ ] **Step 2: Implement tcp.go**

```go
// gateway/internal/server/tcp.go
package server

import (
	"bufio"
	"fmt"
	"log/slog"
	"net"
	"sync"
	"sync/atomic"
	"time"

	"github.com/otavioajr/tracker/gateway/internal/protocol"
)

// PositionHandler processes parsed positions.
type PositionHandler interface {
	HandlePosition(pos *protocol.Position)
	IsRegistered(imei string) bool
}

// Config for the TCP server.
type Config struct {
	Port        int
	ReadTimeout time.Duration
	IdleTimeout time.Duration
	Logger      *slog.Logger
}

// Server is a TCP server that receives GPS device data.
type Server struct {
	config     Config
	registry   *protocol.Registry
	handler    PositionHandler
	listener   net.Listener
	logger     *slog.Logger
	activeConn atomic.Int64
	wg         sync.WaitGroup
	quit       chan struct{}
}

// New creates a TCP server.
func New(cfg Config, registry *protocol.Registry, handler PositionHandler) *Server {
	if cfg.Logger == nil {
		cfg.Logger = slog.Default()
	}
	if cfg.ReadTimeout == 0 {
		cfg.ReadTimeout = 30 * time.Second
	}
	if cfg.IdleTimeout == 0 {
		cfg.IdleTimeout = 60 * time.Second
	}

	return &Server{
		config:   cfg,
		registry: registry,
		handler:  handler,
		logger:   cfg.Logger,
		quit:     make(chan struct{}),
	}
}

// Start begins listening for TCP connections.
func (s *Server) Start() error {
	ln, err := net.Listen("tcp", fmt.Sprintf(":%d", s.config.Port))
	if err != nil {
		return fmt.Errorf("server: failed to listen: %w", err)
	}
	s.listener = ln
	s.logger.Info("TCP server listening", "addr", ln.Addr().String())

	for {
		conn, err := ln.Accept()
		if err != nil {
			select {
			case <-s.quit:
				return nil
			default:
				s.logger.Error("accept error", "error", err)
				continue
			}
		}

		s.wg.Add(1)
		s.activeConn.Add(1)
		go s.handleConnection(conn)
	}
}

// Stop gracefully shuts down the server.
func (s *Server) Stop() {
	close(s.quit)
	if s.listener != nil {
		s.listener.Close()
	}
	s.wg.Wait()
}

// Addr returns the server's listen address (useful for tests with port 0).
func (s *Server) Addr() string {
	if s.listener != nil {
		return s.listener.Addr().String()
	}
	return ""
}

// ActiveConnections returns the number of active connections.
func (s *Server) ActiveConnections() int64 {
	return s.activeConn.Load()
}

func (s *Server) handleConnection(conn net.Conn) {
	defer func() {
		conn.Close()
		s.activeConn.Add(-1)
		s.wg.Done()
	}()

	remoteAddr := conn.RemoteAddr().String()
	s.logger.Debug("new connection", "remote", remoteAddr)

	scanner := bufio.NewScanner(conn)
	for scanner.Scan() {
		select {
		case <-s.quit:
			return
		default:
		}

		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}

		// Reset idle timeout
		conn.SetDeadline(time.Now().Add(s.config.IdleTimeout))

		parser := s.registry.Find(line)
		if parser == nil {
			s.logger.Warn("unknown protocol", "remote", remoteAddr, "data", string(line[:min(len(line), 50)]))
			continue
		}

		pos, err := parser.Parse(line)
		if err != nil {
			s.logger.Warn("parse error", "protocol", parser.Name(), "error", err, "remote", remoteAddr)
			continue
		}

		// Check if device is registered
		if !s.handler.IsRegistered(pos.IMEI) {
			s.logger.Warn("unregistered device", "imei", pos.IMEI, "remote", remoteAddr)
			continue
		}

		// Send ACK if needed
		if ack := parser.ACK(line); ack != nil {
			conn.Write(ack)
		}

		s.handler.HandlePosition(pos)
	}

	if err := scanner.Err(); err != nil {
		s.logger.Debug("connection closed", "remote", remoteAddr, "error", err)
	}
}

// Note: Go 1.21+ has builtin min() — no custom implementation needed.
```

- [ ] **Step 3: Run tests**

Run: `cd gateway && go test ./internal/server/ -v`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add gateway/internal/server/
git commit -m "feat(gateway): add TCP server with connection management"
```

---

### Task 8: Metrics Endpoint

**Files:**
- Create: `gateway/internal/metrics/metrics.go`

- [ ] **Step 1: Implement metrics.go**

```go
// gateway/internal/metrics/metrics.go
package metrics

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"sync/atomic"
	"time"
)

// Metrics tracks gateway operational metrics.
type Metrics struct {
	ActiveConnections func() int64
	PositionsReceived atomic.Int64
	PositionsFlushed  atomic.Int64
	FlushErrors       atomic.Int64
	AlertsTriggered   atomic.Int64
	startTime         time.Time
}

// New creates a new Metrics instance.
func New(activeConnFn func() int64) *Metrics {
	return &Metrics{
		ActiveConnections: activeConnFn,
		startTime:         time.Now(),
	}
}

// ServeHTTP serves metrics as JSON.
func (m *Metrics) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	data := map[string]any{
		"uptime_seconds":      time.Since(m.startTime).Seconds(),
		"active_connections":  m.ActiveConnections(),
		"positions_received":  m.PositionsReceived.Load(),
		"positions_flushed":   m.PositionsFlushed.Load(),
		"flush_errors":        m.FlushErrors.Load(),
		"alerts_triggered":    m.AlertsTriggered.Load(),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

// StartServer starts the HTTP metrics server.
func StartServer(addr string, m *Metrics, logger *slog.Logger) *http.Server {
	mux := http.NewServeMux()
	mux.Handle("/metrics", m)
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok"}`))
	})

	srv := &http.Server{Addr: addr, Handler: mux}
	go func() {
		logger.Info("metrics server listening", "addr", addr)
		if err := srv.ListenAndServe(); err != http.ErrServerClosed {
			logger.Error("metrics server error", "error", err)
		}
	}()

	return srv
}
```

- [ ] **Step 2: Commit**

```bash
git add gateway/internal/metrics/
git commit -m "feat(gateway): add HTTP metrics endpoint"
```

---

### Task 9: Config Updates + Wire main.go

**Files:**
- Modify: `gateway/internal/config/config.go`
- Modify: `gateway/cmd/gateway/main.go`

- [ ] **Step 1: Update config.go**

Add these fields to the Config struct and Load function:

```go
// Add to Config struct:
RuleSyncInterval time.Duration
BufferCapacity   int
FlushInterval    time.Duration
FlushSize        int
BufferFallbackPath string
```

With defaults: RuleSyncInterval=30s, BufferCapacity=10000, FlushInterval=1s, FlushSize=100, BufferFallbackPath="./buffer.jsonl"

Read from env vars: `RULE_SYNC_INTERVAL`, `BUFFER_CAPACITY`, `FLUSH_INTERVAL`, `FLUSH_SIZE`, `BUFFER_FALLBACK_PATH`

- [ ] **Step 2: Rewrite main.go**

```go
// gateway/cmd/gateway/main.go
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/otavioajr/tracker/gateway/internal/alerts"
	"github.com/otavioajr/tracker/gateway/internal/config"
	"github.com/otavioajr/tracker/gateway/internal/metrics"
	"github.com/otavioajr/tracker/gateway/internal/protocol"
	"github.com/otavioajr/tracker/gateway/internal/server"
	"github.com/otavioajr/tracker/gateway/internal/storage"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug}))
	slog.SetDefault(logger)

	cfg, err := config.Load()
	if err != nil {
		logger.Error("failed to load config", "error", err)
		os.Exit(1)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Database pool (shared by writer and syncer)
	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		logger.Error("failed to connect to database", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		logger.Error("failed to ping database", "error", err)
		os.Exit(1)
	}
	logger.Info("connected to database")

	// Resilience buffer
	buf := storage.NewBuffer(cfg.BufferCapacity, cfg.BufferFallbackPath)

	// Alert engine
	alertEngine := alerts.NewEngine()

	// PostgreSQL writer (uses shared pool)
	writer := storage.NewWriter(storage.WriterConfig{
		Pool:          pool,
		FlushInterval: cfg.FlushInterval,
		FlushSize:     cfg.FlushSize,
		OnFlushError: func(positions []*protocol.Position) {
			buf.EnqueueBatch(positions)
			logger.Warn("positions buffered due to flush error", "count", len(positions))
		},
		Logger: logger,
	})

	// Load devices
	if err := writer.LoadDevices(ctx); err != nil {
		logger.Error("failed to load devices", "error", err)
		os.Exit(1)
	}

	// Protocol registry
	registry := protocol.NewRegistry(protocol.NewSuntechParser())

	// Metrics
	m := metrics.New(func() int64 { return 0 }) // will be updated after server starts

	// Gateway handler that connects TCP server to writer + alerts
	gw := &gateway{
		writer:      writer,
		alertEngine: alertEngine,
		pool:        pool,
		metrics:     m,
		logger:      logger,
	}

	// TCP server
	tcpServer := server.New(server.Config{
		Port:        cfg.TCPPort,
		Logger:      logger,
	}, registry, gw)

	// Update metrics to use real connection count
	m.ActiveConnections = tcpServer.ActiveConnections

	// Start background goroutines
	go writer.StartFlusher(ctx)
	go alerts.NewSyncer(pool, alertEngine, cfg.RuleSyncInterval, logger).Start(ctx)
	metricsServer := metrics.StartServer(fmt.Sprintf(":%d", cfg.MetricsPort), m, logger)

	// Start TCP server in goroutine
	go func() {
		if err := tcpServer.Start(); err != nil {
			logger.Error("TCP server error", "error", err)
			cancel()
		}
	}()

	logger.Info("tracker gateway started", "tcp_port", cfg.TCPPort, "metrics_port", cfg.MetricsPort)

	// Wait for shutdown signal
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh

	logger.Info("shutting down...")
	cancel()
	tcpServer.Stop()
	metricsServer.Close()
	writer.Close()
	logger.Info("shutdown complete")
}

// gateway connects the TCP server to the writer and alert engine.
type gateway struct {
	writer      *storage.Writer
	alertEngine *alerts.Engine
	pool        *pgxpool.Pool
	metrics     *metrics.Metrics
	logger      *slog.Logger
}

func (g *gateway) HandlePosition(pos *protocol.Position) {
	g.metrics.PositionsReceived.Add(1)
	g.writer.Enqueue(pos)

	// Evaluate alert rules
	info, ok := g.writer.LookupDevice(pos.IMEI)
	if !ok {
		return
	}

	triggered := g.alertEngine.Evaluate(pos, info.DeviceID, info.TenantID)
	for _, alert := range triggered {
		g.metrics.AlertsTriggered.Add(1)
		g.saveAlert(alert)
	}
}

func (g *gateway) IsRegistered(imei string) bool {
	_, ok := g.writer.LookupDevice(imei)
	return ok
}

func (g *gateway) saveAlert(alert alerts.Alert) {
	metadata, _ := json.Marshal(alert.Metadata)
	_, err := g.pool.Exec(context.Background(),
		"INSERT INTO alerts (tenant_id, device_id, type, severity, message, metadata) VALUES ($1, $2, $3::alert_type, $4::alert_severity, $5, $6::jsonb)",
		alert.TenantID, alert.DeviceID, alert.Type, alert.Severity, alert.Message, string(metadata),
	)
	if err != nil {
		g.logger.Error("failed to save alert", "type", alert.Type, "error", err)
	}
}
```

- [ ] **Step 3: Update config_test.go with new fields**

Add tests for the new config fields (RuleSyncInterval, BufferCapacity, etc.)

- [ ] **Step 4: Run all gateway tests**

Run: `cd gateway && go test ./... -v`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add gateway/
git commit -m "feat(gateway): wire all components in main.go with graceful shutdown"
```

---

### Task 10: Device Simulator

**Files:**
- Create: `simulator/internal/suntech/generator.go`
- Create: `simulator/internal/suntech/generator_test.go`
- Modify: `simulator/cmd/simulator/main.go`

- [ ] **Step 1: Write generator_test.go**

```go
// simulator/internal/suntech/generator_test.go
package suntech

import (
	"strings"
	"testing"
)

func TestGenerateSTT(t *testing.T) {
	msg := GenerateSTT("123456789012345", -23.55, -46.63, 60.5, 180.0, true)

	if !strings.HasPrefix(msg, "ST300STT;") {
		t.Errorf("message should start with ST300STT;, got %q", msg[:20])
	}

	parts := strings.Split(msg, ";")
	if parts[1] != "123456789012345" {
		t.Errorf("IMEI = %q, want %q", parts[1], "123456789012345")
	}

	// Should end with \r\n
	if !strings.HasSuffix(msg, "\r\n") {
		t.Error("message should end with \\r\\n")
	}
}

func TestGenerateRoute(t *testing.T) {
	points := GenerateRoute(-23.55, -46.63, -23.56, -46.64, 5)

	if len(points) != 5 {
		t.Fatalf("expected 5 points, got %d", len(points))
	}

	// First point should be start
	if points[0].Lat != -23.55 || points[0].Lon != -46.63 {
		t.Errorf("first point should be start coordinates")
	}

	// Last point should be end
	if points[4].Lat != -23.56 || points[4].Lon != -46.64 {
		t.Errorf("last point should be end coordinates")
	}
}
```

- [ ] **Step 2: Implement generator.go**

```go
// simulator/internal/suntech/generator.go
package suntech

import (
	"fmt"
	"math"
	"time"
)

// Point represents a lat/lon coordinate.
type Point struct {
	Lat, Lon float64
}

// GenerateSTT creates a Suntech ST300 STT message string.
func GenerateSTT(imei string, lat, lon, speed, heading float64, ignition bool) string {
	now := time.Now().UTC()
	date := now.Format("20060102")
	timeStr := now.Format("15:04:05")

	ign := "0"
	if ignition {
		ign = "1"
	}

	return fmt.Sprintf("ST300STT;%s;04;374;%s;%s;0CD4A;%f;%f;%06.3f;%06.2f;11;1;%s;12.24\r\n",
		imei, date, timeStr, lat, lon, speed, heading, ign)
}

// GenerateRoute creates a series of points between start and end.
func GenerateRoute(startLat, startLon, endLat, endLon float64, steps int) []Point {
	if steps < 2 {
		steps = 2
	}

	points := make([]Point, steps)
	for i := 0; i < steps; i++ {
		t := float64(i) / float64(steps-1)
		points[i] = Point{
			Lat: startLat + t*(endLat-startLat),
			Lon: startLon + t*(endLon-startLon),
		}
	}
	return points
}

// Heading calculates the bearing between two points in degrees.
func Heading(from, to Point) float64 {
	dLon := (to.Lon - from.Lon) * math.Pi / 180
	fromLat := from.Lat * math.Pi / 180
	toLat := to.Lat * math.Pi / 180

	y := math.Sin(dLon) * math.Cos(toLat)
	x := math.Cos(fromLat)*math.Sin(toLat) - math.Sin(fromLat)*math.Cos(toLat)*math.Cos(dLon)

	bearing := math.Atan2(y, x) * 180 / math.Pi
	if bearing < 0 {
		bearing += 360
	}
	return bearing
}
```

- [ ] **Step 3: Run tests**

Run: `cd simulator && go test ./... -v`
Expected: All tests PASS

- [ ] **Step 4: Rewrite simulator main.go**

```go
// simulator/cmd/simulator/main.go
package main

import (
	"flag"
	"fmt"
	"net"
	"os"
	"time"

	"github.com/otavioajr/tracker/simulator/internal/suntech"
)

func main() {
	host := flag.String("host", "localhost", "Gateway host")
	port := flag.Int("port", 5001, "Gateway TCP port")
	imei := flag.String("imei", "123456789012345", "Device IMEI")
	interval := flag.Duration("interval", 10*time.Second, "Send interval")
	speed := flag.Float64("speed", 60.0, "Simulated speed (km/h)")
	count := flag.Int("count", 0, "Number of messages (0 = infinite)")
	flag.Parse()

	addr := fmt.Sprintf("%s:%d", *host, *port)
	fmt.Printf("Connecting to %s as IMEI %s...\n", addr, *imei)

	conn, err := net.Dial("tcp", addr)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to connect: %v\n", err)
		os.Exit(1)
	}
	defer conn.Close()

	fmt.Println("Connected. Sending positions...")

	// Generate a circular route around São Paulo
	route := suntech.GenerateRoute(-23.55, -46.63, -23.57, -46.65, 20)
	routeIdx := 0
	sent := 0

	for {
		if *count > 0 && sent >= *count {
			break
		}

		point := route[routeIdx%len(route)]
		var heading float64
		if routeIdx > 0 {
			prev := route[(routeIdx-1)%len(route)]
			heading = suntech.Heading(prev, point)
		}

		msg := suntech.GenerateSTT(*imei, point.Lat, point.Lon, *speed, heading, true)
		_, err := conn.Write([]byte(msg))
		if err != nil {
			fmt.Fprintf(os.Stderr, "Send error: %v\n", err)
			os.Exit(1)
		}

		sent++
		routeIdx++
		fmt.Printf("[%d] Sent position: %.6f, %.6f @ %.0f km/h\n", sent, point.Lat, point.Lon, *speed)

		time.Sleep(*interval)
	}

	fmt.Printf("Done. Sent %d positions.\n", sent)
}
```

- [ ] **Step 5: Commit**

```bash
git add simulator/
git commit -m "feat(simulator): add Suntech device simulator with route generation"
```

---

### Task 11: Dockerfile

**Files:**
- Create: `gateway/Dockerfile`

- [ ] **Step 1: Create Dockerfile**

```dockerfile
# gateway/Dockerfile
FROM golang:1.23-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /gateway ./cmd/gateway

FROM alpine:3.19
RUN apk --no-cache add ca-certificates
COPY --from=builder /gateway /gateway

EXPOSE 5001 9090
ENTRYPOINT ["/gateway"]
```

- [ ] **Step 2: Verify build**

Run: `cd gateway && docker build -t tracker-gateway .`
Expected: Build succeeds (if Docker is installed, otherwise just commit)

- [ ] **Step 3: Commit**

```bash
git add gateway/Dockerfile
git commit -m "feat(gateway): add multi-stage Dockerfile"
```

---

### Task 12: End-to-End Verification

- [ ] **Step 1: Run all gateway tests**

```bash
cd gateway && go test ./... -v
```
Expected: All tests PASS

- [ ] **Step 2: Run simulator tests**

```bash
cd simulator && go test ./... -v
```
Expected: All tests PASS

- [ ] **Step 3: Test gateway startup (requires DATABASE_URL)**

```bash
cd gateway && DATABASE_URL="postgresql://postgres:<password>@db.yysubxhsnydmazqwtrpu.supabase.co:5432/postgres" go run ./cmd/gateway
```
Expected: Logs show "connected to database", "loaded devices" (count: 3), "TCP server listening", "synced alert rules"

- [ ] **Step 4: Test with simulator (in another terminal)**

```bash
cd simulator && go run ./cmd/simulator --host localhost --port 5001 --imei 123456789012345 --interval 2s --count 5
```
Expected: 5 positions sent, check Supabase dashboard for new rows in `positions` table

- [ ] **Step 5: Check metrics**

```bash
curl http://localhost:9090/metrics
```
Expected: JSON with `positions_received: 5`

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: verify gateway end-to-end"
```
