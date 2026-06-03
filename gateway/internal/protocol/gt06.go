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
	gt06StartShort = 0x7878
	gt06StartLong  = 0x7979

	gt06ProtoLogin     = 0x01
	gt06ProtoGPS       = 0x12
	gt06ProtoHeartbeat = 0x13
	gt06ProtoGPSLBS    = 0x22
	gt06ProtoAlarm     = 0x26

	gt06StopHi = 0x0D
	gt06StopLo = 0x0A

	// sessionKeyIgnition stores the last-known ACC/ignition state (bool) parsed
	// from a 0x13 status packet, applied to subsequent GPS positions.
	sessionKeyIgnition = "ignition"
)

// GT06Parser decodes the Concox/GT06 binary protocol used by GF07, GT02,
// GT06N and similar cheap Chinese GPS trackers.
type GT06Parser struct{}

func NewGT06Parser() *GT06Parser {
	return &GT06Parser{}
}

func (p *GT06Parser) Name() string { return "gt06" }

func (p *GT06Parser) Identify(data []byte) bool {
	if len(data) < 2 {
		return false
	}
	return (data[0] == 0x78 && data[1] == 0x78) || (data[0] == 0x79 && data[1] == 0x79)
}

// ReadFrame reads a complete GT06 frame from the reader.
//
// Short packet layout: 0x78 0x78 [1-byte length] [content] [CRC-2] [0x0D 0x0A]
// Long packet layout:  0x79 0x79 [2-byte length] [content] [CRC-2] [0x0D 0x0A]
//
// The length field value covers content + CRC (i.e., all bytes between the
// length field and the stop bytes).
func (p *GT06Parser) ReadFrame(reader *bufio.Reader) ([]byte, error) {
	// Read start bytes
	start := make([]byte, 2)
	if _, err := io.ReadFull(reader, start); err != nil {
		return nil, fmt.Errorf("gt06: read start: %w", err)
	}

	isShort := start[0] == 0x78 && start[1] == 0x78
	isLong := start[0] == 0x79 && start[1] == 0x79
	if !isShort && !isLong {
		return nil, fmt.Errorf("gt06: invalid start bytes 0x%02x%02x", start[0], start[1])
	}

	// Read length field
	var lengthFieldVal int
	if isShort {
		lenByte := make([]byte, 1)
		if _, err := io.ReadFull(reader, lenByte); err != nil {
			return nil, fmt.Errorf("gt06: read length: %w", err)
		}
		lengthFieldVal = int(lenByte[0])
	} else {
		lenBytes := make([]byte, 2)
		if _, err := io.ReadFull(reader, lenBytes); err != nil {
			return nil, fmt.Errorf("gt06: read length: %w", err)
		}
		lengthFieldVal = int(binary.BigEndian.Uint16(lenBytes))
	}

	if lengthFieldVal < 3 || lengthFieldVal > 4096 {
		return nil, fmt.Errorf("gt06: invalid length field %d", lengthFieldVal)
	}

	// The length field covers content + CRC. After that come 2 stop bytes.
	remaining := lengthFieldVal + 2 // +2 for stop bytes 0x0D 0x0A
	rest := make([]byte, remaining)
	if _, err := io.ReadFull(reader, rest); err != nil {
		return nil, fmt.Errorf("gt06: read content: %w", err)
	}

	// Verify stop bits
	if rest[remaining-2] != gt06StopHi || rest[remaining-1] != gt06StopLo {
		return nil, fmt.Errorf("gt06: invalid stop bytes 0x%02x%02x", rest[remaining-2], rest[remaining-1])
	}

	// Assemble full frame
	var frame []byte
	if isShort {
		frame = make([]byte, 2+1+remaining) // start(2) + len_field(1) + rest
		copy(frame, start)
		frame[2] = byte(lengthFieldVal)
		copy(frame[3:], rest)
	} else {
		frame = make([]byte, 2+2+remaining) // start(2) + len_field(2) + rest
		copy(frame, start)
		binary.BigEndian.PutUint16(frame[2:4], uint16(lengthFieldVal))
		copy(frame[4:], rest)
	}

	return frame, nil
}

