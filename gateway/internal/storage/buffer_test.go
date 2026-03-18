package storage

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/otavioajr/tracker/gateway/internal/protocol"
)

func makeTestPosition(imei string) *protocol.Position {
	return &protocol.Position{
		IMEI:       imei,
		Latitude:   -23.55,
		Longitude:  -46.63,
		Speed:      60.0,
		DeviceTime: time.Date(2026, 3, 18, 10, 0, 0, 0, time.UTC),
		RawData:    "test",
	}
}

func TestBuffer_EnqueueAndDrain(t *testing.T) {
	buf := NewBuffer(100, "")

	buf.Enqueue(makeTestPosition("imei1"))
	buf.Enqueue(makeTestPosition("imei2"))

	positions := buf.Drain(10)
	if len(positions) != 2 {
		t.Fatalf("expected 2 positions, got %d", len(positions))
	}

	positions = buf.Drain(10)
	if len(positions) != 0 {
		t.Errorf("expected 0 positions after drain, got %d", len(positions))
	}
}

func TestBuffer_CapacityLimit(t *testing.T) {
	buf := NewBuffer(3, "")

	for i := 0; i < 5; i++ {
		buf.Enqueue(makeTestPosition("imei"))
	}

	positions := buf.Drain(10)
	if len(positions) != 3 {
		t.Fatalf("expected 3 positions (capacity), got %d", len(positions))
	}
}

func TestBuffer_DiskFallback(t *testing.T) {
	dir := t.TempDir()
	fallbackPath := filepath.Join(dir, "buffer.jsonl")
	buf := NewBuffer(2, fallbackPath)

	for i := 0; i < 5; i++ {
		buf.Enqueue(makeTestPosition("imei"))
	}

	data, err := os.ReadFile(fallbackPath)
	if err != nil {
		t.Fatalf("expected disk fallback file: %v", err)
	}
	if len(data) == 0 {
		t.Error("expected non-empty disk fallback file")
	}
}

func TestBuffer_LoadFromDisk(t *testing.T) {
	dir := t.TempDir()
	fallbackPath := filepath.Join(dir, "buffer.jsonl")

	buf1 := NewBuffer(2, fallbackPath)
	for i := 0; i < 4; i++ {
		buf1.Enqueue(makeTestPosition("imei"))
	}

	buf2 := NewBuffer(10, fallbackPath)
	positions := buf2.Drain(10)

	if len(positions) < 2 {
		t.Errorf("expected at least 2 positions from disk, got %d", len(positions))
	}
}

func TestBuffer_Size(t *testing.T) {
	buf := NewBuffer(100, "")
	if buf.Size() != 0 {
		t.Errorf("expected size 0, got %d", buf.Size())
	}

	buf.Enqueue(makeTestPosition("imei"))
	if buf.Size() != 1 {
		t.Errorf("expected size 1, got %d", buf.Size())
	}
}
