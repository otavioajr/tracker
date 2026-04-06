package protocol

import "testing"

func TestSessionDefaults(t *testing.T) {
	s := &Session{}
	if s.IMEI != "" {
		t.Errorf("new session IMEI should be empty, got %q", s.IMEI)
	}
	if s.Data != nil {
		t.Error("new session Data should be nil")
	}
}

func TestSessionSetGet(t *testing.T) {
	s := &Session{Data: make(map[string]any)}
	s.IMEI = "123456789012345"
	s.Data["logged_in"] = true
	if s.IMEI != "123456789012345" {
		t.Errorf("IMEI = %q, want %q", s.IMEI, "123456789012345")
	}
	if v, ok := s.Data["logged_in"].(bool); !ok || !v {
		t.Error("Data[logged_in] should be true")
	}
}
