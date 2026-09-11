package server

import (
	"fmt"
	"net"
	"testing"
	"time"

	"github.com/otavioajr/tracker/gateway/internal/protocol"
)

func TestSuntechOpenConnectionFourteenFrames(t *testing.T) {
	for _, separator := range []string{"\r", "\n", "\r\n"} {
		t.Run(fmt.Sprintf("%q", separator), func(t *testing.T) {
			handler := &mockHandler{}
			srv := startTestServer(t, handler, protocol.NewRegistry(protocol.NewSuntechParser()))
			conn, err := net.Dial("tcp", srv.Addr())
			if err != nil {
				t.Fatal(err)
			}
			defer conn.Close()
			started := time.Now()
			for i := 0; i < 14; i++ {
				speed := 0.0
				if i == 13 {
					speed = 46.46
				}
				msg := fmt.Sprintf("ST300STT;999999999999999;04;374;20260909;10:30:%02d;0CD4A;-23.55;-046.63;%.2f;0;11;1;1;12.24", i, speed)
				// Split the payload and CRLF across writes; CR must complete without LF.
				for _, part := range []string{msg[:17], msg[17:] + separator[:1]} {
					if _, err := conn.Write([]byte(part)); err != nil {
						t.Fatal(err)
					}
				}
				waitFor(t, time.Second, func() bool { return len(handler.positionsSnapshot()) == i+1 })
				if len(separator) == 2 {
					if _, err := conn.Write([]byte(separator[1:])); err != nil {
						t.Fatal(err)
					}
				}
			}
			positions := handler.positionsSnapshot()
			if positions[0].Speed != 0 || positions[13].Speed != 46.46 {
				t.Fatal("lost individual speeds")
			}
			for i, p := range positions {
				if p.ReceivedAt.Before(started) || p.ReceivedAt.After(time.Now()) {
					t.Fatalf("invalid reception timestamp %v", p.ReceivedAt)
				}
				if i > 0 && !p.DeviceTime.After(positions[i-1].DeviceTime) {
					t.Fatal("frames grouped or reordered")
				}
			}
		})
	}
}

func TestSuntechPartialFrameEOFAndTimeout(t *testing.T) {
	for _, timeout := range []bool{false, true} {
		t.Run(fmt.Sprint(timeout), func(t *testing.T) {
			handler := &mockHandler{}
			srv := New(Config{IdleTimeout: 30 * time.Millisecond}, protocol.NewRegistry(protocol.NewSuntechParser()), nil, handler)
			serverConn, client := net.Pipe()
			srv.wg.Add(1)
			srv.activeConn.Add(1)
			done := make(chan struct{})
			go func() { srv.handleConnection(serverConn); close(done) }()
			defer client.Close()
			_, err := client.Write([]byte("ST300STT;999999999999999;04;374;20260909;10:30:00;0CD4A;-23.55;-046.63;0;0;11;1;1;12.24"))
			if err != nil {
				t.Fatal(err)
			}
			if !timeout {
				client.Close()
			}
			select {
			case <-done:
			case <-time.After(time.Second):
				t.Fatal("connection did not end")
			}
			if len(handler.positionsSnapshot()) != 0 {
				t.Fatal("partial frame became a position")
			}
		})
	}
}
