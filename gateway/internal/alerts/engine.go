package alerts

import (
	"fmt"
	"sync"

	"github.com/otavioajr/tracker/gateway/internal/protocol"
)

type Rule struct {
	ID       string
	TenantID string
	DeviceID string
	Type     string
	Config   map[string]any
}

type Alert struct {
	TenantID string
	DeviceID string
	Type     string
	Severity string
	Message  string
	Metadata map[string]any
}

type Engine struct {
	mu    sync.RWMutex
	rules []Rule
}

func NewEngine() *Engine {
	return &Engine{}
}

func (e *Engine) UpdateRules(rules []Rule) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.rules = rules
}

func (e *Engine) Evaluate(pos *protocol.Position, deviceID, tenantID string) []Alert {
	e.mu.RLock()
	defer e.mu.RUnlock()

	var triggered []Alert
	for _, rule := range e.rules {
		if rule.TenantID != tenantID {
			continue
		}
		if rule.DeviceID != "" && rule.DeviceID != deviceID {
			continue
		}
		if alert, ok := e.evaluateRule(rule, pos, deviceID); ok {
			triggered = append(triggered, alert)
		}
	}
	return triggered
}

func (e *Engine) evaluateRule(rule Rule, pos *protocol.Position, deviceID string) (Alert, bool) {
	switch rule.Type {
	case "speed":
		return e.evaluateSpeed(rule, pos, deviceID)
	case "ignition":
		return e.evaluateIgnition(rule, pos, deviceID)
	case "battery":
		return e.evaluateBattery(rule, pos, deviceID)
	default:
		return Alert{}, false
	}
}

func (e *Engine) evaluateSpeed(rule Rule, pos *protocol.Position, deviceID string) (Alert, bool) {
	maxSpeed, ok := rule.Config["max_speed"].(float64)
	if !ok {
		return Alert{}, false
	}
	if pos.Speed > maxSpeed {
		return Alert{
			TenantID: rule.TenantID,
			DeviceID: deviceID,
			Type:     "speed",
			Severity: "warning",
			Message:  fmt.Sprintf("Velocidade %.0f km/h excede limite de %.0f km/h", pos.Speed, maxSpeed),
			Metadata: map[string]any{"speed": pos.Speed, "max_speed": maxSpeed, "rule_id": rule.ID},
		}, true
	}
	return Alert{}, false
}

func (e *Engine) evaluateIgnition(rule Rule, pos *protocol.Position, deviceID string) (Alert, bool) {
	if pos.Ignition {
		return Alert{
			TenantID: rule.TenantID,
			DeviceID: deviceID,
			Type:     "ignition",
			Severity: "info",
			Message:  "Ignição ligada",
			Metadata: map[string]any{"ignition": true, "rule_id": rule.ID},
		}, true
	}
	return Alert{}, false
}

func (e *Engine) evaluateBattery(rule Rule, pos *protocol.Position, deviceID string) (Alert, bool) {
	minBattery, ok := rule.Config["min_battery"].(float64)
	if !ok {
		return Alert{}, false
	}
	if pos.Battery > 0 && pos.Battery < minBattery {
		return Alert{
			TenantID: rule.TenantID,
			DeviceID: deviceID,
			Type:     "battery",
			Severity: "critical",
			Message:  fmt.Sprintf("Bateria %.1fV abaixo do mínimo %.1fV", pos.Battery, minBattery),
			Metadata: map[string]any{"battery": pos.Battery, "min_battery": minBattery, "rule_id": rule.ID},
		}, true
	}
	return Alert{}, false
}
