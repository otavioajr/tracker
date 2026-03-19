package server

import (
	"fmt"
	"net"
	"testing"
	"time"

	"github.com/otavioajr/tracker/gateway/internal/protocol"
)

type mockHandler struct {
	positions []*protocol.Position
}

func (m *mockHandler) HandlePosition(pos *protocol.Position) {
	m.positions = append(m.positions, pos)
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
