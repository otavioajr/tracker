package server

import (
	"bufio"
	"encoding/binary"
	"fmt"
	"io"
	"log/slog"
	"net"
	"sync"
	"sync/atomic"
	"time"

	"github.com/otavioajr/tracker/gateway/internal/protocol"
)

// PositionHandler processes parsed positions.
type PositionHandler interface {
	HandlePosition(pos *protocol.Position)
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
	handler    PositionHandler
	listener   net.Listener
	logger     *slog.Logger
	activeConn atomic.Int64
	wg         sync.WaitGroup
	quit       chan struct{}
}

// New creates a TCP server.
func New(cfg Config, registry *protocol.Registry, handler PositionHandler) *Server {
	if cfg.Logger == nil {
		cfg.Logger = slog.Default()
	}
	if cfg.ReadTimeout == 0 {
		cfg.ReadTimeout = 30 * time.Second
	}
	if cfg.IdleTimeout == 0 {
		cfg.IdleTimeout = 60 * time.Second
	}

	return &Server{
		config:   cfg,
		registry: registry,
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
	s.listener = ln
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
	if s.listener != nil {
		s.listener.Close()
	}
	s.wg.Wait()
}

// Addr returns the server's listen address (useful for tests with port 0).
func (s *Server) Addr() string {
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
	session := &protocol.Session{Data: make(map[string]any)}

	for {
		select {
		case <-s.quit:
			return
		default:
		}

		conn.SetDeadline(time.Now().Add(s.config.IdleTimeout))

		frame, err := readFrame(reader)
		if err != nil {
			if err != io.EOF {
				s.logger.Debug("connection closed", "remote", remoteAddr, "error", err)
			}
			return
		}

		if len(frame) == 0 {
			continue
		}

		parser := s.registry.Find(frame)
		if parser == nil {
			s.logger.Warn("unknown protocol", "remote", remoteAddr, "data", string(frame[:min(len(frame), 50)]))
			continue
		}

		pos, err := parser.Parse(frame, session)
		if err != nil {
			s.logger.Warn("parse error", "protocol", parser.Name(), "error", err, "remote", remoteAddr)
			continue
		}

		pos.RemoteAddr = remoteAddr

		if ack := parser.ACK(frame, session); ack != nil {
			conn.Write(ack)
		}

		s.handler.HandlePosition(pos)
	}
}

// readFrame reads one protocol frame, auto-detecting binary (STX-framed) or ASCII (newline-delimited).
func readFrame(r *bufio.Reader) ([]byte, error) {
	// Peek at first byte to determine framing
	first, err := r.Peek(1)
	if err != nil {
		return nil, err
	}

	if first[0] == 0x02 { // STX → binary frame
		return readBinaryFrame(r)
	}

	// ASCII: read until \n
	line, err := r.ReadBytes('\n')
	if err != nil {
		return nil, err
	}
	// Trim \r\n
	for len(line) > 0 && (line[len(line)-1] == '\n' || line[len(line)-1] == '\r') {
		line = line[:len(line)-1]
	}
	return line, nil
}

// readBinaryFrame reads a Suntech binary ZIP frame: STX(1) + LEN(2) + payload(LEN) + ETX(1).
func readBinaryFrame(r *bufio.Reader) ([]byte, error) {
	// Read STX + length header (3 bytes)
	header := make([]byte, 3)
	if _, err := io.ReadFull(r, header); err != nil {
		return nil, fmt.Errorf("binary frame header: %w", err)
	}

	payloadLen := int(binary.BigEndian.Uint16(header[1:3]))
	if payloadLen <= 0 || payloadLen > 4096 {
		return nil, fmt.Errorf("binary frame: invalid length %d", payloadLen)
	}

	// Read payload + ETX
	rest := make([]byte, payloadLen+1)
	if _, err := io.ReadFull(r, rest); err != nil {
		return nil, fmt.Errorf("binary frame payload: %w", err)
	}

	// Assemble full frame
	frame := make([]byte, 3+payloadLen+1)
	copy(frame, header)
	copy(frame[3:], rest)

	return frame, nil
}
