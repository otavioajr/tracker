package alerts

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type ruleRow struct {
	ID       string
	TenantID string
	DeviceID *string
	Type     string
	Config   string
	Active   bool
}

type Syncer struct {
	pool     *pgxpool.Pool
	engine   *Engine
	interval time.Duration
	logger   *slog.Logger
}

func NewSyncer(pool *pgxpool.Pool, engine *Engine, interval time.Duration, logger *slog.Logger) *Syncer {
	if logger == nil {
		logger = slog.Default()
	}
	return &Syncer{pool: pool, engine: engine, interval: interval, logger: logger}
}

func (s *Syncer) Start(ctx context.Context) {
	if err := s.sync(ctx); err != nil {
		s.logger.Error("initial rule sync failed", "error", err)
	}

	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := s.sync(ctx); err != nil {
				s.logger.Error("rule sync failed", "error", err)
			}
		}
	}
}

func (s *Syncer) sync(ctx context.Context) error {
	rows, err := s.pool.Query(ctx,
		"SELECT id, tenant_id, device_id, type, config::text, active FROM alert_rules")
	if err != nil {
		return fmt.Errorf("alerts: failed to query rules: %w", err)
	}
	defer rows.Close()

	var ruleRows []ruleRow
	for rows.Next() {
		var r ruleRow
		if err := rows.Scan(&r.ID, &r.TenantID, &r.DeviceID, &r.Type, &r.Config, &r.Active); err != nil {
			return fmt.Errorf("alerts: failed to scan rule: %w", err)
		}
		ruleRows = append(ruleRows, r)
	}

	rules := parseRuleRows(ruleRows)
	s.engine.UpdateRules(rules)
	s.logger.Debug("synced alert rules", "count", len(rules))
	return nil
}

func parseRuleRows(rows []ruleRow) []Rule {
	var rules []Rule
	for _, r := range rows {
		if !r.Active {
			continue
		}

		var config map[string]any
		json.Unmarshal([]byte(r.Config), &config)

		deviceID := ""
		if r.DeviceID != nil {
			deviceID = *r.DeviceID
		}

		rules = append(rules, Rule{
			ID:       r.ID,
			TenantID: r.TenantID,
			DeviceID: deviceID,
			Type:     r.Type,
			Config:   config,
		})
	}
	return rules
}
