# Multi-Protocol Gateway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the gateway to support any GPS protocol via a session-based parser interface, then implement GT06 as the second supported protocol.

**Architecture:** Each protocol implements `Parser` with `ReadFrame` (framing control) and session-aware `Parse`/`ACK`. The server detects the protocol once per connection via `Identify`, then uses that parser for the connection lifetime. A `Session` struct per connection holds state (IMEI, protocol-specific data).

**Tech Stack:** Go 1.24, bufio, encoding/binary, encoding/hex, CRC-ITU (implemented inline)

---

### Task 1: Refactor Parser Interface + Add Session

**Files:**
- Modify: `gateway/internal/protocol/protocol.go`

- [ ] **Step 1: Write failing test for Session struct**

Create `gateway/internal/protocol/protocol_test.go`:

```go
package protocol

import "testing"

func TestSessionDefaults(t *testing.T) {
	s := &Session{}
	if s.IMEI != "" {
		t.Errorf("new session IMEI should be empty, got %q", s.IMEI)
	}
	if s.Data != nil {
		t.Error("new session Data should be nil")
	}
}

func TestSessionSetGet(t *testing.T) {
	s := &Session{Data: make(map[string]any)}
	s.IMEI = "123456789012345"
	s.Data["logged_in"] = true

	if s.IMEI != "123456789012345" {
		t.Errorf("IMEI = %q, want %q", s.IMEI, "123456789012345")
	}
	if v, ok := s.Data["logged_in"].(bool); !ok || !v {
		t.Error("Data[logged_in] should be true")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gateway && go test -v -run TestSession ./internal/protocol/`
Expected: FAIL — `Session` type not defined

- [ ] **Step 3: Update protocol.go with new interface and Session**

Replace the contents of `gateway/internal/protocol/protocol.go`:

```go
package protocol

import (
	"bufio"
	"time"
)

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
	RemoteAddr string // client IP:port, set by TCP handler
}

// Session holds per-connection state for stateful protocols.
type Session struct {
	IMEI string
	Data map[string]any
}

// Parser defines the interface that all device protocol parsers must implement.
type Parser interface {
	// Name returns the protocol name (e.g., "suntech", "gt06").
	Name() string
	// Identify returns true if the peeked bytes match this protocol.
	Identify(peek []byte) bool
	// ReadFrame reads one complete protocol frame from the reader.
	ReadFrame(reader *bufio.Reader) ([]byte, error)
	// Parse decodes a frame into a Position. Returns (nil, nil) for non-position packets (login, heartbeat).
	Parse(data []byte, session *Session) (*Position, error)
	// ACK returns an acknowledgment to send back, or nil.
	ACK(data []byte, session *Session) []byte
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

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gateway && go test -v -run TestSession ./internal/protocol/`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add gateway/internal/protocol/protocol.go gateway/internal/protocol/protocol_test.go
git commit -m "refactor: add Session struct and ReadFrame to Parser interface"
```

---

### Task 2: Adapt SuntechParser to New Interface

**Files:**
- Modify: `gateway/internal/protocol/suntech.go`
- Modify: `gateway/internal/protocol/suntech_test.go`

- [ ] **Step 1: Update SuntechParser to implement new interface**

Edit `gateway/internal/protocol/suntech.go` — add `ReadFrame` method and update `Parse`/`ACK` signatures:

```go
package protocol

import (
	"bufio"
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

type SuntechParser struct{}

func NewSuntechParser() *SuntechParser {
	return &SuntechParser{}
}

func (p *SuntechParser) Name() string { return "suntech" }

func (p *SuntechParser) Identify(data []byte) bool {
	s := string(data)
	return strings.HasPrefix(s, suntechPrefix300) || strings.HasPrefix(s, suntechPrefix340)
}

// ReadFrame reads a newline-delimited ASCII frame.
func (p *SuntechParser) ReadFrame(reader *bufio.Reader) ([]byte, error) {
	line, err := reader.ReadBytes('\n')
	if err != nil {
		return nil, err
	}
	for len(line) > 0 && (line[len(line)-1] == '\n' || line[len(line)-1] == '\r') {
		line = line[:len(line)-1]
	}
	return line, nil
}

func (p *SuntechParser) Parse(data []byte, session *Session) (*Position, error) {
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

	ignition := false
	if len(fields) > 13 {
		ignition = fields[13] == "1"
	}

	var battery float64
	if len(fields) > 14 {
		battery, _ = strconv.ParseFloat(fields[14], 64)
	}

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
		Battery:    battery,
		DeviceTime: deviceTime,
		RawData:    raw,
	}, nil
}

