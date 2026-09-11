package server

import (
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/otavioajr/tracker/gateway/internal/protocol"
)

func TestCommandHTTPAccess(t *testing.T) {
	for _, tc := range []struct {
		name, addr, remote, token, auth, method, path, origin string
		status                                                int
	}{
		{"legacy", "127.0.0.1:9091", "127.0.0.1:4000", "", "", "GET", "/cmd?imei=358899050127810&cmd=STATUS%23", "", 200},
		{"post", "127.0.0.1:9091", "127.0.0.1:4000", "", "", "POST", "/cmd?imei=358899050127810&cmd=STATUS%23", "", 200},
		{"remote blocked", "127.0.0.1:9091", "10.0.0.1:4000", "", "", "GET", "/cmd?imei=358899050127810&cmd=STATUS%23", "", 403},
		{"token missing", ":9091", "10.0.0.1:4000", "secret", "", "GET", "/cmd?imei=358899050127810&cmd=STATUS%23", "", 401},
		{"token valid", ":9091", "10.0.0.1:4000", "secret", "Bearer secret", "POST", "/cmd?imei=358899050127810&cmd=STATUS%23", "", 200},
		{"browser blocked", "127.0.0.1:9091", "127.0.0.1:4000", "", "", "GET", "/cmd?imei=358899050127810&cmd=STATUS%23", "https://example.com", 403},
		{"missing query", "127.0.0.1:9091", "127.0.0.1:4000", "", "", "GET", "/cmd", "", 400},
		{"invalid method", "127.0.0.1:9091", "127.0.0.1:4000", "", "", "DELETE", "/cmd", "", 405},
		{"invalid frame", "127.0.0.1:9091", "127.0.0.1:4000", "", "", "GET", "/cmd?imei=358899050127810&cmd=A%0DB", "", 400},
	} {
		t.Run(tc.name, func(t *testing.T) {
			queue := New(Config{}, nil, nil, nil)
			srv, err := NewCommandHTTPServer(tc.addr, tc.token, queue)
			if err != nil {
				t.Fatal(err)
			}
			r := httptest.NewRequest(tc.method, tc.path, nil)
			r.RemoteAddr = tc.remote
			r.Header.Set("Authorization", tc.auth)
			r.Header.Set("Origin", tc.origin)
			w := httptest.NewRecorder()
			srv.Handler.ServeHTTP(w, r)
			if w.Code != tc.status {
				t.Fatalf("status %d: %s", w.Code, w.Body.String())
			}
			if tc.status != http.StatusOK && len(queue.commands) != 0 {
				t.Fatal("rejected request enqueued")
			}
		})
	}
}

func TestCommandHTTPLegacyResponseContract(t *testing.T) {
	for _, tc := range []struct {
		query, body string
		status      int
	}{
		{"?imei=358899050127810&cmd=STATUS%23", "queued: 358899050127810 -> STATUS#\n", 200},
		{"?imei=358899050127810&cmd=A%2BB+%26%23&cmd=IGNORED", "queued: 358899050127810 -> A+B &#\n", 200},
		{"?imei=358899050127810", "need imei and cmd query params\n", 400},
	} {
		t.Run(tc.query, func(t *testing.T) {
			queue := New(Config{}, nil, nil, nil)
			srv, err := NewCommandHTTPServer("127.0.0.1:9091", "", queue)
			if err != nil {
				t.Fatal(err)
			}
			r := httptest.NewRequest("GET", "/cmd"+tc.query, nil)
			r.RemoteAddr = "127.0.0.1:1234"
			w := httptest.NewRecorder()
			srv.Handler.ServeHTTP(w, r)
			if w.Code != tc.status || w.Body.String() != tc.body {
				t.Fatalf("response: %d %q; want %d %q", w.Code, w.Body.String(), tc.status, tc.body)
			}
		})
	}
}

func TestCommandHTTPReportsQueueAndShutdownFailures(t *testing.T) {
	queue := New(Config{}, nil, nil, nil)
	srv, err := NewCommandHTTPServer("127.0.0.1:9091", "", queue)
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < maxDeviceCommands; i++ {
		if err := queue.EnqueueCommand("358899050127810", "STATUS#"); err != nil {
			t.Fatal(err)
		}
	}
	for _, status := range []int{http.StatusTooManyRequests, http.StatusServiceUnavailable} {
		if status == http.StatusServiceUnavailable {
			queue.Stop()
		}
		r := httptest.NewRequest("GET", "/cmd?imei=358899050127810&cmd=STATUS%23", nil)
		r.RemoteAddr = "127.0.0.1:1234"
		w := httptest.NewRecorder()
		srv.Handler.ServeHTTP(w, r)
		if w.Code != status {
			t.Fatalf("status %d, want %d", w.Code, status)
		}
	}
}

func TestCommandHTTPRefusesUnauthenticatedPublicBinding(t *testing.T) {
	for _, addr := range []string{":9091", "0.0.0.0:9091", "localhost:9091", "bad"} {
		if _, err := NewCommandHTTPServer(addr, "", nil); err == nil {
			t.Fatalf("accepted %s", addr)
		}
	}
}

func TestStopClosesIdleTrackers(t *testing.T) {
	srv := startTestServer(t, &mockHandler{}, protocol.NewRegistry(protocol.NewGT06Parser()))
	conn, err := net.Dial("tcp", srv.Addr())
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	waitFor(t, time.Second, func() bool { return srv.ActiveConnections() == 1 })
	done := make(chan struct{})
	go func() { srv.Stop(); close(done) }()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("shutdown waited for idle timeout")
	}
	srv.Stop()
}