// Parse decodes a GT06 frame and returns a Position (or nil for non-position messages).
func (p *GT06Parser) Parse(data []byte, session *Session) (*Position, error) {
	if len(data) < 10 { // minimum: start(2)+len(1)+proto(1)+serial(2)+crc(2)+stop(2)
		return nil, fmt.Errorf("gt06: frame too short (%d bytes)", len(data))
	}

	isShort := data[0] == 0x78 && data[1] == 0x78
	isLong := data[0] == 0x79 && data[1] == 0x79
	if !isShort && !isLong {
		return nil, fmt.Errorf("gt06: invalid start bytes")
	}

	// The length field covers content + CRC(2).
	// Content = everything between length field and CRC.
	var contentStart int
	var lengthFieldVal int
	if isShort {
		lengthFieldVal = int(data[2])
		contentStart = 3
	} else {
		lengthFieldVal = int(binary.BigEndian.Uint16(data[2:4]))
		contentStart = 4
	}

	contentLen := lengthFieldVal - 2 // subtract CRC(2)
	if contentLen < 1 {
		return nil, fmt.Errorf("gt06: content length too small")
	}
	if contentStart+lengthFieldVal+2 > len(data) { // +2 for stop bytes
		return nil, fmt.Errorf("gt06: frame truncated")
	}

	content := data[contentStart : contentStart+contentLen]
	proto := content[0]

	switch proto {
	case gt06ProtoLogin:
		return p.parseLogin(content[1:], session)
	case gt06ProtoGPS, gt06ProtoGPSLBS, gt06ProtoAlarm:
		return p.parseGPS(content[1:], session)
	case gt06ProtoHeartbeat:
		return p.parseStatus(content[1:], session)
	default:
		// Unknown protocol number — silently skip
		return nil, nil
	}
}

// parseStatus decodes a 0x13 status/heartbeat packet. It carries no position,
// but its terminal-information byte holds the ACC (ignition) state in bit 1.
// The state is remembered in the session and applied to later GPS packets,
// because the J16 reports position (0x12) and ACC (0x13) in separate frames.
func (p *GT06Parser) parseStatus(data []byte, session *Session) (*Position, error) {
	if len(data) < 1 {
		return nil, nil
	}
	if session.Data == nil {
		session.Data = make(map[string]any)
	}
	// Terminal information byte: bit 1 (0x02) = ACC, 1 = on (ignition).
	session.Data[sessionKeyIgnition] = data[0]&0x02 != 0
	return nil, nil
}

func (p *GT06Parser) parseLogin(data []byte, session *Session) (*Position, error) {
	// Login content (after protocol byte): IMEI(8 BCD) + optional extra + serial(2)
	// We need at least 8 bytes for IMEI BCD
	if len(data) < 8 {
		return nil, fmt.Errorf("gt06: login packet too short (%d bytes)", len(data))
	}

	// 8 bytes BCD → 16 hex chars → strip leading '0' → 15-digit IMEI
	imeiHex := hex.EncodeToString(data[:8])
	imei := imeiHex
	for len(imei) > 0 && imei[0] == '0' {
		imei = imei[1:]
	}

	session.IMEI = imei
	if session.Data == nil {
		session.Data = make(map[string]any)
	}

	return nil, nil
}

