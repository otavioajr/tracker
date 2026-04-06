package protocol

import (
	"bufio"
	"fmt"
	"strconv"
	"strings"
	"time"
)

const (
	suntechMinFields = 13
	suntechPrefix300 = "ST300"
	suntechPrefix340 = "ST340"
)

type SuntechParser struct{}

func NewSuntechParser() *SuntechParser {
	return &SuntechParser{}
}

func (p *SuntechParser) Name() string { return "suntech" }

func (p *SuntechParser) Identify(data []byte) bool {
	s := string(data)
	return strings.HasPrefix(s, suntechPrefix300) || strings.HasPrefix(s, suntechPrefix340)
}

func (p *SuntechParser) ReadFrame(reader *bufio.Reader) ([]byte, error) {
	line, err := reader.ReadBytes('\n')
	if err != nil {
		return nil, err
	}
	for len(line) > 0 && (line[len(line)-1] == '\n' || line[len(line)-1] == '\r') {
		line = line[:len(line)-1]
	}
	return line, nil
}

func (p *SuntechParser) Parse(data []byte, session *Session) (*Position, error) {
	raw := strings.TrimRight(string(data), "\r\n")
	fields := strings.Split(raw, ";")

	if len(fields) < suntechMinFields {
		return nil, fmt.Errorf("suntech: expected at least %d fields, got %d", suntechMinFields, len(fields))
	}

	imei := fields[1]

	lat, err := strconv.ParseFloat(fields[7], 64)
	if err != nil {
		return nil, fmt.Errorf("suntech: invalid latitude %q: %w", fields[7], err)
	}

	lon, err := strconv.ParseFloat(fields[8], 64)
	if err != nil {
		return nil, fmt.Errorf("suntech: invalid longitude %q: %w", fields[8], err)
	}

	speed, err := strconv.ParseFloat(fields[9], 64)
	if err != nil {
		return nil, fmt.Errorf("suntech: invalid speed %q: %w", fields[9], err)
	}

	heading, err := strconv.ParseFloat(fields[10], 64)
	if err != nil {
		return nil, fmt.Errorf("suntech: invalid heading %q: %w", fields[10], err)
	}

	sats, err := strconv.Atoi(fields[11])
	if err != nil {
		return nil, fmt.Errorf("suntech: invalid satellites %q: %w", fields[11], err)
	}

	ignition := false
	if len(fields) > 13 {
		ignition = fields[13] == "1"
	}

	var battery float64
	if len(fields) > 14 {
		battery, _ = strconv.ParseFloat(fields[14], 64)
	}

	deviceTime, err := time.Parse("20060102;15:04:05", fields[4]+";"+fields[5])
	if err != nil {
		return nil, fmt.Errorf("suntech: invalid datetime %q;%q: %w", fields[4], fields[5], err)
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