func (p *SuntechParser) ACK(data []byte, session *Session) []byte {
	return nil
}
```

- [ ] **Step 2: Update SuntechParser tests**

Edit `gateway/internal/protocol/suntech_test.go` — update `Parse` and `ACK` calls to pass `&Session{}`:

- Change all `p.Parse(data)` to `p.Parse(data, &Session{})`
- Change all `p.ACK(data)` to `p.ACK(data, &Session{})`
- Add a test for `ReadFrame`:

```go
func TestSuntechReadFrame(t *testing.T) {
	p := NewSuntechParser()
	input := "ST300STT;123456789012345;04;374;20260318;10:30:00;0CD4A;-23.55;-046.63;0;0;11;1;0;12.24\r\n"
	reader := bufio.NewReader(strings.NewReader(input))

	frame, err := p.ReadFrame(reader)
	if err != nil {
		t.Fatalf("ReadFrame error: %v", err)
	}

	expected := "ST300STT;123456789012345;04;374;20260318;10:30:00;0CD4A;-23.55;-046.63;0;0;11;1;0;12.24"
	if string(frame) != expected {
		t.Errorf("ReadFrame = %q, want %q", string(frame), expected)
	}
}
```

Add imports: `"bufio"` and `"strings"` to the test file.

- [ ] **Step 3: Run tests**

Run: `cd gateway && go test -v ./internal/protocol/ -run TestSuntech`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add gateway/internal/protocol/suntech.go gateway/internal/protocol/suntech_test.go
git commit -m "refactor: adapt SuntechParser to session-based interface"
```

---

### Task 3: Adapt SuntechBinaryParser to New Interface

**Files:**
- Modify: `gateway/internal/protocol/suntech_binary.go`
- Modify: `gateway/internal/protocol/suntech_binary_test.go`

- [ ] **Step 1: Update SuntechBinaryParser to implement new interface**

Edit `gateway/internal/protocol/suntech_binary.go` — add `ReadFrame` method and update `Parse`/`ACK` signatures:

Add `"bufio"` and `"io"` imports. Add `ReadFrame`:

```go
// ReadFrame reads a Suntech binary ZIP frame: STX(1) + LEN(2) + payload(LEN) + ETX(1).
func (p *SuntechBinaryParser) ReadFrame(reader *bufio.Reader) ([]byte, error) {
	header := make([]byte, 3)
	if _, err := io.ReadFull(reader, header); err != nil {
		return nil, fmt.Errorf("binary frame header: %w", err)
	}

	if header[0] != stx {
		return nil, fmt.Errorf("binary frame: expected STX, got 0x%02x", header[0])
	}

	payloadLen := int(binary.BigEndian.Uint16(header[1:3]))
	if payloadLen <= 0 || payloadLen > 4096 {
		return nil, fmt.Errorf("binary frame: invalid length %d", payloadLen)
	}

	rest := make([]byte, payloadLen+1) // payload + ETX
	if _, err := io.ReadFull(reader, rest); err != nil {
		return nil, fmt.Errorf("binary frame payload: %w", err)
	}

	frame := make([]byte, 3+payloadLen+1)
	copy(frame, header)
	copy(frame[3:], rest)

	return frame, nil
}
```

Update `Parse` signature to `Parse(data []byte, session *Session) (*Position, error)`.
Update `ACK` signature to `ACK(data []byte, session *Session) []byte`.

- [ ] **Step 2: Update SuntechBinaryParser tests**

Edit `gateway/internal/protocol/suntech_binary_test.go` — change all `p.Parse(data)` to `p.Parse(data, &Session{})`.

Add a test for `ReadFrame`:

```go
func TestSuntechBinaryReadFrame(t *testing.T) {
	p := NewSuntechBinaryParser()
	data, _ := hex.DecodeString("02003210511340877028813f180c170016041051290c0635652d793653000038001a30e601665e560000000100750002712704000103")
	reader := bufio.NewReader(bytes.NewReader(data))

	frame, err := p.ReadFrame(reader)
	if err != nil {
		t.Fatalf("ReadFrame error: %v", err)
	}

	if !bytes.Equal(frame, data) {
		t.Errorf("ReadFrame returned different data")
	}
}
```

Add imports: `"bufio"` and `"bytes"` to the test file.

- [ ] **Step 3: Run tests**

