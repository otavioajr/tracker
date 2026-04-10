package main

import (
	"context"
	"log/slog"
	"net"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/otavioajr/tracker/gateway/internal/alerts"
	"github.com/otavioajr/tracker/gateway/internal/metrics"
	"github.com/otavioajr/tracker/gateway/internal/protocol"
	"github.com/otavioajr/tracker/gateway/internal/server"
	"github.com/otavioajr/tracker/gateway/internal/storage"
)

type fakeWriter struct {
	mu       sync.Mutex
	devices  map[string]storage.DeviceInfo
	enqueued int
}

func (f *fakeWriter) LookupDevice(serial string) (storage.DeviceInfo, bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	info, ok := f.devices[serial]
	return info, ok
}

func (f *fakeWriter) Enqueue(pos *protocol.Position) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.enqueued++
}

type pendingTrackCall struct {
	Serial  string
	Family  string
	Variant string
	Remote  string
}

type fakePendingWriter struct {
	mu    sync.Mutex
	calls []pendingTrackCall
}

func (f *fakePendingWriter) Track(_ context.Context, serial, family, variant, remote string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls = append(f.calls, pendingTrackCall{
		Serial:  serial,
		Family:  family,
		Variant: variant,
		Remote:  remote,
	})
}

func (f *fakePendingWriter) snapshot() []pendingTrackCall {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]pendingTrackCall(nil), f.calls...)
}

type fakeProtocolEventWriter struct {
	mu       sync.Mutex
	unknown  []storage.UnknownFrameEvent
	failures []storage.ProtocolFailureEvent
}

func (f *fakeProtocolEventWriter) TrackUnknownFrame(_ context.Context, event storage.UnknownFrameEvent) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.unknown = append(f.unknown, event)
}

func (f *fakeProtocolEventWriter) TrackProtocolFailure(_ context.Context, event storage.ProtocolFailureEvent) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.failures = append(f.failures, event)
}

func (f *fakeProtocolEventWriter) unknownSnapshot() []storage.UnknownFrameEvent {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]storage.UnknownFrameEvent(nil), f.unknown...)
}

func (f *fakeProtocolEventWriter) failureSnapshot() []storage.ProtocolFailureEvent {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]storage.ProtocolFailureEvent(nil), f.failures...)
}

func waitForTestOutcome(t *testing.T, timeout time.Duration, predicate func() bool) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if predicate() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for outcome")
}

func newTestGateway() (*gateway, *fakeWriter, *fakePendingWriter, *fakeProtocolEventWriter) {
	writer := &fakeWriter{
		devices: map[string]storage.DeviceInfo{},
	}
	pending := &fakePendingWriter{}
	events := &fakeProtocolEventWriter{}

	return &gateway{
		writer:         writer,
		alertEngine:    alerts.NewEngine(),
		pending:        pending,
		protocolEvents: events,
		metrics:        metrics.New(func() int64 { return 0 }),
		logger:         slog.Default(),
	}, writer, pending, events
}

func startGatewayTestServer(t *testing.T, handler server.OutcomeHandler) *server.Server {
	registry := protocol.NewRegistry(protocol.NewSuntechParser())
	srv := server.New(
		server.Config{
			Port:        0,
			ReadTimeout: 5 * time.Second,
			IdleTimeout: 10 * time.Second,
		},
		registry,
		protocol.NewDefaultDetector(),
		handler,
	)

	go srv.Start()

	waitForTestOutcome(t, 2*time.Second, func() bool {
		return srv.Addr() != ""
	})

	t.Cleanup(srv.Stop)
	return srv
}

