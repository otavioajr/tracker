package suntech

import (
	"strings"
	"testing"
)

func TestGenerateSTT(t *testing.T) {
	msg := GenerateSTT("123456789012345", -23.55, -46.63, 60.5, 180.0, true)

	if !strings.HasPrefix(msg, "ST300STT;") {
		t.Errorf("message should start with ST300STT;, got %q", msg[:20])
	}

	parts := strings.Split(msg, ";")
	if parts[1] != "123456789012345" {
		t.Errorf("IMEI = %q, want %q", parts[1], "123456789012345")
	}

	if !strings.HasSuffix(msg, "\r\n") {
		t.Error("message should end with \\r\\n")
	}
}

func TestGenerateRoute(t *testing.T) {
	points := GenerateRoute(-23.55, -46.63, -23.56, -46.64, 5)

	if len(points) != 5 {
		t.Fatalf("expected 5 points, got %d", len(points))
	}

	if points[0].Lat != -23.55 || points[0].Lon != -46.63 {
		t.Errorf("first point should be start coordinates")
	}

	if points[4].Lat != -23.56 || points[4].Lon != -46.64 {
		t.Errorf("last point should be end coordinates")
	}
}
