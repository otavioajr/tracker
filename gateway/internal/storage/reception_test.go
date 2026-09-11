package storage

import (
	"strings"
	"testing"
	"time"

	"github.com/otavioajr/tracker/gateway/internal/protocol"
)

func TestBuildBatchInsertPersistsReceivedAtAndDedups(t *testing.T) {
	received := time.Date(2026, 9, 11, 12, 0, 0, 0, time.UTC)
	pos := &protocol.Position{
		IMEI:       "123456789012345",
		Latitude:   -23.55,
		Longitude:  -46.63,
		DeviceTime: time.Date(2026, 9, 11, 11, 59, 0, 0, time.UTC),
		ReceivedAt: received,
		RawData:    "raw",
	}
	devices := map[string]DeviceInfo{
		"123456789012345": {DeviceID: "d1", TenantID: "t1"},
	}
	sql, args := buildBatchInsert([]*protocol.Position{pos, pos}, devices)
	if !strings.Contains(sql, "received_at") || len(args) != 13 {
		t.Fatalf("dedup or received_at missing: %s %d", sql, len(args))
	}
	if got, ok := args[12].(time.Time); !ok || !got.Equal(received) {
		t.Fatalf("received_at = %v", args[12])
	}
}
