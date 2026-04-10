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

func TestRegistryGet(t *testing.T) {
	registry := NewRegistry(NewSuntechParser(), NewGT06Parser(), NewSuntechBinaryParser())

	if got := registry.Get("gt06"); got == nil || got.Name() != "gt06" {
		t.Fatalf("Get(\"gt06\") = %#v, want parser named \"gt06\"", got)
	}
	if got := registry.Get("suntech-binary"); got == nil || got.Name() != "suntech-binary" {
		t.Fatalf("Get(\"suntech-binary\") = %#v, want parser named \"suntech-binary\"", got)
	}
	if got := registry.Get("unknown"); got != nil {
		t.Errorf("Get(\"unknown\") = %#v, want nil", got)
	}
}

func TestRegistryFindUsesDetectorWith4BytePeek(t *testing.T) {
	registry := NewRegistry(NewSuntechParser())

	peekST30 := []byte("ST30")
	if got := registry.Find(peekST30); got == nil || got.Name() != "suntech" {
		t.Fatalf("Registry.Find(ST30) = %#v, want parser named \"suntech\"", got)
	}

	peekST34 := []byte("ST34")
	if got := registry.Find(peekST34); got == nil || got.Name() != "suntech" {
		t.Fatalf("Registry.Find(ST34) = %#v, want parser named \"suntech\"", got)
	}
}
