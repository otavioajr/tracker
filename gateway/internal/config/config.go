// gateway/internal/config/config.go
package config

import (
	"fmt"
	"os"
	"strconv"
)

type Config struct {
	TCPPort     int
	DatabaseURL string
	MetricsPort int
}

func Load() (*Config, error) {
	cfg := &Config{
		TCPPort:     5001,
		MetricsPort: 9090,
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

	return cfg, nil
}
