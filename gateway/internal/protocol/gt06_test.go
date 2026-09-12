package protocol

import (
	"bufio"
	"bytes"
	"encoding/hex"
	"math"
	"testing"
)

func TestGT06Name(t *testing.T) {
	p := NewGT06Parser()
	if p.Name() != "gt06" {
		t.Errorf("Name() = %q, want %q", p.Name(), "gt06")
	}
}

func TestGT06Identify(t *testing.T) {
	p := NewGT06Parser()

	tests := []struct {
		name string
		data []byte
		want bool
	}{
		{"short packet start 0x7878", []byte{0x78, 0x78, 0x0D, 0x01}, true},
		{"long packet start 0x7979", []byte{0x79, 0x79, 0x00, 0x17}, true},
		{"ASCII data", []byte("ST300STT"), false},
		{"STX binary", []byte{0x02, 0x00, 0x32}, false},
		{"too short - 1 byte", []byte{0x78}, false},
		{"empty", []byte{}, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := p.Identify(tt.data)
			if got != tt.want {
				t.Errorf("Identify(%x) = %v, want %v", tt.data, got, tt.want)
			}
		})
	}
}

func TestGT06ReadFrame(t *testing.T) {
	p := NewGT06Parser()

	t.Run("short packet", func(t *testing.T) {
		// Login packet: 78 78 0D 01 03 58 89 90 50 12 78 10 00 05 0D D8 0D 0A
		data, _ := hex.DecodeString("78780D01035889905012781000050DD80D0A")
		reader := bufio.NewReader(bytes.NewReader(data))

		frame, err := p.ReadFrame(reader)
		if err != nil {
			t.Fatalf("ReadFrame error: %v", err)
		}
		if !bytes.Equal(frame, data) {
			t.Errorf("ReadFrame returned %x, want %x", frame, data)
		}
	})

	t.Run("long packet", func(t *testing.T) {
		// Long frame with GPS content: 79 79 00 17 [content(21)] [CRC(2)] 0D 0A
		data, _ := hex.DecodeString("79790017121A03120A1E00800286D5740500D2642D087F0001CCCC0D0A")
		reader := bufio.NewReader(bytes.NewReader(data))

		frame, err := p.ReadFrame(reader)
		if err != nil {
			t.Fatalf("ReadFrame error: %v", err)
		}
		if !bytes.Equal(frame, data) {
			t.Errorf("ReadFrame returned %x, want %x", frame, data)
		}
	})

	t.Run("multiple frames concatenated", func(t *testing.T) {
		// Two frames back-to-back
		frame1, _ := hex.DecodeString("78780D01035889905012781000050DD80D0A")
		frame2, _ := hex.DecodeString("78780A1301000100000003BBBB0D0A")
		combined := append(frame1, frame2...)
		reader := bufio.NewReader(bytes.NewReader(combined))

		f1, err := p.ReadFrame(reader)
		if err != nil {
			t.Fatalf("ReadFrame #1 error: %v", err)
		}
		if !bytes.Equal(f1, frame1) {
			t.Errorf("Frame #1: got %x, want %x", f1, frame1)
		}

		f2, err := p.ReadFrame(reader)
		if err != nil {
			t.Fatalf("ReadFrame #2 error: %v", err)
		}
		if !bytes.Equal(f2, frame2) {
			t.Errorf("Frame #2: got %x, want %x", f2, frame2)
		}
	})
}

func TestGT06ParseLogin(t *testing.T) {
	p := NewGT06Parser()

	t.Run("valid login sets session IMEI", func(t *testing.T) {
		// Login packet for IMEI 358899050127810
		// 78 78 0D 01 03 58 89 90 50 12 78 10 00 05 0D D8 0D 0A
		data, _ := hex.DecodeString("78780D01035889905012781000050DD80D0A")
		session := &Session{}

		pos, err := p.Parse(data, session)
		if err != nil {
			t.Fatalf("Parse error: %v", err)
		}
		if pos != nil {
			t.Error("expected nil position for login packet")
		}
		if session.IMEI != "358899050127810" {
			t.Errorf("session.IMEI = %q, want %q", session.IMEI, "358899050127810")
		}
	})

	t.Run("login returns nil position", func(t *testing.T) {
		data, _ := hex.DecodeString("78780D01035889905012781000050DD80D0A")
		session := &Session{}

		pos, err := p.Parse(data, session)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if pos != nil {
			t.Error("login should return nil position")
		}
	})
}

