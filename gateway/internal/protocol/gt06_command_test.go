package protocol

import (
	"bytes"
	"encoding/binary"
	"strings"
	"testing"
)

func TestOnlineCommandFrame(t *testing.T) {
	frame, err := BuildOnlineCommand(0x1234, "STATUS#")
	if err != nil {
		t.Fatal(err)
	}
	// Verify every field independently of the builder, including payload and checksum.
	wantPrefix := []byte{0x78, 0x78, 17, 0x80, 11, 0, 0, 0, 0}
	if !bytes.Equal(frame[:9], wantPrefix) || string(frame[9:16]) != "STATUS#" {
		t.Fatalf("invalid frame: %x", frame)
	}
	if binary.BigEndian.Uint16(frame[16:18]) != 0x1234 || !bytes.Equal(frame[20:], []byte{13, 10}) {
		t.Fatalf("invalid sequence or terminator: %x", frame)
	}
	if binary.BigEndian.Uint16(frame[18:20]) != crcITU(frame[2:18]) {
		t.Fatal("invalid CRC")
	}
}

func TestOnlineCommandLegacyVector(t *testing.T) {
	// Fixed vector independently reconstructed from the installed ELF, not this CRC helper.
	want := []byte{0x78, 0x78, 0x11, 0x80, 0x0b, 0, 0, 0, 0, 0x53, 0x54, 0x41, 0x54, 0x55, 0x53, 0x23, 0, 1, 0x62, 0x9b, 0x0d, 0x0a}
	frame, err := BuildOnlineCommand(1, "STATUS#")
	if err != nil || !bytes.Equal(frame, want) {
		t.Fatalf("legacy vector mismatch: %x, %v", frame, err)
	}
}

func TestOnlineCommandLength(t *testing.T) {
	for _, size := range []int{0, 246} {
		if _, err := BuildOnlineCommand(1, strings.Repeat("A", size)); err == nil {
			t.Fatalf("accepted %d bytes", size)
		}
	}
	frame, err := BuildOnlineCommand(1, strings.Repeat("A", 245))
	if err != nil || frame[2] != 255 {
		t.Fatalf("maximum length: %x, %v", frame, err)
	}
}
