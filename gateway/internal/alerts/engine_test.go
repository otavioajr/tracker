package alerts

import (
	"testing"

	"github.com/otavioajr/tracker/gateway/internal/protocol"
)

func TestEvaluateSpeedRule(t *testing.T) {
	engine := NewEngine()
	engine.UpdateRules([]Rule{
		{ID: "r1", TenantID: "t1", DeviceID: "", Type: "speed", Config: map[string]any{"max_speed": float64(120)}},
	})

	alerts := engine.Evaluate(&protocol.Position{IMEI: "imei1", Speed: 130}, "d1", "t1")
	if len(alerts) != 1 {
		t.Fatalf("expected 1 alert, got %d", len(alerts))
	}
	if alerts[0].Type != "speed" {
		t.Errorf("expected type 'speed', got %q", alerts[0].Type)
	}
	if alerts[0].Severity != "warning" {
		t.Errorf("expected severity 'warning', got %q", alerts[0].Severity)
	}

	alerts = engine.Evaluate(&protocol.Position{IMEI: "imei1", Speed: 100}, "d1", "t1")
	if len(alerts) != 0 {
		t.Errorf("expected 0 alerts, got %d", len(alerts))
	}
}

func TestEvaluateIgnitionRule(t *testing.T) {
	engine := NewEngine()
	engine.UpdateRules([]Rule{
		{ID: "r2", TenantID: "t1", DeviceID: "", Type: "ignition", Config: map[string]any{}},
	})

	alerts := engine.Evaluate(&protocol.Position{IMEI: "imei1", Ignition: true}, "d1", "t1")
	if len(alerts) != 1 {
		t.Fatalf("expected 1 alert for ignition on, got %d", len(alerts))
	}

	alerts = engine.Evaluate(&protocol.Position{IMEI: "imei1", Ignition: false}, "d1", "t1")
	if len(alerts) != 0 {
		t.Errorf("expected 0 alerts for ignition off, got %d", len(alerts))
	}
}

func TestEvaluateBatteryRule(t *testing.T) {
	engine := NewEngine()
	engine.UpdateRules([]Rule{
		{ID: "r3", TenantID: "t1", DeviceID: "", Type: "battery", Config: map[string]any{"min_battery": float64(11.0)}},
	})

	alerts := engine.Evaluate(&protocol.Position{IMEI: "imei1", Battery: 10.5}, "d1", "t1")
	if len(alerts) != 1 {
		t.Fatalf("expected 1 alert for low battery, got %d", len(alerts))
	}
	if alerts[0].Severity != "critical" {
		t.Errorf("expected severity 'critical', got %q", alerts[0].Severity)
	}

	alerts = engine.Evaluate(&protocol.Position{IMEI: "imei1", Battery: 12.5}, "d1", "t1")
	if len(alerts) != 0 {
		t.Errorf("expected 0 alerts for good battery, got %d", len(alerts))
	}
}

func TestEvaluateDeviceSpecificRule(t *testing.T) {
	engine := NewEngine()
	engine.UpdateRules([]Rule{
		{ID: "r4", TenantID: "t1", DeviceID: "d1", Type: "speed", Config: map[string]any{"max_speed": float64(80)}},
	})

	alerts := engine.Evaluate(&protocol.Position{IMEI: "imei1", Speed: 90}, "d1", "t1")
	if len(alerts) != 1 {
		t.Fatalf("expected 1 alert for matching device, got %d", len(alerts))
	}

	alerts = engine.Evaluate(&protocol.Position{IMEI: "imei2", Speed: 90}, "d2", "t1")
	if len(alerts) != 0 {
		t.Errorf("expected 0 alerts for different device, got %d", len(alerts))
	}
}
