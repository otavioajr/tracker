package server

import (
	"encoding/hex"
	"fmt"
	"math"
	"net"
	"sync"
	"testing"
	"time"

	"github.com/otavioajr/tracker/gateway/internal/protocol"
)

type mockHandler struct {
	mu               sync.Mutex
	positions        []*protocol.Position
	families         []string
	variants         []string
	unknownFrames    []UnknownFrame
	protocolFailures []ProtocolFailure
}

func (m *mockHandler) HandlePosition(pos *protocol.Position, family, variant string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.positions = append(m.positions, pos)
	m.families = append(m.families, family)
	m.variants = append(m.variants, variant)
}

func (m *mockHandler) HandleUnknownFrame(frame UnknownFrame) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.unknownFrames = append(m.unknownFrames, frame)
}

func (m *mockHandler) HandleProtocolFailure(failure ProtocolFailure) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.protocolFailures = append(m.protocolFailures, failure)
}

func (m *mockHandler) positionsSnapshot() []*protocol.Position {
	m.mu.Lock()
	defer m.mu.Unlock()
	cp := append([]*protocol.Position(nil), m.positions...)
	return cp
}

func (m *mockHandler) familySnapshot() string {
	m.mu.Lock()
	defer m.mu.Unlock()
	if len(m.families) == 0 {
		return ""
	}
	return m.families[len(m.families)-1]
}

func (m *mockHandler) variantSnapshot() string {
	m.mu.Lock()
	defer m.mu.Unlock()
	if len(m.variants) == 0 {
		return ""
	}
	return m.variants[len(m.variants)-1]
}

func (m *mockHandler) unknownSnapshot() []UnknownFrame {
	m.mu.Lock()
	defer m.mu.Unlock()
	cp := append([]UnknownFrame(nil), m.unknownFrames...)
	return cp
}

func (m *mockHandler) failureSnapshot() []ProtocolFailure {
	m.mu.Lock()
	defer m.mu.Unlock()
	cp := append([]ProtocolFailure(nil), m.protocolFailures...)
	return cp
}

func startTestServer(t *testing.T, handler *mockHandler, registry *protocol.Registry) *Server {
	srv := New(Config{
		Port:        0,
		ReadTimeout: 5 * time.Second,
		IdleTimeout: 10 * time.Second,
	}, registry, protocol.NewDefaultDetector(), handler)

	go srv.Start()

	waitFor(t, 2*time.Second, func() bool {
		return srv.Addr() != ""
	})

	t.Cleanup(srv.Stop)
	return srv
}

func waitFor(t *testing.T, timeout time.Duration, predicate func() bool) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if predicate() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for condition")
}

func TestTCPServer_AcceptsConnection(t *testing.T) {
	handler := &mockHandler{}
	registry := protocol.NewRegistry(protocol.NewSuntechParser())
	srv := startTestServer(t, handler, registry)

	conn, err := net.Dial("tcp", srv.Addr())
	if err != nil {
		t.Fatalf("failed to connect: %v", err)
	}
	defer conn.Close()

	msg := "ST300STT;123456789012345;04;374;20260318;10:30:00;0CD4A;-23.550520;-046.633308;045.500;127.30;11;1;1;12.24\r\n"
	_, err = conn.Write([]byte(msg))
	if err != nil {
		t.Fatalf("failed to write: %v", err)
	}

	waitFor(t, 2*time.Second, func() bool {
		return len(handler.positionsSnapshot()) == 1
	})

	positions := handler.positionsSnapshot()
	if positions[0].IMEI != "123456789012345" {
		t.Fatalf("IMEI = %q, want %q", positions[0].IMEI, "123456789012345")
	}
	if got := handler.familySnapshot(); got != "suntech" {
		t.Fatalf("family = %q, want %q", got, "suntech")
	}
	if got := handler.variantSnapshot(); got != "st300_ascii" {
		t.Fatalf("variant = %q, want %q", got, "st300_ascii")
	}
}