Run: `cd gateway && go test -v ./internal/protocol/ -run TestSuntechBinary`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add gateway/internal/protocol/suntech_binary.go gateway/internal/protocol/suntech_binary_test.go
git commit -m "refactor: adapt SuntechBinaryParser to session-based interface"
```

---

### Task 4: Refactor TCP Server for Multi-Protocol

**Files:**
- Modify: `gateway/internal/server/tcp.go`
- Modify: `gateway/internal/server/tcp_test.go`

- [ ] **Step 1: Update PositionHandler to include protocol name**

In `gateway/internal/server/tcp.go`, update `PositionHandler`:

```go
type PositionHandler interface {
	HandlePosition(pos *protocol.Position, protocolName string)
}
```

- [ ] **Step 2: Rewrite handleConnection with peek/session flow**

Replace `handleConnection` and remove `readFrame`/`readBinaryFrame`:

```go
func (s *Server) handleConnection(conn net.Conn) {
	defer func() {
		conn.Close()
		s.activeConn.Add(-1)
		s.wg.Done()
	}()

	remoteAddr := conn.RemoteAddr().String()
	s.logger.Debug("new connection", "remote", remoteAddr)

	reader := bufio.NewReader(conn)

	// Peek to detect protocol
	peek, err := reader.Peek(4)
	if err != nil {
		s.logger.Debug("connection closed during peek", "remote", remoteAddr, "error", err)
		return
	}

	parser := s.registry.Find(peek)
	if parser == nil {
		s.logger.Warn("unknown protocol", "remote", remoteAddr, "data", fmt.Sprintf("%x", peek))
		return
	}

	s.logger.Debug("protocol detected", "remote", remoteAddr, "protocol", parser.Name())

	session := protocol.Session{Data: make(map[string]any)}

	for {
		select {
		case <-s.quit:
			return
		default:
		}

		conn.SetDeadline(time.Now().Add(s.config.IdleTimeout))

		frame, err := parser.ReadFrame(reader)
		if err != nil {
			if err != io.EOF {
				s.logger.Debug("connection closed", "remote", remoteAddr, "error", err)
			}
			return
		}

		if len(frame) == 0 {
			continue
		}

		pos, err := parser.Parse(frame, &session)
		if err != nil {
			s.logger.Warn("parse error", "protocol", parser.Name(), "error", err, "remote", remoteAddr)
			continue
		}

		if ack := parser.ACK(frame, &session); ack != nil {
			conn.Write(ack)
		}

		// nil position means non-data packet (login, heartbeat) — skip
		if pos == nil {
			continue
		}

		pos.RemoteAddr = remoteAddr

		// Use session IMEI if parser didn't set it on the position
		if pos.IMEI == "" && session.IMEI != "" {
			pos.IMEI = session.IMEI
		}

		s.handler.HandlePosition(pos, parser.Name())
	}
}
```

Remove the `readFrame` and `readBinaryFrame` functions entirely.

Remove the unused `"encoding/binary"` import.

- [ ] **Step 3: Update tcp_test.go mockHandler**

Update mock to match new interface:

```go
type mockHandler struct {
	positions    []*protocol.Position
	protocolName string
}

func (m *mockHandler) HandlePosition(pos *protocol.Position, protocolName string) {
	m.positions = append(m.positions, pos)
	m.protocolName = protocolName
}
```

- [ ] **Step 4: Run server tests**

Run: `cd gateway && go test -v ./internal/server/`
Expected: ALL PASS

- [ ] **Step 5: Update main.go HandlePosition**

In `gateway/cmd/gateway/main.go`, update `HandlePosition` on the `gateway` struct:

```go
func (g *gateway) HandlePosition(pos *protocol.Position, protocolName string) {
	g.metrics.PositionsReceived.Add(1)

	info, ok := g.writer.LookupDevice(pos.IMEI)
	if !ok {
		g.pending.Track(context.Background(), pos.IMEI, protocolName, pos.RemoteAddr)
		return
	}

	g.writer.Enqueue(pos)

	triggered := g.alertEngine.Evaluate(pos, info.DeviceID, info.TenantID)
	for _, alert := range triggered {
		g.metrics.AlertsTriggered.Add(1)
		g.saveAlert(alert)
	}
}
```

- [ ] **Step 6: Run all gateway tests**

Run: `cd gateway && go test -v ./...`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add gateway/internal/server/tcp.go gateway/internal/server/tcp_test.go gateway/cmd/gateway/main.go
git commit -m "refactor: multi-protocol TCP server with peek detection and per-connection sessions"
```

---

### Task 5: Add GT06 Protocol Enum to Database

**Files:**
- Create: `supabase/migrations/20260406_add_gt06_protocol.sql`

- [ ] **Step 1: Create migration**

