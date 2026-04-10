package protocol

import "testing"

func TestDefaultDetector(t *testing.T) {
	detector := NewDefaultDetector()

	sttCompact := []byte("STT;1910006088;FFFFFF;191;1.0.14;0;20260410;11:22:16;0C3F4D15;724;10;E93F;54;-23.616218;-46.737257;0.00;0.00;16;1;00000000;00000000;0;1;0057;;0083800F;4.0;12.41;;;;;;")
	suntechST300 := []byte("ST300STT;123456789012345;04;374;20260318;10:30:00;0CD4A;-23.550520;-046.633308;000.000;000.00;11;1;0;12.24")
	suntechST340 := []byte("ST340STT;123456789012345;04;374;20260318;10:30:00;0CD4A;-23.550520;-046.633308;000.000;000.00;11;1;0;12.24")
	suntechBinary := []byte{0x02, 0x00, 0x32, 0x10}
	gt06 := []byte{0x78, 0x78, 0x0D, 0x01}
	scannerNoise := []byte("GET / HTTP/1.1")
	suntechPeekST30 := []byte("ST30")
	suntechPeekST34 := []byte("ST34")

	tests := []struct {
		name        string
		data        []byte
		wantFamily  string
		wantVariant string
		wantParser  string
		wantMatch   bool
	}{
		{
			name:        "compact STT ascii",
			data:        sttCompact,
			wantFamily:  "suntech",
			wantVariant: "stt_compact_ascii",
			wantParser:  "suntech",
			wantMatch:   true,
		},
		{
			name:        "ST300 ascii",
			data:        suntechST300,
			wantFamily:  "suntech",
			wantVariant: "st300_ascii",
			wantParser:  "suntech",
			wantMatch:   true,
		},
		{
			name:        "ST340 ascii",
			data:        suntechST340,
			wantFamily:  "suntech",
			wantVariant: "st340_ascii",
			wantParser:  "suntech",
			wantMatch:   true,
		},
		{
			name:        "suntech binary",
			data:        suntechBinary,
			wantFamily:  "suntech",
			wantVariant: "st310_binary",
			wantParser:  "suntech-binary",
			wantMatch:   true,
		},
		{
			name:        "gt06",
			data:        gt06,
			wantFamily:  "gt06",
			wantVariant: "gt06_binary",
			wantParser:  "gt06",
			wantMatch:   true,
		},
		{
			name:      "scanner noise",
			data:      scannerNoise,
			wantMatch: false,
		},
		{
			name:        "ST300 via 4-byte peek",
			data:        suntechPeekST30,
			wantFamily:  "suntech",
			wantVariant: "st300_ascii",
			wantParser:  "suntech",
			wantMatch:   true,
		},
		{
			name:        "ST340 via 4-byte peek",
			data:        suntechPeekST34,
			wantFamily:  "suntech",
			wantVariant: "st340_ascii",
			wantParser:  "suntech",
			wantMatch:   true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := detector.Detect(tt.data)
			if ok != tt.wantMatch {
				t.Fatalf("detector.Detect(...) matched=%v, want %v", ok, tt.wantMatch)
			}
			if !ok {
				return
			}
			if got.Family != tt.wantFamily {
				t.Fatalf("family = %q, want %q", got.Family, tt.wantFamily)
			}
			if got.Variant != tt.wantVariant {
				t.Fatalf("variant = %q, want %q", got.Variant, tt.wantVariant)
			}
			if got.ParserName != tt.wantParser {
				t.Fatalf("parser = %q, want %q", got.ParserName, tt.wantParser)
			}
		})
	}
}
