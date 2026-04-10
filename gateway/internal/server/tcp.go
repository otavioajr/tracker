package server

import (
	"bufio"
	"bytes"
	"crypto/sha1"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/otavioajr/tracker/gateway/internal/protocol"
)

// UnknownFrame captures frames that are detected as unknown protocol.
type UnknownFrame struct {
	Transport       string
	RemoteIP        string
	RawPreview      string
	RawPayload      string
	Fingerprint     string
	CandidateFamily string
	Confidence      *float64
}

// ProtocolFailure captures parser failures for a known protocol.
type ProtocolFailure struct {
	Family       string
	Variant      string
	ErrorCode    string
	ErrorMessage string
	RawPayload   string
	DeviceHint   string
	RemoteIP     string
}

// OutcomeHandler processes protocol outcomes from connection intake.
type OutcomeHandler interface {
	HandlePosition(pos *protocol.Position, family, variant string)
	HandleUnknownFrame(frame UnknownFrame)
	HandleProtocolFailure(failure ProtocolFailure)
}

// Config for the TCP server.
type Config struct {
	Port        int
	ReadTimeout time.Duration
	IdleTimeout time.Duration
	Logger      *slog.Logger
}

// Server is a TCP server that receives GPS device data.
type Server struct {
	config     Config
	registry   *protocol.Registry
	detector   protocol.Detector
	handler    OutcomeHandler
	listener   net.Listener
	logger     *slog.Logger
	mu         sync.RWMutex
	activeConn atomic.Int64
	wg         sync.WaitGroup
	quit       chan struct{}
}

// New creates a TCP server.
func New(cfg Config, registry *protocol.Registry, detector protocol.Detector, handler OutcomeHandler) *Server {
	if cfg.Logger == nil {
		cfg.Logger = slog.Default()
	}
	if cfg.ReadTimeout == 0 {
		cfg.ReadTimeout = 30 * time.Second
	}
	if cfg.IdleTimeout == 0 {
		cfg.IdleTimeout = 60 * time.Second
	}
	if detector == nil {
		detector = protocol.NewDefaultDetector()
	}

	return &Server{
		config:   cfg,
		registry: registry,
		detector: detector,
		handler:  handler,
		logger:   cfg.Logger,
		quit:     make(chan struct{}),
	}
}

// Start begins listening for TCP connections.
func (s *Server) Start() error {
	ln, err := net.Listen("tcp", fmt.Sprintf(":%d", s.config.Port))
	if err != nil {
		return fmt.Errorf("server: failed to listen: %w", err)
	}
	s.mu.Lock()
	s.listener = ln
	s.mu.Unlock()
	s.logger.Info("TCP server listening", "addr", ln.Addr().String())

	for {
		conn, err := ln.Accept()
		if err != nil {
			select {
			case <-s.quit:
				return nil
			default:
				s.logger.Error("accept error", "error", err)
				continue
			}
		}

		s.wg.Add(1)
		s.activeConn.Add(1)
		go s.handleConnection(conn)
	}
}

// Stop gracefully shuts down the server.
func (s *Server) Stop() {
	close(s.quit)
	s.mu.Lock()
	ln := s.listener
	s.listener = nil
	s.mu.Unlock()
	if ln != nil {
		ln.Close()
	}
	s.wg.Wait()
}

// Addr returns the server's listen address (useful for tests with port 0).
func (s *Server) Addr() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.listener != nil {
		return s.listener.Addr().String()
	}
	return ""
}

// ActiveConnections returns the number of active connections.
func (s *Server) ActiveConnections() int64 {
	return s.activeConn.Load()
}

