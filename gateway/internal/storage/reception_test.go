package storage

import (
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/otavioajr/tracker/gateway/internal/protocol"
)

func TestBatchReceptionAndExactDedup(t *testing.T) {
	now := time.Now().UTC()
	first := &protocol.Position{IMEI: "imei", DeviceTime: now, ReceivedAt: now.Add(time.Second), RawData: "one"}
	duplicate := *first
	duplicate.IMEI = "serial"
	duplicate.ReceivedAt = now.Add(2 * time.Second)
	distinct := *first
	distinct.RawData = "two"
	later := *first
	later.DeviceTime = now.Add(time.Second)
	legacy := *first
	legacy.IMEI = "other"
	legacy.ReceivedAt = time.Time{}
	devices := map[string]DeviceInfo{"imei": {DeviceID: "d1"}, "serial": {DeviceID: "d1"}, "other": {DeviceID: "d2"}}
	sql, args := buildBatchInsert([]*protocol.Position{first, &duplicate, &distinct, &later, &legacy}, devices)
	if len(args) != 4*13 {
		t.Fatalf("got %d args, want four distinct rows", len(args))
	}
	if args[12] != first.ReceivedAt || args[51] != nil {
		t.Fatalf("reception not preserved: %v %v", args[12], args[51])
	}
	if strings.Count(sql, "now()") != 4 || !strings.Contains(sql, "received_at") {
		t.Fatal("write/reception clocks mixed")
	}
	// No persistent deduplication: the same frame in a later batch survives.
	_, args = buildBatchInsert([]*protocol.Position{first}, devices)
	if len(args) != 13 {
		t.Fatal("cross-batch suppression")
	}
}

func TestBufferPreservesReceptionAcrossDisk(t *testing.T) {
	path := filepath.Join(t.TempDir(), "positions.jsonl")
	buffer := NewBuffer(1, path)
	pos := makeTestPosition("imei")
	pos.ReceivedAt = time.Now().UTC()
	buffer.Enqueue(pos)
	buffer.Enqueue(makeTestPosition("other"))
	// Overflow persists the oldest entry, including its original reception time.
	restored := NewBuffer(10, path).Drain(10)
	if len(restored) != 1 || !restored[0].ReceivedAt.Equal(pos.ReceivedAt) {
		t.Fatalf("reception lost: %+v", restored)
	}
	legacy := makeTestPosition("legacy")
	buffer.Enqueue(legacy)
	buffer.Enqueue(makeTestPosition("next"))
	restored = NewBuffer(10, path).Drain(10)
	foundLegacy := false
	for _, p := range restored {
		if p.IMEI == "legacy" {
			foundLegacy = true
			if !p.ReceivedAt.IsZero() {
				t.Fatal("invented legacy reception")
			}
		}
	}
	if !foundLegacy {
		t.Fatal("legacy record was not restored")
	}
}