```sql
-- Add GT06 protocol to the device_protocol enum
ALTER TYPE device_protocol ADD VALUE IF NOT EXISTS 'gt06';
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260406_add_gt06_protocol.sql
git commit -m "feat: add gt06 to device_protocol enum"
```

---

### Task 6: Implement GT06 Parser

**Files:**
- Create: `gateway/internal/protocol/gt06.go`
- Create: `gateway/internal/protocol/gt06_test.go`

- [ ] **Step 1: Write failing tests for GT06 Identify**

Create `gateway/internal/protocol/gt06_test.go`:

```go
package protocol

import (
	"testing"
)

func TestGT06Identify(t *testing.T) {
	p := NewGT06Parser()

	tests := []struct {
		name string
		data []byte
		want bool
	}{
		{"short packet header 0x7878", []byte{0x78, 0x78, 0x11, 0x01}, true},
		{"long packet header 0x7979", []byte{0x79, 0x79, 0x00, 0x11}, true},
		{"suntech ASCII", []byte("ST30"), false},
		{"suntech binary STX", []byte{0x02, 0x00, 0x32, 0x10}, false},
		{"too short", []byte{0x78}, false},
		{"empty", []byte{}, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := p.Identify(tt.data)
			if got != tt.want {
				t.Errorf("Identify() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestGT06Name(t *testing.T) {
	p := NewGT06Parser()
	if p.Name() != "gt06" {
		t.Errorf("Name() = %q, want %q", p.Name(), "gt06")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gateway && go test -v -run TestGT06 ./internal/protocol/`
Expected: FAIL — `NewGT06Parser` not defined

- [ ] **Step 3: Create gt06.go with struct, Name, Identify**

Create `gateway/internal/protocol/gt06.go`:

```go
package protocol

import (
	"bufio"
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"io"
	"time"
)

const (
	gt06StartShort = 0x7878
	gt06StartLong  = 0x7979
	gt06Stop       = 0x0D0A

	gt06Login     = 0x01
	gt06GPS       = 0x12
	gt06GPSLbs    = 0x22
	gt06Heartbeat = 0x13
	gt06Alarm     = 0x26
)

// GT06Parser decodes the GT06 (Concox) binary protocol used by GF07, GT02, GT06N, etc.
type GT06Parser struct{}

func NewGT06Parser() *GT06Parser {
	return &GT06Parser{}
}

func (p *GT06Parser) Name() string { return "gt06" }

func (p *GT06Parser) Identify(peek []byte) bool {
	if len(peek) < 2 {
		return false
	}
	start := binary.BigEndian.Uint16(peek[0:2])
	return start == gt06StartShort || start == gt06StartLong
}
```

- [ ] **Step 4: Run Identify/Name tests**

Run: `cd gateway && go test -v -run "TestGT06Identify|TestGT06Name" ./internal/protocol/`
Expected: PASS

- [ ] **Step 5: Write failing test for ReadFrame**

Add to `gateway/internal/protocol/gt06_test.go`:

```go
import (
	"bufio"
	"bytes"
	"encoding/hex"
	"testing"
)

func TestGT06ReadFrame(t *testing.T) {
	p := NewGT06Parser()

	t.Run("short packet", func(t *testing.T) {
		// Login packet: 78 78 0D 01 [8 bytes IMEI] [serial 2] [crc 2] 0D 0A
		data, _ := hex.DecodeString("78780D01035889905012781000050DD80D0A")
		reader := bufio.NewReader(bytes.NewReader(data))

		frame, err := p.ReadFrame(reader)
		if err != nil {
			t.Fatalf("ReadFrame error: %v", err)
		}
		if !bytes.Equal(frame, data) {
			t.Errorf("ReadFrame = %x, want %x", frame, data)
		}
	})

	t.Run("long packet", func(t *testing.T) {
		// 79 79 [2-byte length] [payload] [serial 2] [crc 2] 0D 0A
		data, _ := hex.DecodeString("7979000D01035889905012781000050DD80D0A")
		reader := bufio.NewReader(bytes.NewReader(data))

		frame, err := p.ReadFrame(reader)
		if err != nil {
			t.Fatalf("ReadFrame error: %v", err)
		}
		if !bytes.Equal(frame, data) {
			t.Errorf("ReadFrame = %x, want %x", frame, data)
		}
	})
}
```

- [ ] **Step 6: Run ReadFrame test to verify it fails**

Run: `cd gateway && go test -v -run TestGT06ReadFrame ./internal/protocol/`
Expected: FAIL — `ReadFrame` method not defined

- [ ] **Step 7: Implement ReadFrame**