func TestTCPServer_AcceptsCompactSTT(t *testing.T) {
	handler := &mockHandler{}
	registry := protocol.NewRegistry(protocol.NewSuntechParser())
	srv := startTestServer(t, handler, registry)

	conn, err := net.Dial("tcp", srv.Addr())
	if err != nil {
		t.Fatalf("failed to connect: %v", err)
	}
	defer conn.Close()

	msg := "STT;1910006088;FFFFFF;191;1.0.14;0;20260410;11:22:16;0C3F4D15;724;10;E93F;54;-23.616218;-46.737257;0.00;0.00;16;1;00000000;00000000;0;1;0057;;0083800F;4.0;12.41;;;;;;\r\n"
	_, err = conn.Write([]byte(msg))
	if err != nil {
		t.Fatalf("failed to write: %v", err)
	}

	waitFor(t, 2*time.Second, func() bool {
		return len(handler.positionsSnapshot()) == 1
	})

	positions := handler.positionsSnapshot()
	if positions[0].IMEI != "1910006088" {
		t.Fatalf("IMEI = %q, want %q", positions[0].IMEI, "1910006088")
	}
	if got := handler.familySnapshot(); got != "suntech" {
		t.Fatalf("family = %q, want %q", got, "suntech")
	}
	if got := handler.variantSnapshot(); got != "stt_compact_ascii" {
		t.Fatalf("variant = %q, want %q", got, "stt_compact_ascii")
	}
}

func TestTCPServer_PassesAllPositions(t *testing.T) {
	handler := &mockHandler{}
	registry := protocol.NewRegistry(protocol.NewSuntechParser())
	srv := startTestServer(t, handler, registry)

	conn, err := net.Dial("tcp", srv.Addr())
	if err != nil {
		t.Fatalf("failed to connect: %v", err)
	}
	defer conn.Close()

	msg := "ST300STT;999999999999999;04;374;20260318;10:30:00;0CD4A;-23.55;-046.63;0;0;11;1;0;12.24\r\n"
	conn.Write([]byte(msg))

	waitFor(t, 2*time.Second, func() bool {
		return len(handler.positionsSnapshot()) == 1
	})
}

func TestTCPServer_MultipleMessages(t *testing.T) {
	handler := &mockHandler{}
	registry := protocol.NewRegistry(protocol.NewSuntechParser())
	srv := startTestServer(t, handler, registry)

	conn, err := net.Dial("tcp", srv.Addr())
	if err != nil {
		t.Fatalf("failed to connect: %v", err)
	}
	defer conn.Close()

	for i := 0; i < 3; i++ {
		msg := fmt.Sprintf("ST300STT;123456789012345;04;374;20260318;10:%02d:00;0CD4A;-23.55;-046.63;%03d.0;0;11;1;0;12.24\r\n", i, i*10)
		conn.Write([]byte(msg))
	}

	waitFor(t, 2*time.Second, func() bool {
		return len(handler.positionsSnapshot()) == 3
	})
}

func TestTCPServer_GT06LoginAndGPS(t *testing.T) {
	handler := &mockHandler{}
	registry := protocol.NewRegistry(protocol.NewGT06Parser(), protocol.NewSuntechParser())

	srv := startTestServer(t, handler, registry)

	conn, err := net.Dial("tcp", srv.Addr())
	if err != nil {
		t.Fatalf("failed to connect: %v", err)
	}
	defer conn.Close()

	// Send login packet (IMEI: 358899050127810).
	login, _ := hex.DecodeString("78780D01035889905012781000050DD80D0A")
	conn.Write(login)

	waitFor(t, 2*time.Second, func() bool {
		// Ensure no position has been emitted after login yet.
		return len(handler.positionsSnapshot()) == 0
	})

	// Should receive ACK for login.
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
		t.Fatalf("ACK protocol = 0x%02x, want 0x01", ackBuf[3])
	}

	// Send GPS packet (protocol 0x12) — same test vector from gt06_test.go
	// Position: lat -23.5505, lon -46.6333, speed 45, heading 127, 8 sats
	gps, _ := hex.DecodeString("787817121A03120A1E00800286D5740500D2642D0C7F0001AAAA0D0A")
	conn.Write(gps)

	waitFor(t, 2*time.Second, func() bool {
		return len(handler.positionsSnapshot()) == 1
	})

	pos := handler.positionsSnapshot()[0]
	if pos.IMEI != "358899050127810" {
		t.Fatalf("IMEI = %q, want %q", pos.IMEI, "358899050127810")
	}
	if handler.familySnapshot() != "gt06" {
		t.Fatalf("family = %q, want %q", handler.familySnapshot(), "gt06")
	}
	if handler.variantSnapshot() != "gt06_binary" {
		t.Fatalf("variant = %q, want %q", handler.variantSnapshot(), "gt06_binary")
	}
	if math.Abs(pos.Latitude-(-23.5505)) > 0.001 {
		t.Fatalf("Latitude = %f, want ~-23.5505", pos.Latitude)
	}
	if math.Abs(pos.Longitude-(-46.6333)) > 0.001 {
		t.Fatalf("Longitude = %f, want ~-46.6333", pos.Longitude)
	}
	if pos.Speed != 45 {
		t.Fatalf("Speed = %f, want 45", pos.Speed)
	}
	if pos.Heading != 127 {
		t.Fatalf("Heading = %f, want 127", pos.Heading)
	}
}

