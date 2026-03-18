package metrics

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"sync/atomic"
	"time"
)

type Metrics struct {
	ActiveConnections func() int64
	PositionsReceived atomic.Int64
	PositionsFlushed  atomic.Int64
	FlushErrors       atomic.Int64
	AlertsTriggered   atomic.Int64
	startTime         time.Time
}

func New(activeConnFn func() int64) *Metrics {
	return &Metrics{
		ActiveConnections: activeConnFn,
		startTime:         time.Now(),
	}
}

func (m *Metrics) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	data := map[string]any{
		"uptime_seconds":     time.Since(m.startTime).Seconds(),
		"active_connections": m.ActiveConnections(),
		"positions_received": m.PositionsReceived.Load(),
		"positions_flushed":  m.PositionsFlushed.Load(),
		"flush_errors":       m.FlushErrors.Load(),
		"alerts_triggered":   m.AlertsTriggered.Load(),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

func StartServer(addr string, m *Metrics, logger *slog.Logger) *http.Server {
	mux := http.NewServeMux()
	mux.Handle("/metrics", m)
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok"}`))
	})

	srv := &http.Server{Addr: addr, Handler: mux}
	go func() {
		logger.Info("metrics server listening", "addr", addr)
		if err := srv.ListenAndServe(); err != http.ErrServerClosed {
			logger.Error("metrics server error", "error", err)
		}
	}()

	return srv
}
