package protocol

import (
	"bufio"
	"time"
)

// Position represents a parsed GPS position from any device protocol.
type Position struct {
	IMEI       string
	Latitude   float64
	Longitude  float64
	Speed      float64 // km/h
	Heading    float64 // degrees 0-360
	Altitude   float64
	Satellites int
	Ignition   bool
	Battery    float64 // volts
	DeviceTime time.Time
	RawData    string // original message for debugging
	RemoteAddr string // client IP:port, set by TCP handler
}

// Session holds per-connection state that persists across frames.
type Session struct {
	IMEI string
	Data map[string]any
}

// Parser defines the interface that all device protocol parsers must implement.
type Parser interface {
	Name() string
	Identify(peek []byte) bool
	ReadFrame(reader *bufio.Reader) ([]byte, error)
	Parse(data []byte, session *Session) (*Position, error)
	ACK(data []byte, session *Session) []byte
}

// Registry holds registered parsers and routes data to the correct one.
type Registry struct {
	detector Detector
	parsers  []Parser
	byName   map[string]Parser
}

// NewRegistry creates a parser registry with the given parsers.
func NewRegistry(parsers ...Parser) *Registry {
	registry := &Registry{
		detector: NewDefaultDetector(),
		parsers:  parsers,
		byName:   make(map[string]Parser, len(parsers)),
	}
	for _, parser := range parsers {
		registry.byName[parser.Name()] = parser
	}
	return registry
}

// Find resolves the parser using protocol detection, with identifier-based fallback.
func (r *Registry) Find(data []byte) Parser {
	detection, ok := r.detector.Detect(data)
	if ok {
		if parser := r.Get(detection.ParserName); parser != nil {
			return parser
		}
	}

	for _, p := range r.parsers {
		if p.Identify(data) {
			return p
		}
	}
	return nil
}

// Get returns the parser by its canonical name.
func (r *Registry) Get(name string) Parser {
	return r.byName[name]
}