func TestTCPServer_UnknownFrame(t *testing.T) {
	handler := &mockHandler{}
	registry := protocol.NewRegistry(protocol.NewSuntechParser(), protocol.NewGT06Parser())
	srv := startTestServer(t, handler, registry)

	conn, err := net.Dial("tcp", srv.Addr())
	if err != nil {
		t.Fatalf("failed to connect: %v", err)
	}
	defer conn.Close()

	_, err = conn.Write([]byte("GET / HTTP/1.1\r\n"))
	if err != nil {
		t.Fatalf("failed to write: %v", err)
	}

	waitFor(t, 2*time.Second, func() bool {
		return len(handler.unknownSnapshot()) == 1
	})
	unknown := handler.unknownSnapshot()
	if len(unknown) != 1 {
		t.Fatalf("unknown frame count = %d, want 1", len(unknown))
	}
	if got := unknown[0].Transport; got != "tcp" {
		t.Fatalf("transport = %q, want %q", got, "tcp")
	}
	if got := unknown[0].RawPayload; got != "GET / HTTP/1.1" {
		t.Fatalf("raw payload = %q, want %q", got, "GET / HTTP/1.1")
	}
	if got := unknown[0].RawPreview; got != "GET / HTTP/1.1" {
		t.Fatalf("raw preview = %q, want %q", got, "GET / HTTP/1.1")
	}
}

func TestTCPServer_ProtocolFailure(t *testing.T) {
	handler := &mockHandler{}
	registry := protocol.NewRegistry(protocol.NewSuntechParser())
	srv := startTestServer(t, handler, registry)

	conn, err := net.Dial("tcp", srv.Addr())
	if err != nil {
		t.Fatalf("failed to connect: %v", err)
	}
	defer conn.Close()

	// Invalid latitude field to force parser failure.
	msg := "ST300STT;123456789012345;04;374;20260318;10:30:00;0CD4A;LAT;-046.633308;045.500;127.30;11;1;1;12.24\r\n"
	conn.Write([]byte(msg))

	waitFor(t, 2*time.Second, func() bool {
		return len(handler.failureSnapshot()) == 1
	})

	failures := handler.failureSnapshot()
	if failures[0].Family != "suntech" {
		t.Fatalf("family = %q, want %q", failures[0].Family, "suntech")
	}
	if failures[0].Variant != "st300_ascii" {
		t.Fatalf("variant = %q, want %q", failures[0].Variant, "st300_ascii")
	}
	if failures[0].ErrorCode == "" {
		t.Fatalf("expected non-empty error code")
	}
}

func TestTCPServer_ProtocolFailure_InvalidDatetime(t *testing.T) {
	handler := &mockHandler{}
	registry := protocol.NewRegistry(protocol.NewSuntechParser())
	srv := startTestServer(t, handler, registry)

	conn, err := net.Dial("tcp", srv.Addr())
	if err != nil {
		t.Fatalf("failed to connect: %v", err)
	}
	defer conn.Close()

	msg := "STT;1910006088;FFFFFF;191;1.0.14;0;20260499;11:22:16;0C3F4D15;724;10;E93F;54;-23.616218;-46.737257;0.00;0.00;16;1;00000000;00000000;0;1;0057;;0083800F;4.0;12.41;;;;;;\r\n"
	conn.Write([]byte(msg))

	waitFor(t, 2*time.Second, func() bool {
		return len(handler.failureSnapshot()) == 1
	})

	failures := handler.failureSnapshot()
	if len(failures) != 1 {
		t.Fatalf("protocol failure count = %d, want 1", len(failures))
	}
	if got := failures[0].Family; got != "suntech" {
		t.Fatalf("family = %q, want %q", got, "suntech")
	}
	if got := failures[0].Variant; got != "stt_compact_ascii" {
		t.Fatalf("variant = %q, want %q", got, "stt_compact_ascii")
	}
	if got := failures[0].ErrorCode; got != "invalid_datetime" {
		t.Fatalf("error_code = %q, want %q", got, "invalid_datetime")
	}
	if failures[0].RawPayload == "" {
		t.Fatal("expected raw payload for protocol failure")
	}
	if failures[0].RawPayload != "STT;1910006088;FFFFFF;191;1.0.14;0;20260499;11:22:16;0C3F4D15;724;10;E93F;54;-23.616218;-46.737257;0.00;0.00;16;1;00000000;00000000;0;1;0057;;0083800F;4.0;12.41;;;;;;" {
		t.Fatalf("unexpected raw payload = %q", failures[0].RawPayload)
	}
}