Add to `gateway/internal/protocol/gt06.go`:

```go
// ReadFrame reads one GT06 packet from the stream.
// Short: 0x78 0x78 [1-byte len] [payload] [serial 2] [crc 2] 0x0D 0x0A
// Long:  0x79 0x79 [2-byte len] [payload] [serial 2] [crc 2] 0x0D 0x0A
func (p *GT06Parser) ReadFrame(reader *bufio.Reader) ([]byte, error) {
	// Read start bytes
	startBytes := make([]byte, 2)
	if _, err := io.ReadFull(reader, startBytes); err != nil {
		return nil, err
	}

	start := binary.BigEndian.Uint16(startBytes)

	var contentLen int
	var lenBytes []byte

	switch start {
	case gt06StartShort:
		// 1-byte length (includes protocol number + data + serial, NOT crc or stop)
		lb := make([]byte, 1)
		if _, err := io.ReadFull(reader, lb); err != nil {
			return nil, fmt.Errorf("gt06: read length: %w", err)
		}
		lenBytes = lb
		contentLen = int(lb[0])
	case gt06StartLong:
		// 2-byte length
		lb := make([]byte, 2)
		if _, err := io.ReadFull(reader, lb); err != nil {
			return nil, fmt.Errorf("gt06: read length: %w", err)
		}
		lenBytes = lb
		contentLen = int(binary.BigEndian.Uint16(lb))
	default:
		return nil, fmt.Errorf("gt06: invalid start bytes 0x%04x", start)
	}

	if contentLen <= 0 || contentLen > 4096 {
		return nil, fmt.Errorf("gt06: invalid content length %d", contentLen)
	}

	// Read content + CRC(2) + stop(2)
	tail := make([]byte, contentLen+4)
	if _, err := io.ReadFull(reader, tail); err != nil {
		return nil, fmt.Errorf("gt06: read payload: %w", err)
	}

	// Assemble full frame
	frame := make([]byte, 0, 2+len(lenBytes)+len(tail))
	frame = append(frame, startBytes...)
	frame = append(frame, lenBytes...)
	frame = append(frame, tail...)

	return frame, nil
}
```

- [ ] **Step 8: Run ReadFrame test**

Run: `cd gateway && go test -v -run TestGT06ReadFrame ./internal/protocol/`
Expected: PASS

- [ ] **Step 9: Write failing test for Parse login packet**

Add to `gateway/internal/protocol/gt06_test.go`:

```go
func TestGT06ParseLogin(t *testing.T) {
	p := NewGT06Parser()
	session := &Session{Data: make(map[string]any)}

	// Login packet: 78 78 0D 01 [IMEI 8 bytes BCD] [serial 2] [crc 2] 0D 0A
	// IMEI: 0358899050127810 → "358899050127810"
	data, _ := hex.DecodeString("78780D01035889905012781000050DD80D0A")

	pos, err := p.Parse(data, session)
	if err != nil {
		t.Fatalf("Parse login error: %v", err)
	}
	if pos != nil {
		t.Error("login packet should return nil position")
	}
	if session.IMEI != "358899050127810" {
		t.Errorf("session.IMEI = %q, want %q", session.IMEI, "358899050127810")
	}
}
```

- [ ] **Step 10: Run Parse login test to verify it fails**

Run: `cd gateway && go test -v -run TestGT06ParseLogin ./internal/protocol/`
Expected: FAIL — `Parse` method not defined

- [ ] **Step 11: Implement Parse**

Add to `gateway/internal/protocol/gt06.go`:

