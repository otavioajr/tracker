package server

import (
	"encoding/hex"
	"fmt"
	"math"
	"net"
	"testing"
	"time"

	"github.com/otavioajr/tracker/gateway/internal/protocol"
)

type mockHandler struct {
	positions    []*protocol.Position
	protocolName string
}

func (m *mockHandler) HandlePosition(pos *protocol.Position, protocolName string) {
	m.positions = append(m.positions, pos)
	m.protocolName = protocolName
}

func TestTCPServer_AcceptsConnection(t *testing.T) {
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
	addr := srv.Addr()

	conn, err := net.Dial("tcp", addr)
	if err != nil {
		t.Fatalf("failed to connect: %v", err)
	}
	defer conn.Close()

	msg := "ST300STT;123456789012345;04;374;20260318;10:30:00;0CD4A;-23.550520;-046.633308;045.500;127.30;11;1;1;12.24\r\n"
	_, err = conn.Write([]byte(msg))
	if err != nil {
		t.Fatalf("failed to write: %v", err)
	}

	time.Sleep(200 * time.Millisecond)

	if len(handler.positions) != 1 {
		t.Fatalf("expected 1 position, got %d", len(handler.positions))
	}
	if handler.positions[0].IMEI != "123456789012345" {
		t.Errorf("IMEI = %q, want %q", handler.positions[0].IMEI, "123456789012345")
	}
}

func TestTCPServer_PassesAllPositions(t *testing.T) {
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

	msg := "ST300STT;999999999999999;04;374;20260318;10:30:00;0CD4A;-23.55;-046.63;0;0;11;1;0;12.24\r\n"
	conn.Write([]byte(msg))
	time.Sleep(200 * time.Millisecond)

	if len(handler.positions) != 1 {
		t.Errorf("expected 1 position (all pass through), got %d", len(handler.positions))
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

	// Send login packet (IMEI: 358899050127810)
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
	// ACK protocol number should be 0x01 (login)
	if ackBuf[3] != 0x01 {
		t.Errorf("ACK protocol = 0x%02x, want 0x01", ackBuf[3])
	}

	// No position yet (login has no GPS data)
	if len(handler.positions) != 0 {
		t.Errorf("expected 0 positions after login, got %d", len(handler.positions))
	}

	// Send GPS packet (protocol 0x12) — same test vector from gt06_test.go
	// Position: lat -23.5505, lon -46.6333, speed 45, heading 127, 8 sats
	gps, _ := hex.DecodeString("787817121A03120A1E00800286D5740500D2642D0C7F0001AAAA0D0A")
	conn.Write(gps)
	time.Sleep(200 * time.Millisecond)

	// Verify position was received
	if len(handler.positions) != 1 {
		t.Fatalf("expected 1 position after GPS packet, got %d", len(handler.positions))
	}

	pos := handler.positions[0]

	// IMEI comes from session (set during login)
	if pos.IMEI != "358899050127810" {
		t.Errorf("IMEI = %q, want %q", pos.IMEI, "358899050127810")
	}

	// Protocol name
	if handler.protocolName != "gt06" {
		t.Errorf("protocolName = %q, want %q", handler.protocolName, "gt06")
	}

	// Latitude: -23.5505 (south)
	if math.Abs(pos.Latitude-(-23.5505)) > 0.001 {
		t.Errorf("Latitude = %f, want ~-23.5505", pos.Latitude)
	}

	// Longitude: -46.6333 (west)
	if math.Abs(pos.Longitude-(-46.6333)) > 0.001 {
		t.Errorf("Longitude = %f, want ~-46.6333", pos.Longitude)
	}

	// Speed
	if pos.Speed != 45 {
		t.Errorf("Speed = %f, want 45", pos.Speed)
	}

	// Heading
	if pos.Heading != 127 {
		t.Errorf("Heading = %f, want 127", pos.Heading)
	}
}
