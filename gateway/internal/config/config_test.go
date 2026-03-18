// gateway/internal/config/config_test.go
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
		t.Errorf("expected TCPPort 5001, got %d", cfg.TCPPort)
	}
	if cfg.MetricsPort != 9090 {
		t.Errorf("expected MetricsPort 9090, got %d", cfg.MetricsPort)
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
		t.Errorf("expected TCPPort 6001, got %d", cfg.TCPPort)
	}
	if cfg.MetricsPort != 9191 {
		t.Errorf("expected MetricsPort 9191, got %d", cfg.MetricsPort)
	}
}
