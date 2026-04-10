package config

import (
	"testing"
)

func TestLoad_Defaults(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://test:test@localhost/test")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.TCPPort != 5001 {
		t.Errorf("TCPPort = %d, want 5001", cfg.TCPPort)
	}
	if cfg.MetricsPort != 9090 {
		t.Errorf("MetricsPort = %d, want 9090", cfg.MetricsPort)
	}
	if cfg.RuleSyncInterval.Seconds() != 30 {
		t.Errorf("RuleSyncInterval = %v, want 30s", cfg.RuleSyncInterval)
	}
	if cfg.DeviceReloadInterval.Seconds() != 5 {
		t.Errorf("DeviceReloadInterval = %v, want 5s", cfg.DeviceReloadInterval)
	}
	if cfg.BufferCapacity != 10000 {
		t.Errorf("BufferCapacity = %d, want 10000", cfg.BufferCapacity)
	}
	if cfg.FlushSize != 100 {
		t.Errorf("FlushSize = %d, want 100", cfg.FlushSize)
	}
	if cfg.BufferFallbackPath != "./buffer.jsonl" {
		t.Errorf("BufferFallbackPath = %q, want './buffer.jsonl'", cfg.BufferFallbackPath)
	}
}

func TestLoad_MissingDatabaseURL(t *testing.T) {
	_, err := Load()
	if err == nil {
		t.Fatal("expected error for missing DATABASE_URL")
	}
}

func TestLoad_CustomPorts(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://test:test@localhost/test")
	t.Setenv("TCP_PORT", "6001")
	t.Setenv("METRICS_PORT", "9191")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.TCPPort != 6001 {
		t.Errorf("TCPPort = %d, want 6001", cfg.TCPPort)
	}
	if cfg.MetricsPort != 9191 {
		t.Errorf("MetricsPort = %d, want 9191", cfg.MetricsPort)
	}
}

func TestLoad_CustomIntervals(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://test:test@localhost/test")
	t.Setenv("RULE_SYNC_INTERVAL", "1m")
	t.Setenv("DEVICE_RELOAD_INTERVAL", "3s")
	t.Setenv("FLUSH_INTERVAL", "2s")
	t.Setenv("FLUSH_SIZE", "50")
	t.Setenv("BUFFER_CAPACITY", "5000")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.RuleSyncInterval.Seconds() != 60 {
		t.Errorf("RuleSyncInterval = %v, want 1m", cfg.RuleSyncInterval)
	}
	if cfg.DeviceReloadInterval.Seconds() != 3 {
		t.Errorf("DeviceReloadInterval = %v, want 3s", cfg.DeviceReloadInterval)
	}
	if cfg.FlushInterval.Seconds() != 2 {
		t.Errorf("FlushInterval = %v, want 2s", cfg.FlushInterval)
	}
	if cfg.FlushSize != 50 {
		t.Errorf("FlushSize = %d, want 50", cfg.FlushSize)
	}
	if cfg.BufferCapacity != 5000 {
		t.Errorf("BufferCapacity = %d, want 5000", cfg.BufferCapacity)
	}
}
