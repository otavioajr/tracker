package storage

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/otavioajr/tracker/gateway/internal/protocol"
)

// DeviceInfo maps an IMEI to its database IDs.
type DeviceInfo struct {
	DeviceID  string
	TenantID  string
	VehicleID *string
}

// Writer batches GPS positions and flushes them to PostgreSQL.
type Writer struct {
	pool          *pgxpool.Pool
	devices       map[string]DeviceInfo
	mu            sync.RWMutex
	batch         []*protocol.Position
	batchMu       sync.Mutex
	flushInterval time.Duration
	flushSize     int
	onFlushError  func([]*protocol.Position)
	logger        *slog.Logger
}

// WriterConfig configures the batch writer.
type WriterConfig struct {
	Pool          *pgxpool.Pool
	FlushInterval time.Duration
	FlushSize     int
	OnFlushError  func([]*protocol.Position)
	Logger        *slog.Logger
}

// NewWriter creates a new PostgreSQL batch writer using a shared pool.
func NewWriter(cfg WriterConfig) *Writer {
	if cfg.FlushInterval == 0 {
		cfg.FlushInterval = time.Second
	}
	if cfg.FlushSize == 0 {
		cfg.FlushSize = 100
	}
	if cfg.Logger == nil {
		cfg.Logger = slog.Default()
	}

	return &Writer{
		pool:          cfg.Pool,
		devices:       make(map[string]DeviceInfo),
		flushInterval: cfg.FlushInterval,
		flushSize:     cfg.FlushSize,
		onFlushError:  cfg.OnFlushError,
		logger:        cfg.Logger,
	}
}

// LoadDevices fetches all active devices from the database and caches them.
func (w *Writer) LoadDevices(ctx context.Context) error {
	rows, err := w.pool.Query(ctx,
		`SELECT d.id, d.tenant_id, d.imei, v.id
		 FROM devices d
		 LEFT JOIN vehicles v ON v.device_id = d.id
		 WHERE d.active = true`)
	if err != nil {
		return fmt.Errorf("storage: failed to load devices: %w", err)
	}
	defer rows.Close()

	devices := make(map[string]DeviceInfo)
	for rows.Next() {
		var id, tenantID, imei string
		var vehicleID *string
		if err := rows.Scan(&id, &tenantID, &imei, &vehicleID); err != nil {
			return fmt.Errorf("storage: failed to scan device: %w", err)
		}
		devices[imei] = DeviceInfo{DeviceID: id, TenantID: tenantID, VehicleID: vehicleID}
	}

	w.mu.Lock()
	w.devices = devices
	w.mu.Unlock()

	w.logger.Info("loaded devices", "count", len(devices))
	return nil
}

// LookupDevice returns the DeviceInfo for an IMEI, if registered.
func (w *Writer) LookupDevice(imei string) (DeviceInfo, bool) {
	w.mu.RLock()
	defer w.mu.RUnlock()
	info, ok := w.devices[imei]
	return info, ok
}

// Enqueue adds a position to the batch. Triggers flush if batch is full.
func (w *Writer) Enqueue(pos *protocol.Position) {
	w.batchMu.Lock()
	w.batch = append(w.batch, pos)
	shouldFlush := len(w.batch) >= w.flushSize
	w.batchMu.Unlock()

	if shouldFlush {
		go w.Flush(context.Background())
	}
}

// Flush writes all queued positions to PostgreSQL.
func (w *Writer) Flush(ctx context.Context) {
	w.batchMu.Lock()
	if len(w.batch) == 0 {
		w.batchMu.Unlock()
		return
	}
	positions := w.batch
	w.batch = nil
	w.batchMu.Unlock()

	w.mu.RLock()
	devices := w.devices
	w.mu.RUnlock()

	sql, args := buildBatchInsert(positions, devices)
	if sql == "" {
		return
	}

	_, err := w.pool.Exec(ctx, sql, args...)
	if err != nil {
		w.logger.Error("failed to flush positions", "count", len(positions), "error", err)
		if w.onFlushError != nil {
			w.onFlushError(positions)
		}
		return
	}

	w.logger.Debug("flushed positions", "count", len(positions))
}

// StartFlusher runs periodic flush on an interval. Call in a goroutine.
func (w *Writer) StartFlusher(ctx context.Context) {
	ticker := time.NewTicker(w.flushInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			w.Flush(context.Background())
			return
		case <-ticker.C:
			w.Flush(ctx)
		}
	}
}

// UpdateLastCommunication updates the device's last_communication_at timestamp.
func (w *Writer) UpdateLastCommunication(ctx context.Context, imei string) {
	info, ok := w.LookupDevice(imei)
	if !ok {
		return
	}
	_, err := w.pool.Exec(ctx, "UPDATE devices SET last_communication_at = now() WHERE id = $1", info.DeviceID)
	if err != nil {
		w.logger.Error("failed to update last_communication_at", "imei", imei, "error", err)
	}
}

// Close flushes remaining positions. Does NOT close the shared pool.
func (w *Writer) Close() {
	w.Flush(context.Background())
}

// buildBatchInsert constructs a multi-row INSERT statement.
func buildBatchInsert(positions []*protocol.Position, devices map[string]DeviceInfo) (string, []any) {
	var values []string
	var args []any
	paramIdx := 1

	for _, pos := range positions {
		info, ok := devices[pos.IMEI]
		if !ok {
			continue
		}

		rawJSON, _ := json.Marshal(map[string]string{"raw": pos.RawData})

		values = append(values, fmt.Sprintf(
			"($%d, $%d, $%d, ST_SetSRID(ST_MakePoint($%d, $%d), 4326), $%d, $%d, $%d, $%d, $%d, $%d::jsonb, $%d, now())",
			paramIdx, paramIdx+1, paramIdx+2, paramIdx+3, paramIdx+4,
			paramIdx+5, paramIdx+6, paramIdx+7, paramIdx+8,
			paramIdx+9, paramIdx+10, paramIdx+11,
		))
		args = append(args,
			info.DeviceID, info.TenantID, info.VehicleID,
			pos.Longitude, pos.Latitude,
			pos.Speed, pos.Heading, pos.Ignition, pos.Altitude,
			pos.Satellites, string(rawJSON), pos.DeviceTime,
		)
		paramIdx += 12
	}

	if len(values) == 0 {
		return "", nil
	}

	sql := fmt.Sprintf(
		"INSERT INTO positions (device_id, tenant_id, vehicle_id, location, speed, heading, ignition, altitude, satellites, raw_data, device_time, server_time) VALUES %s",
		strings.Join(values, ", "),
	)

	return sql, args
}
