package protocol

import (
	"bufio"
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"io"
	"time"
)

const (
	stx = 0x02
	etx = 0x03

	hdrStatusReport    = 0x10
	hdrEmergencyReport = 0x13
	hdrAlertReport     = 0x15

	// Minimum ZIP frame: STX(1) + LEN(2) + HDR(1) + DEV_ID(5) + MODEL(1) + ETX(1) = 11
	minBinaryFrameLen = 11
)

// SuntechBinaryParser decodes Suntech ST300/ST310 binary (ZIP) frames.
type SuntechBinaryParser struct{}

func NewSuntechBinaryParser() *SuntechBinaryParser {
	return &SuntechBinaryParser{}
}

func (p *SuntechBinaryParser) Name() string { return "suntech-binary" }

func (p *SuntechBinaryParser) Identify(data []byte) bool {
	return len(data) >= minBinaryFrameLen && data[0] == stx
}

func (p *SuntechBinaryParser) ReadFrame(reader *bufio.Reader) ([]byte, error) {
	header := make([]byte, 3)
	if _, err := io.ReadFull(reader, header); err != nil {
		return nil, fmt.Errorf("binary frame header: %w", err)
	}
	if header[0] != stx {
		return nil, fmt.Errorf("binary frame: expected STX, got 0x%02x", header[0])
	}
	payloadLen := int(binary.BigEndian.Uint16(header[1:3]))
	if payloadLen <= 0 || payloadLen > 4096 {
		return nil, fmt.Errorf("binary frame: invalid length %d", payloadLen)
	}
	rest := make([]byte, payloadLen+1)
	if _, err := io.ReadFull(reader, rest); err != nil {
		return nil, fmt.Errorf("binary frame payload: %w", err)
	}
	frame := make([]byte, 3+payloadLen+1)
	copy(frame, header)
	copy(frame[3:], rest)
	return frame, nil
}

func (p *SuntechBinaryParser) Parse(data []byte, session *Session) (*Position, error) {
	if len(data) < minBinaryFrameLen {
		return nil, fmt.Errorf("suntech-binary: frame too short (%d bytes)", len(data))
	}

	if data[0] != stx {
		return nil, fmt.Errorf("suntech-binary: missing STX")
	}

	payloadLen := int(binary.BigEndian.Uint16(data[1:3]))
	frameLen := 1 + 2 + payloadLen + 1 // STX + LEN + payload + ETX
	if len(data) < frameLen {
		return nil, fmt.Errorf("suntech-binary: frame truncated (have %d, need %d)", len(data), frameLen)
	}

	if data[frameLen-1] != etx {
		return nil, fmt.Errorf("suntech-binary: missing ETX at offset %d", frameLen-1)
	}

	payload := data[3 : 3+payloadLen]

	hdr := payload[0]
	_ = hdr // HDR type (0x10=STT, 0x13=EMG, 0x15=ALT) — all contain position

	// Device ID: 5 bytes BCD → 10 hex chars, use first 9
	devIDBytes := payload[1:6]
	devID := hex.EncodeToString(devIDBytes)
	if len(devID) > 9 {
		devID = devID[:9]
	}

	// Skip MODEL(1) + SW_VER(2) — offsets 6, 7-8
	if len(payload) < 36 {
		return nil, fmt.Errorf("suntech-binary: payload too short for position data (%d bytes)", len(payload))
	}

	// DateTime: 6 bytes at offset 9-14 (Year, Month, Day, Hour, Min, Sec)
	year := 2000 + int(payload[9])
	month := int(payload[10])
	day := int(payload[11])
	hour := int(payload[12])
	min := int(payload[13])
	sec := int(payload[14])
	deviceTime := time.Date(year, time.Month(month), day, hour, min, sec, 0, time.UTC)

	// Skip CELL(3) at offset 15-17

	// Latitude: offset 18-21 (1 byte int + 3 bytes BCD fractional)
	lat := decodeCoordUnsigned(payload[18:22])

	// Longitude: offset 22-25 (1 byte int + 3 bytes BCD fractional)
	lon := decodeCoordUnsigned(payload[22:26])

	// Speed: offset 26-28 (2 bytes uint16 integer + 1 byte BCD fractional in .XX)
	speedInt := int(binary.BigEndian.Uint16(payload[26:28]))
	speedFrac := decodeBCDByte(payload[28])
	speed := float64(speedInt) + float64(speedFrac)/100.0

	// Course: offset 29-31 (2 bytes uint16 integer + 1 byte BCD fractional)
	courseInt := int(binary.BigEndian.Uint16(payload[29:31]))
	courseFrac := decodeBCDByte(payload[31])
	heading := float64(courseInt) + float64(courseFrac)/100.0

	// SATT_FIX byte at offset 32:
	//   bit 7: GPS fix valid
	//   bit 6: 1 = south (negate latitude)
	//   bit 5: 1 = west (negate longitude)
	//   bits 4-0: satellite count
	sattFix := payload[32]
	sats := int(sattFix & 0x1F)
	if sattFix&0x40 != 0 {
		lat = -lat
	}
	if sattFix&0x20 != 0 {
		lon = -lon
	}

	// After SATT(1) at 32: DIST(4) at 33-36, PWR(2) at 37-38, I/O(1) at 39
	ignition := false
	if len(payload) > 39 {
		ignition = payload[39]&0x01 == 1
	}

	return &Position{
		IMEI:       devID,
		Latitude:   lat,
		Longitude:  lon,
		Speed:      speed,
		Heading:    heading,
		Satellites: sats,
		Ignition:   ignition,
		DeviceTime: deviceTime,
		RawData:    hex.EncodeToString(data[:frameLen]),
	}, nil
}

func (p *SuntechBinaryParser) ACK(data []byte, session *Session) []byte {
	return nil
}

// decodeCoordUnsigned decodes a 4-byte coordinate (1 byte integer + 3 bytes BCD fractional).
// Sign is determined externally from the SATT_FIX byte.
func decodeCoordUnsigned(b []byte) float64 {
	degrees := int(b[0])
	frac := decodeBCD3(b[1:4])
	return float64(degrees) + float64(frac)/1000000.0
}

// decodeBCD3 decodes 3 BCD-encoded bytes into a 6-digit integer.
// e.g., [0x61, 0x70, 0x65] → 617065
func decodeBCD3(b []byte) int {
	result := 0
	for _, v := range b {
		hi := int(v >> 4)
		lo := int(v & 0x0F)
		result = result*100 + hi*10 + lo
	}
	return result
}

// decodeBCDByte decodes a single BCD byte into a 2-digit integer.
// e.g., 0x35 → 35
func decodeBCDByte(b byte) int {
	return int(b>>4)*10 + int(b&0x0F)
}
