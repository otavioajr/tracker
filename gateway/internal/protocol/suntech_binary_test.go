package protocol

import (
	"encoding/hex"
	"testing"
)

func TestSuntechBinaryIdentify(t *testing.T) {
	p := NewSuntechBinaryParser()

	tests := []struct {
		name string
		hex  string
		want bool
	}{
		{"valid STX frame", "02003210511340877028813f180c170016041051290c0635652d793653000038001a30e601665e560000000100750002712704000103", true},
		{"ASCII message", "535433303053545400", false}, // "ST300STT"
		{"too short", "0200", false},
		{"empty", "", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			data, _ := hex.DecodeString(tt.hex)
			got := p.Identify(data)
			if got != tt.want {
				t.Errorf("Identify() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestSuntechBinaryParse(t *testing.T) {
	p := NewSuntechBinaryParser()

	t.Run("Traccar test vector - status report", func(t *testing.T) {
		data, err := hex.DecodeString("02003210511340877028813f180c170016041051290c0635652d793653000038001a30e601665e560000000100750002712704000103")
		if err != nil {
			t.Fatalf("bad hex: %v", err)
		}

		pos, err := p.Parse(data)
		if err != nil {
			t.Fatalf("Parse error: %v", err)
		}

		if pos.IMEI != "511340877" {
			t.Errorf("IMEI = %q, want %q", pos.IMEI, "511340877")
		}

		// SATT_FIX = 0xE6: bit6=south, bit5=west, sats=6
		// Latitude: int=12, BCD=063565 → -12.063565 (south)
		if pos.Latitude > -12.0 || pos.Latitude < -13.0 {
			t.Errorf("Latitude = %f, expected ~-12.063565", pos.Latitude)
		}

		// Longitude: int=45, BCD=793653 → -45.793653 (west)
		if pos.Longitude > -45.0 || pos.Longitude < -46.0 {
			t.Errorf("Longitude = %f, expected ~-45.793653", pos.Longitude)
		}

		if pos.Satellites != 6 {
			t.Errorf("Satellites = %d, want 6", pos.Satellites)
		}

		// DateTime: year=24, month=12, day=23 → 2024-12-23
		if pos.DeviceTime.Year() != 2024 || pos.DeviceTime.Month() != 12 || pos.DeviceTime.Day() != 23 {
			t.Errorf("DeviceTime = %v, expected 2024-12-23", pos.DeviceTime)
		}
	})

	t.Run("real ST310U data - south/west coordinates", func(t *testing.T) {
		data, err := hex.DecodeString("02002b1000707513402801321a031313100d245f2c176164762e73787100000000000060100c02430c680001005503")
		if err != nil {
			t.Fatalf("bad hex: %v", err)
		}

		pos, err := p.Parse(data)
		if err != nil {
			t.Fatalf("Parse error: %v", err)
		}

		if pos.IMEI != "007075134" {
			t.Errorf("IMEI = %q, want %q", pos.IMEI, "007075134")
		}

		// SATT_FIX = 0x60: bit6=south, bit5=west, sats=0
		// Lat should be -23.616476, Lon should be -46.737871
		if pos.Latitude > -23.0 || pos.Latitude < -24.0 {
			t.Errorf("Latitude = %f, expected ~-23.616476", pos.Latitude)
		}
		if pos.Longitude > -46.0 || pos.Longitude < -47.0 {
			t.Errorf("Longitude = %f, expected ~-46.737871", pos.Longitude)
		}
		if pos.Satellites != 0 {
			t.Errorf("Satellites = %d, want 0", pos.Satellites)
		}
		if pos.Ignition {
			t.Error("Ignition = true, want false")
		}
	})

	t.Run("missing STX", func(t *testing.T) {
		data := []byte{0x00, 0x00, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00}
		_, err := p.Parse(data)
		if err == nil {
			t.Error("expected error for missing STX")
		}
	})

	t.Run("truncated frame", func(t *testing.T) {
		data, _ := hex.DecodeString("0200321051134087") // truncated
		_, err := p.Parse(data)
		if err == nil {
			t.Error("expected error for truncated frame")
		}
	})
}

func TestDecodeBCD3(t *testing.T) {
	tests := []struct {
		input    []byte
		expected int
	}{
		{[]byte{0x61, 0x70, 0x65}, 617065},
		{[]byte{0x06, 0x35, 0x65}, 63565},
		{[]byte{0x00, 0x00, 0x00}, 0},
		{[]byte{0x99, 0x99, 0x99}, 999999},
	}

	for _, tt := range tests {
		got := decodeBCD3(tt.input)
		if got != tt.expected {
			t.Errorf("decodeBCD3(%x) = %d, want %d", tt.input, got, tt.expected)
		}
	}
}

func TestDecodeCoordUnsigned(t *testing.T) {
	tests := []struct {
		name     string
		input    []byte
		expected float64
	}{
		{"23.617065", []byte{0x17, 0x61, 0x70, 0x65}, 23.617065},
		{"46.793653", []byte{0x2E, 0x79, 0x36, 0x53}, 46.793653},
		{"12.063565", []byte{0x0C, 0x06, 0x35, 0x65}, 12.063565},
		{"zero", []byte{0x00, 0x00, 0x00, 0x00}, 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := decodeCoordUnsigned(tt.input)
			diff := got - tt.expected
			if diff < -0.000001 || diff > 0.000001 {
				t.Errorf("decodeCoordUnsigned(%x) = %f, want %f", tt.input, got, tt.expected)
			}
		})
	}
}

func TestSuntechBinaryName(t *testing.T) {
	p := NewSuntechBinaryParser()
	if p.Name() != "suntech-binary" {
		t.Errorf("Name() = %q, want %q", p.Name(), "suntech-binary")
	}
}
