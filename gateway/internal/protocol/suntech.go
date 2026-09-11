package protocol

import (
	"bufio"
	"bytes"
	"fmt"
	"strconv"
	"strings"
	"time"
)

const (
	suntechMinFieldsLegacy  = 13
	suntechMinFieldsCompact = 28
	suntechPrefix300        = "ST300"
	suntechPrefix340        = "ST340"
	suntechPrefixSTT        = "STT;"
	suntechPrefix30         = "ST30"
	suntechPrefix34         = "ST34"
	suntechMaxFrameBytes    = 4096
)

type SuntechParser struct{}

func NewSuntechParser() *SuntechParser {
	return &SuntechParser{}
}

func (p *SuntechParser) Name() string { return "suntech" }

func (p *SuntechParser) Identify(data []byte) bool {
	s := string(data)
	return strings.HasPrefix(s, suntechPrefixSTT) ||
		strings.HasPrefix(s, suntechPrefix300) ||
		strings.HasPrefix(s, suntechPrefix340) ||
		strings.HasPrefix(s, suntechPrefix30) ||
		strings.HasPrefix(s, suntechPrefix34)
}

func (p *SuntechParser) ReadFrame(reader *bufio.Reader) ([]byte, error) {
	var frame []byte
	for {
		b, err := reader.ReadByte()
		if err != nil {
			if len(frame) == 0 {
				return nil, err
			}
			// Incomplete: a CR/LF-less leftover must not become a position.
			return nil, fmt.Errorf("suntech: incomplete frame: %w", err)
		}
		if b == '\n' {
			if n := len(frame); n > 0 && frame[n-1] == '\r' {
				frame = frame[:n-1]
			}
			return frame, nil
		}
		if b == '\r' {
			// Only consume LF if it is already buffered. Peek would block on a live TCP socket.
			if reader.Buffered() > 0 {
				if next, err := reader.Peek(1); err == nil && next[0] == '\n' {
					_, _ = reader.ReadByte()
				}
			}
			return frame, nil
		}
		if len(frame) >= suntechMaxFrameBytes {
			return nil, fmt.Errorf("suntech: frame exceeds %d bytes", suntechMaxFrameBytes)
		}
		frame = append(frame, b)
	}
}

func (p *SuntechParser) Parse(data []byte, session *Session) (*Position, error) {
	if bytes.IndexByte(data, '\r') >= 0 || bytes.IndexByte(data, '\n') >= 0 {
		return nil, fmt.Errorf("suntech: frame contains an internal delimiter")
	}
	raw := string(data)
	fields := strings.Split(raw, ";")

	isCompact := strings.HasPrefix(raw, suntechPrefixSTT)
	requiredFields := suntechMinFieldsLegacy
	if isCompact {
		requiredFields = suntechMinFieldsCompact
	}

	if len(fields) < requiredFields {
		return nil, fmt.Errorf("suntech: expected at least %d fields, got %d", requiredFields, len(fields))
	}

	latIdx := 7
	lonIdx := 8
	speedIdx := 9
	headingIdx := 10
	satsIdx := 11
	ignitionIdx := 13
	batteryIdx := 14
	dateIdx := 4
	timeIdx := 5

	if isCompact {
		latIdx = 13
		lonIdx = 14
		speedIdx = 15
		headingIdx = 16
		satsIdx = 17
		ignitionIdx = 18
		batteryIdx = 27
		dateIdx = 6
		timeIdx = 7
	}

	imei := fields[1]

	lat, err := strconv.ParseFloat(fields[latIdx], 64)
	if err != nil {
		return nil, fmt.Errorf("suntech: invalid latitude %q: %w", fields[latIdx], err)
	}

	lon, err := strconv.ParseFloat(fields[lonIdx], 64)
	if err != nil {
		return nil, fmt.Errorf("suntech: invalid longitude %q: %w", fields[lonIdx], err)
	}

	speed, err := strconv.ParseFloat(fields[speedIdx], 64)
	if err != nil {
		return nil, fmt.Errorf("suntech: invalid speed %q: %w", fields[speedIdx], err)
	}

	heading, err := strconv.ParseFloat(fields[headingIdx], 64)
	if err != nil {
		return nil, fmt.Errorf("suntech: invalid heading %q: %w", fields[headingIdx], err)
	}

	sats, err := strconv.Atoi(fields[satsIdx])
	if err != nil {
		return nil, fmt.Errorf("suntech: invalid satellites %q: %w", fields[satsIdx], err)
	}

	ignition := false
	if len(fields) > ignitionIdx {
		ignition = fields[ignitionIdx] == "1"
	}

	var battery float64
	if len(fields) > batteryIdx {
		battery, _ = strconv.ParseFloat(fields[batteryIdx], 64)
	}

	deviceTime, err := time.Parse("20060102;15:04:05", fields[dateIdx]+";"+fields[timeIdx])
	if err != nil {
		return nil, fmt.Errorf("suntech: invalid datetime %q;%q: %w", fields[dateIdx], fields[timeIdx], err)
	}

	return &Position{
		IMEI:       imei,
		Latitude:   lat,
		Longitude:  lon,
		Speed:      speed,
		Heading:    heading,
		Satellites: sats,
		Ignition:   ignition,
		Battery:    battery,
		DeviceTime: deviceTime,
		RawData:    raw,
	}, nil
}

func (p *SuntechParser) ACK(data []byte, session *Session) []byte {
	return nil
}