func (s *Server) handleConnection(conn net.Conn) {
	defer func() {
		conn.Close()
		s.activeConn.Add(-1)
		s.wg.Done()
	}()

	remoteAddr := conn.RemoteAddr().String()
	s.logger.Debug("new connection", "remote", remoteAddr)

	reader := bufio.NewReader(conn)
	conn.SetReadDeadline(time.Now().Add(s.config.ReadTimeout))

	// Peek to detect protocol.
	peek, err := reader.Peek(4)
	if len(peek) == 0 {
		s.logger.Debug("connection closed during peek", "remote", remoteAddr, "error", err)
		return
	}
	if err != nil && !errors.Is(err, io.EOF) {
		s.logger.Debug("protocol peek error", "remote", remoteAddr, "error", err)
		return
	}

	detection, ok := s.detector.Detect(peek)
	if !ok {
		rawUnknown := readUnknownPayload(reader, peek)
		s.logger.Warn("unknown protocol", "remote", remoteAddr, "data", rawPreview(rawUnknown))
		s.handler.HandleUnknownFrame(UnknownFrame{
			Transport:       "tcp",
			RemoteIP:        remoteAddr,
			RawPreview:      rawPreview(rawUnknown),
			RawPayload:      formatRawPayload(rawUnknown),
			Fingerprint:     transportFingerprint(rawUnknown),
			CandidateFamily: strings.TrimSpace(""),
			Confidence:      nil,
		})
		return
	}

	parser := s.registry.Get(detection.ParserName)
	if parser == nil {
		s.logger.Warn(
			"protocol parser not registered",
			"remote", remoteAddr,
			"protocol", detection.ParserName,
			"family", detection.Family,
			"variant", detection.Variant,
		)
		s.handler.HandleProtocolFailure(ProtocolFailure{
			Family:       detection.Family,
			Variant:      detection.Variant,
			ErrorCode:    "parser_not_registered",
			ErrorMessage: fmt.Sprintf("protocol parser %q is not registered", detection.ParserName),
			RawPayload:   hexPayload(peek),
			RemoteIP:     remoteAddr,
		})
		return
	}

	s.logger.Debug("protocol detected", "remote", remoteAddr, "family", detection.Family, "variant", detection.Variant, "protocol", detection.ParserName)

	session := protocol.Session{Data: make(map[string]any)}

	for {
		select {
		case <-s.quit:
			return
		default:
		}

		conn.SetDeadline(time.Now().Add(s.config.IdleTimeout))

		frame, err := parser.ReadFrame(reader)
		if err != nil {
			if err != io.EOF {
				s.logger.Debug("connection closed", "remote", remoteAddr, "error", err)
			}
			return
		}

		if len(frame) == 0 {
			continue
		}

		pos, err := parser.Parse(frame, &session)
		if err != nil {
			s.logger.Warn(
				"parse error",
				"protocol", detection.ParserName,
				"family", detection.Family,
				"variant", detection.Variant,
				"error", err,
				"remote", remoteAddr)
			s.handler.HandleProtocolFailure(ProtocolFailure{
				Family:       detection.Family,
				Variant:      detection.Variant,
				ErrorCode:    protocolFailureCode(err),
				ErrorMessage: err.Error(),
				RawPayload:   formatRawPayload(frame),
				DeviceHint:   session.IMEI,
				RemoteIP:     remoteAddr,
			})
			continue
		}

		if ack := parser.ACK(frame, &session); ack != nil {
			conn.Write(ack)
		}

		// nil position means non-data packet (login, heartbeat) — skip.
		if pos == nil {
			continue
		}

		pos.RemoteAddr = remoteAddr

		// Use session IMEI if parser didn't set it on the position.
		if pos.IMEI == "" && session.IMEI != "" {
			pos.IMEI = session.IMEI
		}

		s.handler.HandlePosition(pos, detection.Family, detection.Variant)
	}
}

func transportFingerprint(payload []byte) string {
	if len(payload) == 0 {
		return ""
	}
	sum := sha1.Sum(payload)
	return fmt.Sprintf("%x", sum[:])
}

func rawPreview(payload []byte) string {
	p := bytes.TrimSpace(payload)
	if len(p) == 0 {
		return ""
	}
	isText := bytes.IndexFunc(p, func(r rune) bool {
		return r < 0x09 || r > 0x7e
	}) == -1
	if isText {
		return string(p)
	}
	return fmt.Sprintf("%x", p)
}

func hexPayload(payload []byte) string {
	return strings.TrimSpace(fmt.Sprintf("%x", bytes.TrimSpace(payload)))
}

func formatRawPayload(payload []byte) string {
	if preview := rawPreview(payload); preview != "" {
		return preview
	}
	return hexPayload(payload)
}

func readUnknownPayload(reader *bufio.Reader, firstBytes []byte) []byte {
	if len(firstBytes) == 0 {
		return nil
	}

	line, err := reader.ReadBytes('\n')
	if err == nil {
		return line
	}

	if len(line) > 0 {
		return line
	}

	return firstBytes
}

func protocolFailureCode(err error) string {
	if err == nil {
		return "parse_error"
	}

	msg := err.Error()
	if msg == "" {
		return "parse_error"
	}

	idx := strings.Index(msg, "invalid ")
	if idx >= 0 {
		rest := strings.TrimSpace(msg[idx+len("invalid "):])
		if rest != "" {
			field := strings.Fields(rest)[0]
			field = strings.Trim(field, `\";:,`)
			if field != "" {
				return "invalid_" + field
			}
		}
		return "invalid_payload"
	}

	return "parse_error"
}
