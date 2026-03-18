package storage

import (
	"bufio"
	"encoding/json"
	"log/slog"
	"os"
	"sync"

	"github.com/otavioajr/tracker/gateway/internal/protocol"
)

// Buffer is an in-memory ring buffer for positions with disk fallback.
type Buffer struct {
	mu           sync.Mutex
	positions    []*protocol.Position
	capacity     int
	fallbackPath string
}

// NewBuffer creates a buffer. If fallbackPath is set, positions that exceed
// capacity are spilled to disk, and on creation any existing fallback file is loaded.
func NewBuffer(capacity int, fallbackPath string) *Buffer {
	b := &Buffer{
		positions:    make([]*protocol.Position, 0, capacity),
		capacity:     capacity,
		fallbackPath: fallbackPath,
	}

	if fallbackPath != "" {
		b.loadFromDisk()
	}

	return b
}

// Enqueue adds a position. If at capacity, oldest is dropped (or spilled to disk).
func (b *Buffer) Enqueue(pos *protocol.Position) {
	b.mu.Lock()
	defer b.mu.Unlock()

	if len(b.positions) >= b.capacity {
		if b.fallbackPath != "" {
			b.appendToDisk(b.positions[0])
			b.positions = b.positions[1:]
		} else {
			b.positions = b.positions[1:]
		}
	}

	b.positions = append(b.positions, pos)
}

// EnqueueBatch adds multiple positions.
func (b *Buffer) EnqueueBatch(positions []*protocol.Position) {
	for _, pos := range positions {
		b.Enqueue(pos)
	}
}

// Drain removes and returns up to n positions from the buffer.
func (b *Buffer) Drain(n int) []*protocol.Position {
	b.mu.Lock()
	defer b.mu.Unlock()

	if n > len(b.positions) {
		n = len(b.positions)
	}
	if n == 0 {
		return nil
	}

	drained := make([]*protocol.Position, n)
	copy(drained, b.positions[:n])
	b.positions = b.positions[n:]

	return drained
}

// Size returns the number of positions in the buffer.
func (b *Buffer) Size() int {
	b.mu.Lock()
	defer b.mu.Unlock()
	return len(b.positions)
}

func (b *Buffer) appendToDisk(pos *protocol.Position) {
	f, err := os.OpenFile(b.fallbackPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		slog.Error("buffer: failed to open fallback file", "error", err)
		return
	}
	defer f.Close()

	data, err := json.Marshal(pos)
	if err != nil {
		slog.Error("buffer: failed to marshal position", "error", err)
		return
	}
	f.Write(data)
	f.Write([]byte("\n"))
}

func (b *Buffer) loadFromDisk() {
	f, err := os.Open(b.fallbackPath)
	if err != nil {
		return
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	count := 0
	for scanner.Scan() {
		var pos protocol.Position
		if err := json.Unmarshal(scanner.Bytes(), &pos); err != nil {
			slog.Error("buffer: failed to unmarshal position from disk", "error", err)
			continue
		}
		b.positions = append(b.positions, &pos)
		count++
	}

	if count > 0 {
		slog.Info("buffer: loaded positions from disk", "count", count)
		os.Remove(b.fallbackPath)
	}
}
