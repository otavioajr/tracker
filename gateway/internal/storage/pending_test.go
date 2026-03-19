package storage

import (
	"log/slog"
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
