package alerts

import (
	"testing"
)

func TestParseRuleRows(t *testing.T) {
	rows := []ruleRow{
		{ID: "r1", TenantID: "t1", DeviceID: nil, Type: "speed", Config: `{"max_speed": 120}`, Active: true},
		{ID: "r2", TenantID: "t1", DeviceID: strPtr("d1"), Type: "ignition", Config: `{}`, Active: true},
		{ID: "r3", TenantID: "t1", DeviceID: nil, Type: "speed", Config: `{"max_speed": 80}`, Active: false},
	}

	rules := parseRuleRows(rows)

	if len(rules) != 2 {
		t.Fatalf("expected 2 active rules, got %d", len(rules))
	}
	if rules[0].ID != "r1" {
		t.Errorf("expected first rule ID 'r1', got %q", rules[0].ID)
	}
	if rules[1].DeviceID != "d1" {
		t.Errorf("expected second rule DeviceID 'd1', got %q", rules[1].DeviceID)
	}
}

func strPtr(s string) *string { return &s }
