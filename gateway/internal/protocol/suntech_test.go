package protocol

import (
	"bufio"
	"strings"
	"testing"
	"time"
)

func TestSuntechIdentify(t *testing.T) {
	p := NewSuntechParser()

	tests := []struct {
		name string
		data string
		want bool
	}{
		{"ST300 STT message", "ST300STT;123456789012345;04;374;20260318;10:30:00;0CD4A;-23.550520;-046.633308;000.000;000.00;11;1;0;12.24", true},
		{"ST340 STT message", "ST340STT;123456789012345;04;374;20260318;10:30:00;0CD4A;-23.550520;-046.633308;000.000;000.00;11;1;0;12.24", true},
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

	t.Run("too few fields", func(t *testing.T) {
		data := []byte("ST300STT;123456789012345;04")
		_, err := p.Parse(data, &Session{})
		if err == nil {
			t.Error("expected error for too few fields")
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