func TestGatewaySTTCompactUnknownDeviceBecomesPending(t *testing.T) {
	gw, _, pending, _ := newTestGateway()
	srv := startGatewayTestServer(t, gw)

	conn, err := net.Dial("tcp", srv.Addr())
	if err != nil {
		t.Fatalf("failed to dial gateway server: %v", err)
	}
	defer conn.Close()

	msg := "STT;1910006088;FFFFFF;191;1.0.14;0;20260410;11:22:16;0C3F4D15;724;10;E93F;54;-23.616218;-46.737257;0.00;0.00;16;1;00000000;00000000;0;1;0057;;0083800F;4.0;12.41;;;;;;\r\n"
	if _, err := conn.Write([]byte(msg)); err != nil {
		t.Fatalf("failed to write compact STT: %v", err)
	}

	waitForTestOutcome(t, 2*time.Second, func() bool {
		return len(pending.snapshot()) == 1
	})

	calls := pending.snapshot()
	if len(calls) != 1 {
		t.Fatalf("pending calls = %d, want 1", len(calls))
	}
	if calls[0].Serial != "1910006088" {
		t.Fatalf("pending serial = %q, want %q", calls[0].Serial, "1910006088")
	}
	if calls[0].Family != "suntech" {
		t.Fatalf("pending family = %q, want %q", calls[0].Family, "suntech")
	}
	if calls[0].Variant != "stt_compact_ascii" {
		t.Fatalf("pending variant = %q, want %q", calls[0].Variant, "stt_compact_ascii")
	}
}

func TestGatewayUnknownScannerTrafficBecomesUnknownFrame(t *testing.T) {
	_, _, _, events := newTestGateway()
	srv := startGatewayTestServer(t, &gateway{
		writer:         &fakeWriter{},
		alertEngine:    alerts.NewEngine(),
		pending:        &fakePendingWriter{},
		protocolEvents: events,
		metrics:        metrics.New(func() int64 { return 0 }),
		logger:         slog.Default(),
	})

	conn, err := net.Dial("tcp", srv.Addr())
	if err != nil {
		t.Fatalf("failed to dial gateway server: %v", err)
	}
	defer conn.Close()

	if _, err := conn.Write([]byte("GET / HTTP/1.1\r\n")); err != nil {
		t.Fatalf("failed to write unknown traffic: %v", err)
	}

	waitForTestOutcome(t, 2*time.Second, func() bool {
		return len(events.unknownSnapshot()) == 1
	})

	unknownFrames := events.unknownSnapshot()
	if len(unknownFrames) != 1 {
		t.Fatalf("unknown frames = %d, want 1", len(unknownFrames))
	}
	if !strings.EqualFold(unknownFrames[0].RawPayload, "GET / HTTP/1.1") {
		t.Fatalf("raw payload = %q, want %q", unknownFrames[0].RawPayload, "GET / HTTP/1.1")
	}
	if unknownFrames[0].Transport != "tcp" {
		t.Fatalf("transport = %q, want %q", unknownFrames[0].Transport, "tcp")
	}
}

func TestGatewayKnownFamilyBadPayloadBecomesProtocolFailure(t *testing.T) {
	_, _, _, events := newTestGateway()
	srv := startGatewayTestServer(t, &gateway{
		writer:         &fakeWriter{},
		alertEngine:    alerts.NewEngine(),
		pending:        &fakePendingWriter{},
		protocolEvents: events,
		metrics:        metrics.New(func() int64 { return 0 }),
		logger:         slog.Default(),
	})

	conn, err := net.Dial("tcp", srv.Addr())
	if err != nil {
		t.Fatalf("failed to dial gateway server: %v", err)
	}
	defer conn.Close()

	msg := "ST300STT;123456789012345;04;374;20260318;10:30:00;0CD4A;LAT;-046.633308;045.500;127.30;11;1;1;12.24\r\n"
	if _, err := conn.Write([]byte(msg)); err != nil {
		t.Fatalf("failed to write invalid payload: %v", err)
	}

	waitForTestOutcome(t, 2*time.Second, func() bool {
		return len(events.failureSnapshot()) == 1
	})

	failures := events.failureSnapshot()
	if len(failures) != 1 {
		t.Fatalf("protocol failures = %d, want 1", len(failures))
	}
	if failures[0].Family != "suntech" {
		t.Fatalf("family = %q, want %q", failures[0].Family, "suntech")
	}
	if failures[0].Variant != "st300_ascii" {
		t.Fatalf("variant = %q, want %q", failures[0].Variant, "st300_ascii")
	}
	if failures[0].ErrorCode != "invalid_latitude" {
		t.Fatalf("error_code = %q, want %q", failures[0].ErrorCode, "invalid_latitude")
	}
}
