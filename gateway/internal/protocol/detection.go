package protocol

import "bytes"

// Detection represents a protocol family/variant match.
type Detection struct {
	Family     string
	Variant    string
	ParserName string
}

// Detector identifies protocol frames from the first bytes read from a connection.
// The match result includes both canonical family/variant and parser lookup key.
type Detector interface {
	Detect(data []byte) (Detection, bool)
}

// NewDefaultDetector returns a detector with support for the currently onboarded
// families: suntech (including compact STT), suntech-binary and gt06.
func NewDefaultDetector() Detector {
	return defaultDetector{}
}

type defaultDetector struct{}

func (defaultDetector) Detect(data []byte) (Detection, bool) {
	if len(data) == 0 {
		return Detection{}, false
	}

	if bytes.HasPrefix(data, []byte("STT;")) {
		return Detection{
			Family:     "suntech",
			Variant:    "stt_compact_ascii",
			ParserName: "suntech",
		}, true
	}

	if len(data) >= 4 && bytes.HasPrefix(data, []byte("ST30")) {
		return Detection{
			Family:     "suntech",
			Variant:    "st300_ascii",
			ParserName: "suntech",
		}, true
	}

	if len(data) >= 4 && bytes.HasPrefix(data, []byte("ST34")) {
		return Detection{
			Family:     "suntech",
			Variant:    "st340_ascii",
			ParserName: "suntech",
		}, true
	}

	if data[0] == 0x02 {
		return Detection{
			Family:     "suntech",
			Variant:    "st310_binary",
			ParserName: "suntech-binary",
		}, true
	}

	if len(data) >= 2 && ((data[0] == 0x78 && data[1] == 0x78) || (data[0] == 0x79 && data[1] == 0x79)) {
		return Detection{
			Family:     "gt06",
			Variant:    "gt06_binary",
			ParserName: "gt06",
		}, true
	}

	return Detection{}, false
}
