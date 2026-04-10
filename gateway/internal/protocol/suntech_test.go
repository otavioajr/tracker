package protocol

import (
	"bufio"
	"strings"
	"testing"
	"time"
)

func compactSTTMessage() string {
	return "STT;1910006088;FFFFFF;191;1.0.14;0;20260410;11:22:16;0C3F4D15;724;10;E93F;54;-23.616218;-46.737257;0.00;0.00;16;1;00000000;00000000;0;1;0057;;0083800F;4.0;12.41;;;;;;"
}

func TestSuntechIdentify(t *testing.T) {
	p := NewSuntechParser()

	tests := []struct {
		name string
		data string
		want bool
	}{
		{"ST300 STT message", "ST300STT;123456789012345;04;374;20260318;10:30:00;0CD4A;-23.550520;-046.633308;000.000;000.00;11;1;0;12.24", true},
		{"ST340 STT message", "ST340STT;123456789012345;04;374;20260318;10:30:00;0CD4A;-23.550520;-046.633308;000.000;000.00;11;1;0;12.24", true},
		{"Compact STT message", compactSTTMessage(), true},
		{"Unknown protocol", "UNKNOWN;data;here", false},
		{"Empty data", "", false},
		{"Too short", "ST3", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := p.Identify([]byte(tt.data))
			if got != tt.want {
				t.Errorf("Identify(%q) = %v, want %v", tt.data, got, tt.want)
			}
		})
	}
}

func TestSuntechParse(t *testing.T) {
	p := NewSuntechParser()

	t.Run("valid STT message", func(t *testing.T) {
		data := []byte("ST300STT;123456789012345;04;374;20260318;10:30:00;0CD4A;-23.550520;-046.633308;045.500;127.30;11;1;1;12.24")

		pos, err := p.Parse(data, &Session{})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if pos.IMEI != "123456789012345" {
			t.Errorf("IMEI = %q, want %q", pos.IMEI, "123456789012345")
		}
		if pos.Latitude != -23.550520 {
			t.Errorf("Latitude = %f, want %f", pos.Latitude, -23.550520)
		}
		if pos.Longitude != -46.633308 {
			t.Errorf("Longitude = %f, want %f", pos.Longitude, -46.633308)
		}
		if pos.Speed != 45.5 {
			t.Errorf("Speed = %f, want %f", pos.Speed, 45.5)
		}
		if pos.Heading != 127.30 {
			t.Errorf("Heading = %f, want %f", pos.Heading, 127.30)
		}
		if pos.Satellites != 11 {
			t.Errorf("Satellites = %d, want %d", pos.Satellites, 11)
		}
		if !pos.Ignition {
			t.Error("Ignition = false, want true")
		}
		if pos.Battery != 12.24 {
			t.Errorf("Battery = %f, want %f", pos.Battery, 12.24)
		}

		expectedTime := time.Date(2026, 3, 18, 10, 30, 0, 0, time.UTC)
		if !pos.DeviceTime.Equal(expectedTime) {
			t.Errorf("DeviceTime = %v, want %v", pos.DeviceTime, expectedTime)
		}
	})

	t.Run("valid compact STT message", func(t *testing.T) {
		data := []byte(compactSTTMessage())

		pos, err := p.Parse(data, &Session{})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if pos.IMEI != "1910006088" {
			t.Errorf("IMEI = %q, want %q", pos.IMEI, "1910006088")
		}
		if pos.Latitude != -23.616218 {
			t.Errorf("Latitude = %f, want %f", pos.Latitude, -23.616218)
		}
		if pos.Longitude != -46.737257 {
			t.Errorf("Longitude = %f, want %f", pos.Longitude, -46.737257)
		}
		if pos.Speed != 0.0 {
			t.Errorf("Speed = %f, want %f", pos.Speed, 0.0)
		}
		if pos.Heading != 0.0 {
			t.Errorf("Heading = %f, want %f", pos.Heading, 0.0)
		}
		if pos.Satellites != 16 {
			t.Errorf("Satellites = %d, want %d", pos.Satellites, 16)
		}
		if !pos.Ignition {
			t.Error("Ignition = false, want true")
		}
		if pos.Battery != 12.41 {
			t.Errorf("Battery = %f, want %f", pos.Battery, 12.41)
		}

		expectedTime := time.Date(2026, 4, 10, 11, 22, 16, 0, time.UTC)
		if !pos.DeviceTime.Equal(expectedTime) {
			t.Errorf("DeviceTime = %v, want %v", pos.DeviceTime, expectedTime)
		}
	})

	t.Run("too few fields", func(t *testing.T) {
		data := []byte("ST300STT;123456789012345;04")
		_, err := p.Parse(data, &Session{})
		if err == nil {
			t.Error("expected error for too few fields")
		}
	})

	t.Run("legacy message truncated right after satellites should error", func(t *testing.T) {
		data := []byte("ST300STT;123456789012345;04;374;20260318;10:30:00;0CD4A;-23.550520;-046.633308;045.500;127.30;11")
		_, err := p.Parse(data, &Session{})
		if err == nil {
			t.Error("expected error for legacy message truncated after satellites")
		}
	})

	t.Run("compact message truncated before field 27 should error", func(t *testing.T) {
		data := []byte("STT;1910006088;FFFFFF;191;1.0.14;0;20260410;11:22:16;0C3F4D15;724;10;E93F;54;-23.616218;-46.737257;0.00;0.00;16;1;00000000;00000000;0;1;0057;;0083800F;4.0")
		_, err := p.Parse(data, &Session{})
		if err == nil {
			t.Error("expected error for compact message truncated before battery field")
		}
	})

	t.Run("invalid latitude", func(t *testing.T) {
		data := []byte("ST300STT;123456789012345;04;374;20260318;10:30:00;0CD4A;INVALID;-046.633308;000.000;000.00;11;1;0;12.24")
		_, err := p.Parse(data, &Session{})
		if err == nil {
			t.Error("expected error for invalid latitude")
		}
	})
}

func TestSuntechACK(t *testing.T) {
	p := NewSuntechParser()
	ack := p.ACK([]byte("ST300STT;123456789012345;..."), &Session{})
	if ack != nil {
		t.Errorf("ACK should be nil for STT messages, got %v", ack)
	}
}

func TestSuntechName(t *testing.T) {
	p := NewSuntechParser()
	if p.Name() != "suntech" {
		t.Errorf("Name() = %q, want %q", p.Name(), "suntech")
	}
}

func TestSuntechReadFrame(t *testing.T) {
	p := NewSuntechParser()
	input := "ST300STT;123456789012345;04;374;20260318;10:30:00;0CD4A;-23.55;-046.63;0;0;11;1;0;12.24\r\n"
	reader := bufio.NewReader(strings.NewReader(input))
	frame, err := p.ReadFrame(reader)
	if err != nil {
		t.Fatalf("ReadFrame error: %v", err)
	}
	expected := "ST300STT;123456789012345;04;374;20260318;10:30:00;0CD4A;-23.55;-046.63;0;0;11;1;0;12.24"
	if string(frame) != expected {
		t.Errorf("ReadFrame = %q, want %q", string(frame), expected)
	}
}

func TestSuntechReadFrameWithoutTrailingNewline(t *testing.T) {
	p := NewSuntechParser()
	input := compactSTTMessage()
	reader := bufio.NewReader(strings.NewReader(input))

	frame, err := p.ReadFrame(reader)
	if err != nil {
		t.Fatalf("ReadFrame error: %v", err)
	}
	if string(frame) != input {
		t.Fatalf("ReadFrame = %q, want %q", string(frame), input)
	}
}