func (p *GT06Parser) parseGPS(data []byte, session *Session) (*Position, error) {
	// GPS data format (after protocol byte):
	// 0-5:   DateTime (YY MM DD HH MM SS)
	// 6:     high nibble = satellite count
	// 7-10:  Latitude uint32 (unit: 1/30000 minute)
	// 11-14: Longitude uint32 (unit: 1/30000 minute)
	// 15:    Speed (km/h)
	// 16-17: Course/status word

	if len(data) < 18 { // 6+1+4+4+1+2 = 18 minimum for GPS portion
		return nil, fmt.Errorf("gt06: GPS data too short (%d bytes)", len(data))
	}

	// DateTime
	year := 2000 + int(data[0])
	month := int(data[1])
	day := int(data[2])
	hour := int(data[3])
	minute := int(data[4])
	sec := int(data[5])
	deviceTime := time.Date(year, time.Month(month), day, hour, minute, sec, 0, time.UTC)

	// Satellites: high nibble of byte 6
	sats := int(data[6] >> 4)

	// Latitude: uint32 in units of 1/30000 minute
	latRaw := binary.BigEndian.Uint32(data[7:11])
	lat := float64(latRaw) / 30000.0 / 60.0

	// Longitude: uint32 in units of 1/30000 minute
	lonRaw := binary.BigEndian.Uint32(data[11:15])
	lon := float64(lonRaw) / 30000.0 / 60.0

	// Speed
	speed := float64(data[15])

	// Course/status word (16-17)
	courseWord := binary.BigEndian.Uint16(data[16:18])
	heading := float64(courseWord & 0x03FF) // bits 0-9: course 0-360

	// Concox/GT06 hemisphere bits (standard convention used by GT06 devices):
	//   bit 10 (0x0400): latitude  — 0 = south (negate), 1 = north
	//   bit 11 (0x0800): longitude — 1 = west (negate),  0 = east
	if courseWord&0x0400 == 0 {
		lat = -lat
	}
	if courseWord&0x0800 != 0 {
		lon = -lon
	}

	// Ignition (ACC) is not present in 0x12 GPS frames; use the last value
	// learned from a 0x13 status packet (defaults to off until one arrives).
	ignition := false
	if session.Data != nil {
		if v, ok := session.Data[sessionKeyIgnition].(bool); ok {
			ignition = v
		}
	}

	return &Position{
		IMEI:       session.IMEI,
		Latitude:   lat,
		Longitude:  lon,
		Speed:      speed,
		Heading:    heading,
		Satellites: sats,
		Ignition:   ignition,
		DeviceTime: deviceTime,
		RawData:    hex.EncodeToString(data),
	}, nil
}

// ACK generates an acknowledgment for login and heartbeat packets.
// Returns nil for packet types that don't require an ACK.
func (p *GT06Parser) ACK(data []byte, session *Session) []byte {
	if len(data) < 10 {
		return nil
	}

	isShort := data[0] == 0x78 && data[1] == 0x78
	isLong := data[0] == 0x79 && data[1] == 0x79
	if !isShort && !isLong {
		return nil
	}

	// Extract content
	var contentStart int
	var lengthFieldVal int
	if isShort {
		lengthFieldVal = int(data[2])
		contentStart = 3
	} else {
		lengthFieldVal = int(binary.BigEndian.Uint16(data[2:4]))
		contentStart = 4
	}

	contentLen := lengthFieldVal - 2 // subtract CRC
	if contentLen < 3 {              // proto(1) + at least serial(2)
		return nil
	}
	if contentStart+lengthFieldVal+2 > len(data) {
		return nil
	}

	content := data[contentStart : contentStart+contentLen]
	proto := content[0]

	// Only ACK login and heartbeat
	if proto != gt06ProtoLogin && proto != gt06ProtoHeartbeat {
		return nil
	}

	// Serial bytes are the last 2 bytes of content
	serialHi := content[len(content)-2]
	serialLo := content[len(content)-1]

	// Build ACK: 0x78 0x78 0x05 [proto] [serial_hi] [serial_lo] [crc_hi] [crc_lo] 0x0D 0x0A
	// The ACK length field is 0x05 = proto(1) + serial(2) + CRC(2)
	// CRC covers bytes from length to serial (inclusive): [0x05, proto, serial_hi, serial_lo]
	crcData := []byte{0x05, proto, serialHi, serialLo}
	crc := crcITU(crcData)

	ack := []byte{
		0x78, 0x78,
		0x05,
		proto,
		serialHi, serialLo,
		byte(crc >> 8), byte(crc & 0xFF),
		gt06StopHi, gt06StopLo,
	}

	return ack
}

// crcITU computes CRC-ITU (CRC-CCITT reflected, polynomial 0x8408, init 0xFFFF, final XOR 0xFFFF).
func crcITU(data []byte) uint16 {
	crc := uint16(0xFFFF)
	for _, b := range data {
		crc ^= uint16(b)
		for i := 0; i < 8; i++ {
			if crc&0x0001 != 0 {
				crc = (crc >> 1) ^ 0x8408
			} else {
				crc >>= 1
			}
		}
	}
	return crc ^ 0xFFFF
}
