package storage

import (
	"testing"
	"time"

	"github.com/otavioajr/tracker/gateway/internal/protocol"
)

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
		"123456789012345": {DeviceID: "d0000000-0000-0000-0000-000000000001", TenantID: "a0000000-0000-0000-0000-000000000001"},
		"123456789012346": {DeviceID: "d0000000-0000-0000-0000-000000000002", TenantID: "a0000000-0000-0000-0000-000000000001"},
	}

	sql, args := buildBatchInsert(positions, devices)

	if sql == "" {
		t.Fatal("expected non-empty SQL")
	}
	if len(args) != 22 {
		t.Errorf("expected 22 args, got %d", len(args))
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