func TestGT06ParseGPS(t *testing.T) {
	p := NewGT06Parser()

	t.Run("GPS data returns position with coords", func(t *testing.T) {
		// GPS packet for position approx -23.5505, -46.6333 at 45 km/h heading 127°
		// DateTime: 2026-03-18 10:30:00 → 1A 03 12 0A 1E 00
		// Sats: 8 → high nibble 0x80
		// Lat: 23.5505° → raw 42390900 = 0x0286D574
		// Lon: 46.6333° → raw 83939940 = 0x0500D264
		// Speed: 45 → 0x2D
		// Course: south+west+127° → bit10=0 (south), bit11=1 (west), bits0-9=127 → 0x087F
		// Serial: 0x0001
		// Length field: content(21) + CRC(2) = 23 = 0x17
		data, _ := hex.DecodeString("787817121A03120A1E00800286D5740500D2642D087F0001AAAA0D0A")

		session := &Session{IMEI: "358899050127810"}
		pos, err := p.Parse(data, session)
		if err != nil {
			t.Fatalf("Parse error: %v", err)
		}
		if pos == nil {
			t.Fatal("expected position, got nil")
		}

		// IMEI from session
		if pos.IMEI != "358899050127810" {
			t.Errorf("IMEI = %q, want %q", pos.IMEI, "358899050127810")
		}

		// Latitude: -23.5505 (south)
		if math.Abs(pos.Latitude-(-23.5505)) > 0.001 {
			t.Errorf("Latitude = %f, want ~-23.5505", pos.Latitude)
		}

		// Longitude: -46.6333 (west)
		if math.Abs(pos.Longitude-(-46.6333)) > 0.001 {
			t.Errorf("Longitude = %f, want ~-46.6333", pos.Longitude)
		}

		// Speed
		if pos.Speed != 45 {
			t.Errorf("Speed = %f, want 45", pos.Speed)
		}

		// Heading
		if pos.Heading != 127 {
			t.Errorf("Heading = %f, want 127", pos.Heading)
		}

		// Satellites
		if pos.Satellites != 8 {
			t.Errorf("Satellites = %d, want 8", pos.Satellites)
		}

		// DateTime: 2026-03-18 10:30:00
		if pos.DeviceTime.Year() != 2026 || pos.DeviceTime.Month() != 3 || pos.DeviceTime.Day() != 18 {
			t.Errorf("DeviceTime date = %v, want 2026-03-18", pos.DeviceTime)
		}
		if pos.DeviceTime.Hour() != 10 || pos.DeviceTime.Minute() != 30 || pos.DeviceTime.Second() != 0 {
			t.Errorf("DeviceTime time = %v, want 10:30:00", pos.DeviceTime)
		}
	})

	t.Run("GPS+LBS packet parsed like GPS", func(t *testing.T) {
		// Same GPS data but with protocol number 0x22 (GPS+LBS)
		// The GPS portion is identical; LBS data follows after but we only parse GPS part
		data, _ := hex.DecodeString("787817221A03120A1E00800286D5740500D2642D087F0001AAAA0D0A")

		session := &Session{IMEI: "123456789012345"}
		pos, err := p.Parse(data, session)
		if err != nil {
			t.Fatalf("Parse error: %v", err)
		}
		if pos == nil {
			t.Fatal("expected position for GPS+LBS")
		}
		if math.Abs(pos.Latitude-(-23.5505)) > 0.001 {
			t.Errorf("Latitude = %f, want ~-23.5505", pos.Latitude)
		}
	})

	t.Run("alarm packet parsed like GPS", func(t *testing.T) {
		// Same GPS data but with protocol number 0x26 (Alarm)
		data, _ := hex.DecodeString("787817261A03120A1E00800286D5740500D2642D087F0001AAAA0D0A")

		session := &Session{IMEI: "123456789012345"}
		pos, err := p.Parse(data, session)
		if err != nil {
			t.Fatalf("Parse error: %v", err)
		}
		if pos == nil {
			t.Fatal("expected position for alarm packet")
		}
		if pos.Speed != 45 {
			t.Errorf("Speed = %f, want 45", pos.Speed)
		}
	})

	// Independent course words cover every hemisphere without reusing decoder logic.
	for _, tt := range []struct {
		name   string
		course string
		lat    float64
		lon    float64
	}{
		{"north-east", "045A", 10, 20},
		{"north-west", "0C5A", 10, -20},
		{"south-east", "005A", -10, 20},
		{"south-west", "085A", -10, -20},
	} {
		t.Run(tt.name, func(t *testing.T) {
			// Unsigned coordinates: 10° = 0x0112A880; 20° = 0x02255100.
			data, err := hex.DecodeString("787817121A03120A1E00800112A880022551002D" + tt.course + "0001AAAA0D0A")
			if err != nil {
				t.Fatal(err)
			}
			pos, err := p.Parse(data, &Session{IMEI: "test_imei"})
			if err != nil {
				t.Fatalf("Parse error: %v", err)
			}
			if pos == nil {
				t.Fatal("expected position")
			}
			if math.Abs(pos.Latitude-tt.lat) > 0.000001 || math.Abs(pos.Longitude-tt.lon) > 0.000001 {
				t.Errorf("coordinates = (%f, %f), want (%f, %f)", pos.Latitude, pos.Longitude, tt.lat, tt.lon)
			}
			if pos.Heading != 90 {
				t.Errorf("Heading = %f, want 90", pos.Heading)
			}
		})
	}
}

