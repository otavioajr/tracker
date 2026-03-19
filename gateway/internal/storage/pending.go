package storage

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// PendingWriter tracks unknown devices in the pending_devices table.
type PendingWriter struct {
	pool   *pgxpool.Pool
	seen   map[string]time.Time
	mu     sync.Mutex
	logger *slog.Logger
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
func (pw *PendingWriter) Track(ctx context.Context, serial, protocol, ipAddress string) {
	pw.mu.Lock()
	if last, ok := pw.seen[serial]; ok && time.Since(last) < 5*time.Minute {
		pw.mu.Unlock()
		return
	}
	pw.seen[serial] = time.Now()
	pw.mu.Unlock()

	_, err := pw.pool.Exec(ctx,
		`INSERT INTO pending_devices (serial, protocol, ip_address, first_seen_at, last_seen_at, message_count)
		 VALUES ($1, $2::device_protocol, $3, now(), now(), 1)
		 ON CONFLICT (serial) DO UPDATE SET
		   last_seen_at = now(),
		   ip_address = EXCLUDED.ip_address,
		   message_count = pending_devices.message_count + 1`,
		serial, protocol, ipAddress,
	)
	if err != nil {
		pw.logger.Error("failed to track pending device", "serial", serial, "error", err)
	} else {
		pw.logger.Info("pending device tracked", "serial", serial, "ip", ipAddress)
	}
}
