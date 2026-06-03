package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

type Config struct {
	TCPPort              int
	DatabaseURL          string
	MetricsPort          int
	IdleTimeout          time.Duration
	RuleSyncInterval     time.Duration
	DeviceReloadInterval time.Duration
	BufferCapacity       int
	FlushInterval        time.Duration
	FlushSize            int
	BufferFallbackPath   string
}

func Load() (*Config, error) {
	cfg := &Config{
		TCPPort:              5001,
		MetricsPort:          9090,
		IdleTimeout:          300 * time.Second,
		RuleSyncInterval:     30 * time.Second,
		DeviceReloadInterval: 5 * time.Second,
		BufferCapacity:       10000,
		FlushInterval:        time.Second,
		FlushSize:            100,
		BufferFallbackPath:   "./buffer.jsonl",
	}

	if port := os.Getenv("TCP_PORT"); port != "" {
		p, err := strconv.Atoi(port)
		if err != nil {
			return nil, fmt.Errorf("invalid TCP_PORT: %w", err)
		}
		cfg.TCPPort = p
	}

	cfg.DatabaseURL = os.Getenv("DATABASE_URL")
	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}

	if port := os.Getenv("METRICS_PORT"); port != "" {
		p, err := strconv.Atoi(port)
		if err != nil {
			return nil, fmt.Errorf("invalid METRICS_PORT: %w", err)
		}
		cfg.MetricsPort = p
	}

	if timeout := os.Getenv("IDLE_TIMEOUT"); timeout != "" {
		d, err := time.ParseDuration(timeout)
		if err != nil {
			return nil, fmt.Errorf("invalid IDLE_TIMEOUT: %w", err)
		}
		cfg.IdleTimeout = d
	}

	if interval := os.Getenv("RULE_SYNC_INTERVAL"); interval != "" {
		d, err := time.ParseDuration(interval)
		if err != nil {
			return nil, fmt.Errorf("invalid RULE_SYNC_INTERVAL: %w", err)
		}
		cfg.RuleSyncInterval = d
	}

	if interval := os.Getenv("DEVICE_RELOAD_INTERVAL"); interval != "" {
		d, err := time.ParseDuration(interval)
		if err != nil {
			return nil, fmt.Errorf("invalid DEVICE_RELOAD_INTERVAL: %w", err)
		}
		cfg.DeviceReloadInterval = d
	}

	if cap := os.Getenv("BUFFER_CAPACITY"); cap != "" {
		c, err := strconv.Atoi(cap)
		if err != nil {
			return nil, fmt.Errorf("invalid BUFFER_CAPACITY: %w", err)
		}
		cfg.BufferCapacity = c
	}

	if interval := os.Getenv("FLUSH_INTERVAL"); interval != "" {
		d, err := time.ParseDuration(interval)
		if err != nil {
			return nil, fmt.Errorf("invalid FLUSH_INTERVAL: %w", err)
		}
		cfg.FlushInterval = d
	}

	if size := os.Getenv("FLUSH_SIZE"); size != "" {
		s, err := strconv.Atoi(size)
		if err != nil {
			return nil, fmt.Errorf("invalid FLUSH_SIZE: %w", err)
		}
		cfg.FlushSize = s
	}

	if path := os.Getenv("BUFFER_FALLBACK_PATH"); path != "" {
		cfg.BufferFallbackPath = path
	}

	return cfg, nil
}
