package storage

import (
	"context"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

const pendingTrackWindow = 5 * time.Minute

// PendingWriter tracks unknown devices in the pending_devices table.
type PendingWriter struct {
	pool   *pgxpool.Pool
	seen   map[string]time.Time
	mu     sync.Mutex
	logger *slog.Logger
}

type pendingTrackState struct {
	previous  time.Time
	hadRecord bool
}

// NewPendingWriter creates a new PendingWriter.
func NewPendingWriter(pool *pgxpool.Pool, logger *slog.Logger) *PendingWriter {
	return &PendingWriter{
		pool:   pool,
		seen:   make(map[string]time.Time),
		logger: logger,
	}
}

// Track upserts a pending device record, deduplicating writes within 5 minutes.
func (pw *PendingWriter) Track(ctx context.Context, serial, family, variant, ipAddress string) {
	if pw == nil || pw.pool == nil {
		return
	}

	now := time.Now()
	state, skip := pw.prepareTrack(serial, now)
	if skip {
		return
	}

	identity := normalizeProtocolIdentity(family, variant)
	parts := strings.SplitN(identity, "/", 2)
	protocolFamily := parts[0]
	protocolVariant := ""
	if len(parts) == 2 {
		protocolVariant = parts[1]
	}
	pendingProtocol := protocolEnumFromFamily(protocolFamily)

	_, err := pw.pool.Exec(ctx,
		`INSERT INTO pending_devices (serial, protocol, protocol_family, protocol_variant, ip_address, first_seen_at, last_seen_at, message_count)
		 VALUES ($1, $2::device_protocol, $3, $4, $5, now(), now(), 1)
		 ON CONFLICT (serial) DO UPDATE SET
		   last_seen_at = now(),
		   protocol = EXCLUDED.protocol,
		   protocol_family = EXCLUDED.protocol_family,
		   protocol_variant = EXCLUDED.protocol_variant,
		   ip_address = EXCLUDED.ip_address,
		   message_count = pending_devices.message_count + 1`,
		serial, pendingProtocol, protocolFamily, protocolVariant, ipAddress,
	)
	pw.finishTrack(serial, now, state, err == nil)

	logger := pw.loggerOrDefault()
	if err != nil {
		logger.Error("failed to track pending device", "serial", serial, "error", err)
	} else {
		logger.Info("pending device tracked", "serial", serial, "ip", ipAddress)
	}
}

func (pw *PendingWriter) prepareTrack(serial string, now time.Time) (pendingTrackState, bool) {
	if pw == nil {
		return pendingTrackState{}, true
	}

	pw.mu.Lock()
	defer pw.mu.Unlock()

	if pw.seen == nil {
		pw.seen = make(map[string]time.Time)
	}

	pw.pruneSeenLocked(now)

	state := pendingTrackState{}
	if last, ok := pw.seen[serial]; ok {
		state.previous = last
		state.hadRecord = true
		if now.Sub(last) < pendingTrackWindow {
			return state, true
		}
	}

	// Mark in-flight so concurrent attempts still respect the local dedupe window.
	pw.seen[serial] = now
	return state, false
}

func (pw *PendingWriter) finishTrack(serial string, now time.Time, state pendingTrackState, success bool) {
	if pw == nil {
		return
	}

	pw.mu.Lock()
	defer pw.mu.Unlock()

	if pw.seen == nil {
		pw.seen = make(map[string]time.Time)
	}

	if success {
		pw.seen[serial] = now
		return
	}

	if state.hadRecord {
		pw.seen[serial] = state.previous
		return
	}

	delete(pw.seen, serial)
}

func (pw *PendingWriter) pruneSeenLocked(now time.Time) {
	for serial, seenAt := range pw.seen {
		if now.Sub(seenAt) >= pendingTrackWindow {
			delete(pw.seen, serial)
		}
	}
}

func (pw *PendingWriter) loggerOrDefault() *slog.Logger {
	if pw == nil || pw.logger == nil {
		return slog.Default()
	}
	return pw.logger
}
