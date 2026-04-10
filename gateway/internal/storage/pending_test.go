package storage

import (
	"log/slog"
	"strings"
	"testing"
	"time"
)

func TestPendingWriter_Dedup(t *testing.T) {
	pw := &PendingWriter{
		seen:   make(map[string]time.Time),
		logger: slog.Default(),
	}
	// Simulate a recently seen serial
	pw.seen["serial1"] = time.Now()

	pw.mu.Lock()
	last, ok := pw.seen["serial1"]
	isDedup := ok && time.Since(last) < 5*time.Minute
	pw.mu.Unlock()

	if !isDedup {
		t.Error("expected dedup within 5 minutes")
	}
}

func TestPendingWriter_NoDedupAfterExpiry(t *testing.T) {
	pw := &PendingWriter{
		seen:   make(map[string]time.Time),
		logger: slog.Default(),
	}
	// Simulate a serial seen more than 5 minutes ago
	pw.seen["serial1"] = time.Now().Add(-6 * time.Minute)

	pw.mu.Lock()
	last, ok := pw.seen["serial1"]
	isDedup := ok && time.Since(last) < 5*time.Minute
	pw.mu.Unlock()

	if isDedup {
		t.Error("expected no dedup after 5 minutes")
	}
}

func TestPendingWriter_NormalizeProtocolIdentityForLegacyBinaryFamily(t *testing.T) {
	identity := normalizeProtocolIdentity("suntech-binary", "st310_binary")
	parts := strings.SplitN(identity, "/", 2)
	family := parts[0]
	variant := ""
	if len(parts) == 2 {
		variant = parts[1]
	}
	protocol := protocolEnumFromFamily(family)

	if family != "suntech" {
		t.Fatalf("family = %q, want %q", family, "suntech")
	}
	if variant != "st310_binary" {
		t.Fatalf("variant = %q, want %q", variant, "st310_binary")
	}
	if protocol != "suntech" {
		t.Fatalf("protocol enum = %q, want %q", protocol, "suntech")
	}
}

func TestPendingWriter_PrepareTrackPrunesExpiredEntries(t *testing.T) {
	now := time.Now()
	pw := &PendingWriter{
		seen: map[string]time.Time{
			"expired": now.Add(-(pendingTrackWindow + time.Minute)),
			"recent":  now.Add(-time.Minute),
		},
		logger: slog.Default(),
	}

	_, skip := pw.prepareTrack("serial-new", now)
	if skip {
		t.Fatal("expected new serial to bypass dedupe")
	}

	if _, ok := pw.seen["expired"]; ok {
		t.Fatal("expected expired serial to be pruned from seen cache")
	}
	if _, ok := pw.seen["recent"]; !ok {
		t.Fatal("expected recent serial to remain in seen cache")
	}
}

func TestPendingWriter_FinishTrackRevertsSeenOnFailure(t *testing.T) {
	now := time.Now()
	pw := &PendingWriter{
		seen:   make(map[string]time.Time),
		logger: slog.Default(),
	}

	state, skip := pw.prepareTrack("serial-fail", now)
	if skip {
		t.Fatal("expected first track attempt to bypass dedupe")
	}

	pw.finishTrack("serial-fail", now, state, false)

	if _, ok := pw.seen["serial-fail"]; ok {
		t.Fatal("expected failed track to revert dedupe marker")
	}
}

func TestPendingWriter_TrackNilSafe(t *testing.T) {
	var nilWriter *PendingWriter

	func() {
		defer func() {
			if r := recover(); r != nil {
				t.Fatalf("nil writer panicked: %v", r)
			}
		}()
		nilWriter.Track(nil, "serial", "suntech", "st310_binary", "127.0.0.1")
	}()

	pw := &PendingWriter{}
	func() {
		defer func() {
			if r := recover(); r != nil {
				t.Fatalf("zero-value writer panicked: %v", r)
			}
		}()
		pw.Track(nil, "serial", "suntech", "st310_binary", "127.0.0.1")
	}()
}