```go
// Parse decodes a GT06 frame. Returns (nil, nil) for login/heartbeat packets.
func (p *GT06Parser) Parse(data []byte, session *Session) (*Position, error) {
	if len(data) < 5 {
		return nil, fmt.Errorf("gt06: frame too short (%d bytes)", len(data))
	}

	// Determine header size and get content
	var headerSize int
	start := binary.BigEndian.Uint16(data[0:2])
	switch start {
	case gt06StartShort:
		headerSize = 3 // start(2) + len(1)
	case gt06StartLong:
		headerSize = 4 // start(2) + len(2)
	default:
		return nil, fmt.Errorf("gt06: invalid start 0x%04x", start)
	}

	content := data[headerSize : len(data)-4] // strip start+len and crc+stop
	if len(content) < 1 {
		return nil, fmt.Errorf("gt06: empty content")
	}

	protocolNum := content[0]
	payload := content[1 : len(content)-2] // strip protocol number and serial

	switch protocolNum {
	case gt06Login:
		return p.parseLogin(payload, session)
	case gt06GPS:
		return p.parseGPS(payload, session)
	case gt06GPSLbs:
		return p.parseGPSLbs(payload, session)
	case gt06Heartbeat:
		return nil, nil
	case gt06Alarm:
		return p.parseGPS(payload, session) // alarm has same GPS format
	default:
		return nil, nil // unknown packet types are silently skipped
	}
}

func (p *GT06Parser) parseLogin(payload []byte, session *Session) (*Position, error) {
	if len(payload) < 8 {
		return nil, fmt.Errorf("gt06: login payload too short (%d bytes)", len(payload))
	}

	// IMEI: 8 bytes BCD → 16 hex chars, first char is padding 0
	imeiHex := hex.EncodeToString(payload[0:8])
	// Strip leading zero padding
	session.IMEI = imeiHex[1:]

	return nil, nil
}

func (p *GT06Parser) parseGPS(payload []byte, session *Session) (*Position, error) {
	if len(payload) < 12 {
		return nil, fmt.Errorf("gt06: GPS payload too short (%d bytes)", len(payload))
	}

	// DateTime: 6 bytes at offset 0-5 (YY MM DD HH MM SS)
	year := 2000 + int(payload[0])
	month := int(payload[1])
	day := int(payload[2])
	hour := int(payload[3])
	minute := int(payload[4])
	sec := int(payload[5])
	deviceTime := time.Date(year, time.Month(month), day, hour, minute, sec, 0, time.UTC)

	// Satellites + length nibbles at offset 6
	sats := int(payload[6] >> 4)

	// Latitude: 4 bytes at offset 7-10 (uint32, unit: 1/30000 minute)
	latRaw := binary.BigEndian.Uint32(payload[7:11])
	lat := float64(latRaw) / 30000.0 / 60.0

	// Longitude: 4 bytes at offset 11-14 (uint32, unit: 1/30000 minute)
	lonRaw := binary.BigEndian.Uint32(payload[11:15])
	lon := float64(lonRaw) / 30000.0 / 60.0

	// Speed: 1 byte at offset 15 (km/h)
	speed := float64(payload[15])

	// Course/Status: 2 bytes at offset 16-17
	courseStatus := binary.BigEndian.Uint16(payload[16:18])
	heading := float64(courseStatus & 0x03FF) // bits 0-9: course

	// Bit 10: 0=east, 1=west
	if courseStatus&0x0400 != 0 {
		lon = -lon
	}
	// Bit 11: 0=north, 1=south
	if courseStatus&0x0800 != 0 {
		lat = -lat
	}

	return &Position{
		IMEI:       session.IMEI,
		Latitude:   lat,
		Longitude:  lon,
		Speed:      speed,
		Heading:    heading,
		Satellites: sats,
		DeviceTime: deviceTime,
		RawData:    hex.EncodeToString(payload),
	}, nil
}

func (p *GT06Parser) parseGPSLbs(payload []byte, session *Session) (*Position, error) {
	// GPS+LBS packet: GPS data is at the beginning, same format
	return p.parseGPS(payload, session)
}
```

- [ ] **Step 12: Run Parse login test**

Run: `cd gateway && go test -v -run TestGT06ParseLogin ./internal/protocol/`
Expected: PASS

- [ ] **Step 13: Write test for Parse GPS data packet**

Add to `gateway/internal/protocol/gt06_test.go`:

