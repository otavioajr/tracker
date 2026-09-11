package server

import (
	"bufio"
	"bytes"
	"encoding/hex"
	"errors"
	"io"
	"net"
	"sync"
	"testing"
	"time"

	"github.com/otavioajr/tracker/gateway/internal/protocol"
)

func TestCommandDeliveredAfterGT06LoginACK(t *testing.T) {
	srv := startTestServer(t, &mockHandler{}, protocol.NewRegistry(protocol.NewGT06Parser()))
	if err := srv.EnqueueCommand("358899050127810", "STATUS#"); err != nil {
		t.Fatal(err)
	}
	conn, err := net.Dial("tcp", srv.Addr())
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	conn.SetDeadline(time.Now().Add(time.Second))
	login, _ := hex.DecodeString("78780D01035889905012781000050DD80D0A")
	if _, err := conn.Write(login); err != nil {
		t.Fatal(err)
	}
	reader := bufio.NewReader(conn)
	parser := protocol.NewGT06Parser()
	ack, err := parser.ReadFrame(reader)
	if err != nil || ack[3] != 1 {
		t.Fatalf("ACK missing: %x, %v", ack, err)
	}
	frame, err := parser.ReadFrame(reader)
	want, _ := protocol.BuildOnlineCommand(1, "STATUS#")
	if err != nil || !bytes.Equal(frame, want) {
		t.Fatalf("command mismatch: %x, %v", frame, err)
	}
	conn.Write(login)
	if _, err := parser.ReadFrame(reader); err != nil {
		t.Fatal(err)
	}
	conn.SetReadDeadline(time.Now().Add(30 * time.Millisecond))
	if _, err := reader.ReadByte(); err == nil {
		t.Fatal("duplicate command")
	}
}

func TestGT06CommandNeverSentToSuntech(t *testing.T) {
	handler := &mockHandler{}
	srv := startTestServer(t, handler, protocol.NewRegistry(protocol.NewSuntechParser()))
	if err := srv.EnqueueCommand("358899050127810", "STATUS#"); err != nil {
		t.Fatal(err)
	}
	conn, err := net.Dial("tcp", srv.Addr())
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	_, err = conn.Write([]byte("ST300STT;358899050127810;04;374;20260909;10:30:00;0CD4A;-23.55;-046.63;0;0;11;1;1;12.24\r"))
	if err != nil {
		t.Fatal(err)
	}
	waitFor(t, time.Second, func() bool { return len(handler.positionsSnapshot()) == 1 })
	srv.commandMu.Lock()
	remaining := len(srv.commands["358899050127810"])
	srv.commandMu.Unlock()
	if remaining != 1 {
		t.Fatal("GT06 command consumed by a Suntech connection")
	}
}

func TestCommandQueueBoundsExpiryAndValidation(t *testing.T) {
	srv := New(Config{}, nil, nil, nil)
	for _, args := range [][2]string{{"", "STATUS#"}, {"358899050127810", ""}, {"358899050127810", "A\r\nB"}} {
		if !errors.Is(srv.EnqueueCommand(args[0], args[1]), ErrInvalidCommand) {
			t.Fatal("accepted invalid command")
		}
	}
	for i := 0; i < maxDeviceCommands; i++ {
		if err := srv.EnqueueCommand("358899050127810", "STATUS#"); err != nil {
			t.Fatal(err)
		}
	}
	if !errors.Is(srv.EnqueueCommand("358899050127810", "STATUS#"), ErrCommandQueueFull) {
		t.Fatal("queue was not bounded")
	}
	for i := range srv.commands["358899050127810"] {
		srv.commands["358899050127810"][i].expiresAt = time.Now().Add(-time.Second)
	}
	if err := srv.EnqueueCommand("358899050127810", "STATUS#"); err != nil {
		t.Fatal(err)
	}
	if len(srv.commands["358899050127810"]) != 1 {
		t.Fatal("expired commands retained")
	}
	srv.Stop()
	if !errors.Is(srv.EnqueueCommand("358899050127810", "STATUS#"), ErrServerStopped) {
		t.Fatal("accepted after shutdown")
	}
}

func TestConcurrentCommandEnqueueIsBounded(t *testing.T) {
	srv := New(Config{}, nil, nil, nil)
	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_ = srv.EnqueueCommand("358899050127810", "STATUS#")
		}()
	}
	wg.Wait()
	if len(srv.commands["358899050127810"]) != maxDeviceCommands {
		t.Fatal("concurrent queue overflow")
	}
}

type shortWriteConn struct{ net.Conn }

func (shortWriteConn) SetWriteDeadline(time.Time) error { return nil }
func (shortWriteConn) Write(p []byte) (int, error)      { return len(p) - 1, nil }

func TestUncertainCommandWriteNotRetried(t *testing.T) {
	srv := New(Config{}, nil, nil, nil)
	if err := srv.EnqueueCommand("358899050127810", "STATUS#"); err != nil {
		t.Fatal(err)
	}
	if err := srv.flushCommands(shortWriteConn{}, "358899050127810"); !errors.Is(err, io.ErrShortWrite) {
		t.Fatalf("got %v", err)
	}
	if err := srv.flushCommands(shortWriteConn{}, "358899050127810"); err != nil {
		t.Fatal("retried uncertain operation")
	}
}

type enqueueOnPositionHandler struct {
	mockHandler
	server *Server
}

func (h *enqueueOnPositionHandler) HandlePosition(pos *protocol.Position, family, variant string) {
	h.mockHandler.HandlePosition(pos, family, variant)
	_ = h.server.EnqueueCommand(pos.IMEI, "STATUS#")
}

func TestCommandFailureDoesNotDropPosition(t *testing.T) {
	handler := &enqueueOnPositionHandler{}
	srv := New(Config{}, protocol.NewRegistry(protocol.NewGT06Parser()), nil, handler)
	handler.server = srv
	serverConn, client := net.Pipe()
	srv.wg.Add(1)
	srv.activeConn.Add(1)
	done := make(chan struct{})
	go func() { srv.handleConnection(serverConn); close(done) }()
	defer client.Close()
	client.SetDeadline(time.Now().Add(time.Second))
	login, _ := hex.DecodeString("78780D01035889905012781000050DD80D0A")
	if _, err := client.Write(login); err != nil {
		t.Fatal(err)
	}
	if _, err := protocol.NewGT06Parser().ReadFrame(bufio.NewReader(client)); err != nil {
		t.Fatal(err)
	}
	gps, _ := hex.DecodeString("787817121A03120A1E00800286D5740500D2642D0C7F0001AAAA0D0A")
	if _, err := client.Write(gps); err != nil {
		t.Fatal(err)
	}
	client.Close()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("connection did not close")
	}
	if len(handler.positionsSnapshot()) != 1 {
		t.Fatal("valid position lost because command delivery failed")
	}
}
