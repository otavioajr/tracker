package storage

import (
	"strings"
	"testing"
	"time"

	"github.com/otavioajr/tracker/gateway/internal/protocol"
)

func ptrStr(s string) *string { return &s }

func TestBuildBatchSQL(t *testing.T) {
	positions := []*protocol.Position{
		{
			IMEI:       "123456789012345",
			Latitude:   -23.55,
			Longitude:  -46.63,
			Speed:      60.0,
			Heading:    180.0,
			Satellites: 10,
			Ignition:   true,
			DeviceTime: time.Date(2026, 3, 18, 10, 0, 0, 0, time.UTC),
			RawData:    "raw1",
		},
		{
			IMEI:       "123456789012346",
			Latitude:   -23.56,
			Longitude:  -46.64,
			Speed:      0.0,
			Heading:    0.0,
			Satellites: 8,
			Ignition:   false,
			DeviceTime: time.Date(2026, 3, 18, 10, 1, 0, 0, time.UTC),
			RawData:    "raw2",
		},
	}

	devices := map[string]DeviceInfo{
		"123456789012345": {DeviceID: "d0000000-0000-0000-0000-000000000001", TenantID: "a0000000-0000-0000-0000-000000000001", VehicleID: ptrStr("v0000000-0000-0000-0000-000000000001")},
		"123456789012346": {DeviceID: "d0000000-0000-0000-0000-000000000002", TenantID: "a0000000-0000-0000-0000-000000000001", VehicleID: nil},
	}

	sql, args := buildBatchInsert(positions, devices)

	if sql == "" {
		t.Fatal("expected non-empty SQL")
	}
	if !strings.Contains(sql, "vehicle_id") {
		t.Error("expected SQL to contain vehicle_id")
	}
	// 2 positions × 12 args each = 24 args
	if len(args) != 24 {
		t.Errorf("expected 24 args, got %d", len(args))
	}
}

func TestLookupDevice_DualKey(t *testing.T) {
	info := DeviceInfo{DeviceID: "d1", TenantID: "t1"}
	w := &Writer{
		devices: map[string]DeviceInfo{
			"imei123":   info,
			"serial456": info,
		},
	}
	got, ok := w.LookupDevice("imei123")
	if !ok {
		t.Fatal("expected found by IMEI")
	}
	if got.DeviceID != "d1" {
		t.Errorf("got %s", got.DeviceID)
	}
	_, ok = w.LookupDevice("serial456")
	if !ok {
		t.Fatal("expected found by serial")
	}
	_, ok = w.LookupDevice("unknown")
	if ok {
		t.Fatal("expected not found")
	}
}

func TestBuildBatchSQL_SkipsUnknownDevices(t *testing.T) {
	positions := []*protocol.Position{
		{IMEI: "unknown_imei", Latitude: -23.55, Longitude: -46.63, DeviceTime: time.Now(), RawData: "raw"},
	}

	sql, args := buildBatchInsert(positions, map[string]DeviceInfo{})
	if sql != "" {
		t.Error("expected empty SQL when all devices are unknown")
	}
	if len(args) != 0 {
		t.Errorf("expected 0 args, got %d", len(args))
	}
}