```go
func TestGT06ParseGPS(t *testing.T) {
	p := NewGT06Parser()
	session := &Session{IMEI: "358899050127810", Data: make(map[string]any)}

	// GPS packet (protocol 0x12):
	// 78 78 [len] 12 [datetime 6] [sats+len 1] [lat 4] [lon 4] [speed 1] [course 2] [serial 2] [crc 2] 0D 0A
	// DateTime: 2026-03-18 10:30:00 → 1A 03 12 0A 1E 00
	// Sats: 8 → high nibble 0x80
	// Lat: -23.5505 → 23.5505 * 60 * 30000 = 42390900 = 0x02871A14
	// Lon: -46.6333 → 46.6333 * 60 * 30000 = 83939940 = 0x050109A4
	// Speed: 45 km/h → 0x2D
	// Course: south+west+127° → 0x0C7F (bit11=south, bit10=west, course=127)
	data, _ := hex.DecodeString("78781F121A03120A1E008002871A14050109A42D0C7F00010001ABCD0D0A")

	pos, err := p.Parse(data, session)
	if err != nil {
		t.Fatalf("Parse GPS error: %v", err)
	}
	if pos == nil {
		t.Fatal("GPS packet should return a position")
	}
	if pos.IMEI != "358899050127810" {
		t.Errorf("IMEI = %q, want %q", pos.IMEI, "358899050127810")
	}
	if pos.Latitude > -23.0 || pos.Latitude < -24.0 {
		t.Errorf("Latitude = %f, expected ~-23.55", pos.Latitude)
	}
	if pos.Longitude > -46.0 || pos.Longitude < -47.0 {
		t.Errorf("Longitude = %f, expected ~-46.63", pos.Longitude)
	}
	if pos.Speed != 45 {
		t.Errorf("Speed = %f, want 45", pos.Speed)
	}
	if pos.DeviceTime.Year() != 2026 || pos.DeviceTime.Month() != 3 || pos.DeviceTime.Day() != 18 {
		t.Errorf("DeviceTime = %v, expected 2026-03-18", pos.DeviceTime)
	}
}

func TestGT06ParseHeartbeat(t *testing.T) {
	p := NewGT06Parser()
	session := &Session{IMEI: "358899050127810", Data: make(map[string]any)}

	// Heartbeat: 78 78 0A 13 [status info 5 bytes] [serial 2] [crc 2] 0D 0A
	data, _ := hex.DecodeString("78780A134005004200010008ABCD0D0A")

	pos, err := p.Parse(data, session)
	if err != nil {
		t.Fatalf("Parse heartbeat error: %v", err)
	}
	if pos != nil {
		t.Error("heartbeat should return nil position")
	}
}
```

- [ ] **Step 14: Run GPS and heartbeat tests**

Run: `cd gateway && go test -v -run "TestGT06ParseGPS|TestGT06ParseHeartbeat" ./internal/protocol/`
Expected: PASS

- [ ] **Step 15: Write test for ACK**

Add to `gateway/internal/protocol/gt06_test.go`:

```go
func TestGT06ACK(t *testing.T) {
	p := NewGT06Parser()
	session := &Session{Data: make(map[string]any)}

	t.Run("login ACK", func(t *testing.T) {
		data, _ := hex.DecodeString("78780D01035889905012781000050DD80D0A")
		ack := p.ACK(data, session)
		if ack == nil {
			t.Fatal("login should produce ACK")
		}
		// ACK format: 78 78 05 01 [serial 2] [crc 2] 0D 0A
		if len(ack) != 10 {
			t.Errorf("ACK length = %d, want 10", len(ack))
		}
		if ack[0] != 0x78 || ack[1] != 0x78 {
			t.Errorf("ACK start = %x, want 7878", ack[0:2])
		}
		if ack[3] != 0x01 {
			t.Errorf("ACK protocol = 0x%02x, want 0x01 (login)", ack[3])
		}
	})

	t.Run("heartbeat ACK", func(t *testing.T) {
		data, _ := hex.DecodeString("78780A134005004200010008ABCD0D0A")
		ack := p.ACK(data, session)
		if ack == nil {
			t.Fatal("heartbeat should produce ACK")
		}
		if ack[3] != 0x13 {
			t.Errorf("ACK protocol = 0x%02x, want 0x13 (heartbeat)", ack[3])
		}
	})

	t.Run("GPS no ACK", func(t *testing.T) {
		data, _ := hex.DecodeString("78781F121A03120A1E008002871A14050109A42D0C7F00010001ABCD0D0A")
		ack := p.ACK(data, session)
		if ack != nil {
			t.Error("GPS data should not produce ACK")
		}
	})
}
```

- [ ] **Step 16: Implement ACK with CRC-ITU**

Add to `gateway/internal/protocol/gt06.go`:

```go
// ACK returns an acknowledgment for login and heartbeat packets, nil for others.
func (p *GT06Parser) ACK(data []byte, session *Session) []byte {
	if len(data) < 5 {
		return nil
	}

	var headerSize int
	start := binary.BigEndian.Uint16(data[0:2])
	switch start {
	case gt06StartShort:
		headerSize = 3
	case gt06StartLong:
		headerSize = 4
	default:
		return nil
	}

	content := data[headerSize : len(data)-4]
	if len(content) < 3 {
		return nil
	}

	protocolNum := content[0]
	serial := content[len(content)-2:]

	// Only ACK login and heartbeat
	switch protocolNum {
	case gt06Login, gt06Heartbeat:
		// ACK: 78 78 05 [protocol] [serial 2] [crc 2] 0D 0A
		ack := make([]byte, 10)
		ack[0] = 0x78
		ack[1] = 0x78
		ack[2] = 0x05 // length
		ack[3] = protocolNum
		ack[4] = serial[0]
		ack[5] = serial[1]
		crc := crcITU(ack[2:6])
		ack[6] = byte(crc >> 8)
		ack[7] = byte(crc & 0xFF)
		ack[8] = 0x0D
		ack[9] = 0x0A
		return ack
	default:
		return nil
	}
}

// crcITU calculates CRC-ITU (CRC-CCITT with X.25 final XOR) for GT06 protocol.
func crcITU(data []byte) uint16 {
	crc := uint16(0xFFFF)
	for _, b := range data {
		crc ^= uint16(b)
		for i := 0; i < 8; i++ {
			if crc&0x0001 != 0 {
				crc = (crc >> 1) ^ 0x8408
			} else {
				crc >>= 1
			}
		}
	}
	return crc ^ 0xFFFF
}
```