// Captured J16 frame from the old regression: swapped flags placed São Paulo east of Greenwich.
func TestGT06ParseGPSRealFrameJ16(t *testing.T) {
	data, err := hex.DecodeString("78781f121a0603012127ca0288a5800503b01000080002d403798d00240b000718af0d0a")
	if err != nil {
		t.Fatal(err)
	}
	pos, err := NewGT06Parser().Parse(data, &Session{IMEI: "test_imei"})
	if err != nil || pos == nil {
		t.Fatalf("Parse = (%v, %v), want position", pos, err)
	}
	if math.Abs(pos.Latitude-(-23.6165)) > 0.001 || math.Abs(pos.Longitude-(-46.7376)) > 0.001 {
		t.Errorf("coordinates = (%f, %f), want São Paulo (-23.6165, -46.7376)", pos.Latitude, pos.Longitude)
	}
	if pos.Speed != 0 || pos.Satellites != 12 {
		t.Errorf("speed/satellites = %f/%d, want 0/12", pos.Speed, pos.Satellites)
	}
}

// J16 sends ACC separately; retain it per connection without manufacturing heartbeat positions.
func TestGT06IgnitionFromStatusPacket(t *testing.T) {
	p := NewGT06Parser()
	session := &Session{IMEI: "test_imei"}
	gps, err := hex.DecodeString("78781f121a0603012127ca0288a5800503b01000080002d403798d00240b000718af0d0a")
	if err != nil {
		t.Fatal(err)
	}
	assertIgnition := func(t *testing.T, session *Session, want bool) {
		t.Helper()
		pos, err := p.Parse(gps, session)
		if err != nil || pos == nil {
			t.Fatalf("Parse GPS = (%v, %v), want position", pos, err)
		}
		if pos.Ignition != want {
			t.Errorf("Ignition = %v, want %v", pos.Ignition, want)
		}
	}
	assertIgnition(t, session, false)
	for _, tt := range []struct {
		name  string
		frame string
		want  bool
	}{
		{"ACC on", "78780a1302040400010009aaaa0d0a", true},
		// A serial-only heartbeat has no terminal byte; it must preserve state.
		{"missing terminal info", "787805130000aaaa0d0a", true},
		{"ACC off with other bits set", "78780a13fd040400010009aaaa0d0a", false},
		{"ACC on with other bits set", "78780a13ff040400010009aaaa0d0a", true},
	} {
		t.Run(tt.name, func(t *testing.T) {
			frame, err := hex.DecodeString(tt.frame)
			if err != nil {
				t.Fatal(err)
			}
			pos, err := p.Parse(frame, session)
			if err != nil || pos != nil {
				t.Fatalf("Parse heartbeat = (%v, %v), want (nil, nil)", pos, err)
			}
			assertIgnition(t, session, tt.want)
			assertIgnition(t, session, tt.want) // Subsequent GPS frames retain the last status.
			assertIgnition(t, &Session{IMEI: "other_device"}, false)
		})
	}
	// Preserve other per-connection metadata when the map already exists.
	if session.Data == nil {
		t.Fatal("heartbeat did not initialize session metadata")
	}
	session.Data["unrelated"] = "preserved"
	off, _ := hex.DecodeString("78780a1301040400010009aaaa0d0a")
	if _, err := p.Parse(off, session); err != nil {
		t.Fatal(err)
	}
	assertIgnition(t, session, false)
	if session.Data["unrelated"] != "preserved" {
		t.Fatal("heartbeat overwrote unrelated session metadata")
	}
}

