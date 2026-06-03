package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/otavioajr/tracker/gateway/internal/alerts"
	"github.com/otavioajr/tracker/gateway/internal/config"
	"github.com/otavioajr/tracker/gateway/internal/metrics"
	"github.com/otavioajr/tracker/gateway/internal/protocol"
	"github.com/otavioajr/tracker/gateway/internal/server"
	"github.com/otavioajr/tracker/gateway/internal/storage"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug}))
	slog.SetDefault(logger)

	cfg, err := config.Load()
	if err != nil {
		logger.Error("failed to load config", "error", err)
		os.Exit(1)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Shared database pool
	poolCfg, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		logger.Error("failed to parse database config", "error", err)
		os.Exit(1)
	}
	poolCfg.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol
	pool, err := pgxpool.NewWithConfig(ctx, poolCfg)
	if err != nil {
		logger.Error("failed to connect to database", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		logger.Error("failed to ping database", "error", err)
		os.Exit(1)
	}
	logger.Info("connected to database")

	// Resilience buffer
	buf := storage.NewBuffer(cfg.BufferCapacity, cfg.BufferFallbackPath)

	// Alert engine
	alertEngine := alerts.NewEngine()

	// PostgreSQL writer (uses shared pool)
	writer := storage.NewWriter(storage.WriterConfig{
		Pool:          pool,
		FlushInterval: cfg.FlushInterval,
		FlushSize:     cfg.FlushSize,
		OnFlushError: func(positions []*protocol.Position) {
			buf.EnqueueBatch(positions)
			logger.Warn("positions buffered due to flush error", "count", len(positions))
		},
		Logger: logger,
	})

	// Load devices
	if err := writer.LoadDevices(ctx); err != nil {
		logger.Error("failed to load devices", "error", err)
		os.Exit(1)
	}

	// Pending device writer
	pendingWriter := storage.NewPendingWriter(pool, logger)
	protocolEvents := storage.NewProtocolEventWriter(pool, logger)

	// Protocol registry (binary must be checked before ASCII)
	registry := protocol.NewRegistry(protocol.NewSuntechBinaryParser(), protocol.NewSuntechParser(), protocol.NewGT06Parser())

	// Metrics
	m := metrics.New(func() int64 { return 0 })

	// Gateway handler
	gw := &gateway{
		writer:         writer,
		alertEngine:    alertEngine,
		pending:        pendingWriter,
		protocolEvents: protocolEvents,
		pool:           pool,
		metrics:        m,
		logger:         logger,
	}

	// TCP server
	tcpServer := server.New(server.Config{
		Port:        cfg.TCPPort,
		IdleTimeout: cfg.IdleTimeout,
		Logger:      logger,
	}, registry, protocol.NewDefaultDetector(), gw)

	// Update metrics to use real connection count
	m.ActiveConnections = tcpServer.ActiveConnections

	// Start background goroutines
	go writer.StartFlusher(ctx)
	go writer.StartDeviceReloader(ctx, cfg.DeviceReloadInterval)
	go alerts.NewSyncer(pool, alertEngine, cfg.RuleSyncInterval, logger).Start(ctx)
	metricsServer := metrics.StartServer(fmt.Sprintf(":%d", cfg.MetricsPort), m, logger)

	// Start TCP server in goroutine
	serverErrCh := make(chan error, 1)
	go func() {
		serverErrCh <- tcpServer.Start()
	}()

	logger.Info("tracker gateway started", "tcp_port", cfg.TCPPort, "metrics_port", cfg.MetricsPort)

	// Wait for shutdown signal
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	select {
	case err := <-serverErrCh:
		if err != nil {
			logger.Error("TCP server stopped unexpectedly", "error", err)
		}
	case sig := <-sigCh:
		logger.Info("shutdown signal received", "signal", sig)
	}

	logger.Info("shutting down...")
	cancel()
	tcpServer.Stop()
	metricsServer.Close()
	writer.Close()
	logger.Info("shutdown complete")
}

type gateway struct {
	writer interface {
		LookupDevice(string) (storage.DeviceInfo, bool)
		Enqueue(*protocol.Position)
	}
	alertEngine *alerts.Engine
	pending     interface {
		Track(context.Context, string, string, string, string)
	}
	protocolEvents interface {
		TrackUnknownFrame(context.Context, storage.UnknownFrameEvent)
		TrackProtocolFailure(context.Context, storage.ProtocolFailureEvent)
	}
	pool    *pgxpool.Pool
	metrics *metrics.Metrics
	logger  *slog.Logger
}

func (g *gateway) HandlePosition(pos *protocol.Position, family, variant string) {
	g.metrics.PositionsReceived.Add(1)

	info, ok := g.writer.LookupDevice(pos.IMEI)
	if !ok {
		g.pending.Track(context.Background(), pos.IMEI, family, variant, pos.RemoteAddr)
		return
	}

	g.writer.Enqueue(pos)

	triggered := g.alertEngine.Evaluate(pos, info.DeviceID, info.TenantID)
	for _, alert := range triggered {
		g.metrics.AlertsTriggered.Add(1)
		g.saveAlert(alert)
	}
}

func (g *gateway) HandleUnknownFrame(frame server.UnknownFrame) {
	g.protocolEvents.TrackUnknownFrame(context.Background(), storage.UnknownFrameEvent{
		Transport:       frame.Transport,
		Fingerprint:     frame.Fingerprint,
		RemoteIP:        frame.RemoteIP,
		RawPreview:      frame.RawPreview,
		RawPayload:      frame.RawPayload,
		CandidateFamily: frame.CandidateFamily,
		Confidence:      frame.Confidence,
	})
}

func (g *gateway) HandleProtocolFailure(failure server.ProtocolFailure) {
	g.protocolEvents.TrackProtocolFailure(context.Background(), storage.ProtocolFailureEvent{
		Family:       failure.Family,
		Variant:      failure.Variant,
		ErrorCode:    failure.ErrorCode,
		ErrorMessage: failure.ErrorMessage,
		RawPayload:   failure.RawPayload,
		DeviceHint:   failure.DeviceHint,
		RemoteIP:     failure.RemoteIP,
	})
}

func (g *gateway) saveAlert(alert alerts.Alert) {
	metadata, _ := json.Marshal(alert.Metadata)
	_, err := g.pool.Exec(context.Background(),
		"INSERT INTO alerts (tenant_id, device_id, type, severity, message, metadata) VALUES ($1, $2, $3::alert_type, $4::alert_severity, $5, $6::jsonb)",
		alert.TenantID, alert.DeviceID, alert.Type, alert.Severity, alert.Message, string(metadata),
	)
	if err != nil {
		g.logger.Error("failed to save alert", "type", alert.Type, "error", err)
	}
}