- [ ] **Step 17: Run all GT06 tests**

Run: `cd gateway && go test -v -run TestGT06 ./internal/protocol/`
Expected: ALL PASS

- [ ] **Step 18: Commit**

```bash
git add gateway/internal/protocol/gt06.go gateway/internal/protocol/gt06_test.go
git commit -m "feat: implement GT06 protocol parser for GF07/GT02/GT06N devices"
```

---

### Task 7: Register GT06 Parser and Run Full Test Suite

**Files:**
- Modify: `gateway/cmd/gateway/main.go`

- [ ] **Step 1: Add GT06 to registry**

In `gateway/cmd/gateway/main.go`, update the registry line:

```go
registry := protocol.NewRegistry(protocol.NewSuntechBinaryParser(), protocol.NewSuntechParser(), protocol.NewGT06Parser())
```

- [ ] **Step 2: Run all gateway tests**

Run: `cd gateway && go test -v ./...`
Expected: ALL PASS

- [ ] **Step 3: Build gateway**

Run: `cd gateway && go build ./cmd/gateway/`
Expected: SUCCESS (no errors)

- [ ] **Step 4: Commit**

```bash
git add gateway/cmd/gateway/main.go
git commit -m "feat: register GT06 parser in gateway startup"
```

---

### Task 8: Integration Test — GT06 Connection Flow

**Files:**
- Modify: `gateway/internal/server/tcp_test.go`

- [ ] **Step 1: Write GT06 integration test**

Add to `gateway/internal/server/tcp_test.go`:

```go
func TestTCPServer_GT06LoginAndGPS(t *testing.T) {
	handler := &mockHandler{}
	registry := protocol.NewRegistry(protocol.NewGT06Parser(), protocol.NewSuntechParser())

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

	// Send login packet
	login, _ := hex.DecodeString("78780D01035889905012781000050DD80D0A")
	conn.Write(login)
	time.Sleep(200 * time.Millisecond)

	// Should receive ACK for login
	ackBuf := make([]byte, 64)
	conn.SetReadDeadline(time.Now().Add(time.Second))
	n, err := conn.Read(ackBuf)
	if err != nil {
		t.Fatalf("failed to read login ACK: %v", err)
	}
	if n < 10 {
		t.Fatalf("login ACK too short: %d bytes", n)
	}
	if ackBuf[3] != 0x01 {
		t.Errorf("ACK protocol = 0x%02x, want 0x01", ackBuf[3])
	}

	// No position yet (login has no GPS data)
	if len(handler.positions) != 0 {
		t.Errorf("expected 0 positions after login, got %d", len(handler.positions))
	}

	// Send GPS packet
	gps, _ := hex.DecodeString("78781F121A03120A1E008002871A14050109A42D0C7F00010001ABCD0D0A")
	conn.Write(gps)
	time.Sleep(200 * time.Millisecond)

	// Should have 1 position with IMEI from login session
	if len(handler.positions) != 1 {
		t.Fatalf("expected 1 position after GPS, got %d", len(handler.positions))
	}
	if handler.positions[0].IMEI != "358899050127810" {
		t.Errorf("IMEI = %q, want %q", handler.positions[0].IMEI, "358899050127810")
	}
	if handler.protocolName != "gt06" {
		t.Errorf("protocolName = %q, want %q", handler.protocolName, "gt06")
	}
}
```

Add `"encoding/hex"` to the imports.

- [ ] **Step 2: Run integration test**

Run: `cd gateway && go test -v -run TestTCPServer_GT06 ./internal/server/`
Expected: PASS

- [ ] **Step 3: Run all tests one final time**

Run: `cd gateway && go test -v ./...`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add gateway/internal/server/tcp_test.go
git commit -m "test: add GT06 login+GPS integration test"
```
