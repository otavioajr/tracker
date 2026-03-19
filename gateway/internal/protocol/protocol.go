package protocol

import "time"

// Position represents a parsed GPS position from any device protocol.
type Position struct {
	IMEI       string
	Latitude   float64
	Longitude  float64
	Speed      float64   // km/h
	Heading    float64   // degrees 0-360
	Altitude   float64
	Satellites int
	Ignition   bool
	Battery    float64 // volts
	DeviceTime time.Time
	RawData    string // original message for debugging
	RemoteAddr string // client IP:port, set by TCP handler
}

// Parser defines the interface that all device protocol parsers must implement.
type Parser interface {
	Identify(data []byte) bool
	Parse(data []byte) (*Position, error)
	ACK(data []byte) []byte
	Name() string
}

// Registry holds registered parsers and routes data to the correct one.
type Registry struct {
	parsers []Parser
}

// NewRegistry creates a parser registry with the given parsers.
func NewRegistry(parsers ...Parser) *Registry {
	return &Registry{parsers: parsers}
}

// Find returns the first parser that identifies the data, or nil.
func (r *Registry) Find(data []byte) Parser {
	for _, p := range r.parsers {
		if p.Identify(data) {
			return p
		}
	}
	return nil
}