func TestGT06ParseHeartbeat(t *testing.T) {
	p := NewGT06Parser()

	// Heartbeat packet: protocol 0x13
	// content = proto(13) + terminal_info(01) + voltage(0001) + GSM(00) + alarm_lang(0000) + serial(0003)
	// length = 8(content) + 2(CRC) = 10 = 0x0A
	data, _ := hex.DecodeString("78780A1301000100000003BBBB0D0A")
	session := &Session{IMEI: "358899050127810"}

	pos, err := p.Parse(data, session)
	if err != nil {
		t.Fatalf("Parse error: %v", err)
	}
	if pos != nil {
		t.Error("expected nil position for heartbeat")
	}
}

func TestGT06ParseUnknownProtocol(t *testing.T) {
	p := NewGT06Parser()

	// Unknown protocol number 0xFF, minimal content: proto + serial
	// content(3 bytes) + CRC(2) = 5 = length field
	data, _ := hex.DecodeString("787805FF00010000AAAA0D0A")
	// Actually let me fix this. length=5, so after length byte we read 5+2=7 bytes
	// content = FF 00 01 (3 bytes), CRC = 00 00, stop = 0D 0A...
	// Wait, length=5 means content+CRC=5, content=3, CRC=2. Total after len: 5+2(stop)=7
	// Frame: 78 78 05 FF 00 01 AA AA 0D 0A = 10 bytes
	data, _ = hex.DecodeString("787805FF0001AAAA0D0A")

	session := &Session{}
	pos, err := p.Parse(data, session)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if pos != nil {
		t.Error("expected nil position for unknown protocol")
	}
}

func TestGT06ACK(t *testing.T) {
	p := NewGT06Parser()

	t.Run("login ACK", func(t *testing.T) {
		// Login packet with serial 0x0005
		data, _ := hex.DecodeString("78780D01035889905012781000050DD80D0A")
		session := &Session{}

		ack := p.ACK(data, session)
		if ack == nil {
			t.Fatal("expected ACK for login, got nil")
		}

		// Expected: 78 78 05 01 00 05 [CRC] 0D 0A
		// CRC over [05 01 00 05]
		expectedACK, _ := hex.DecodeString("7878050100059FF80D0A")
		if !bytes.Equal(ack, expectedACK) {
			t.Errorf("Login ACK = %x, want %x", ack, expectedACK)
		}
	})

	t.Run("heartbeat ACK", func(t *testing.T) {
		// Heartbeat packet with serial 0x0003
		data, _ := hex.DecodeString("78780A1301000100000003BBBB0D0A")
		session := &Session{}

		ack := p.ACK(data, session)
		if ack == nil {
			t.Fatal("expected ACK for heartbeat, got nil")
		}

		// Expected: 78 78 05 13 00 03 [CRC] 0D 0A
		// CRC over [05 13 00 03]
		expectedACK, _ := hex.DecodeString("787805130003CAE30D0A")
		if !bytes.Equal(ack, expectedACK) {
			t.Errorf("Heartbeat ACK = %x, want %x", ack, expectedACK)
		}
	})

	t.Run("GPS packet returns no ACK", func(t *testing.T) {
		data, _ := hex.DecodeString("787817121A03120A1E00800286D5740500D2642D087F0001AAAA0D0A")
		session := &Session{}

		ack := p.ACK(data, session)
		if ack != nil {
			t.Errorf("expected nil ACK for GPS, got %x", ack)
		}
	})
}

func TestCrcITU(t *testing.T) {
	tests := []struct {
		name string
		data []byte
		want uint16
	}{
		{
			"login ACK payload",
			[]byte{0x05, 0x01, 0x00, 0x05},
			0x9FF8,
		},
		{
			"heartbeat ACK payload",
			[]byte{0x05, 0x13, 0x00, 0x03},
			0xCAE3,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := crcITU(tt.data)
			if got != tt.want {
				t.Errorf("crcITU(%x) = 0x%04X, want 0x%04X", tt.data, got, tt.want)
			}
		})
	}
}
