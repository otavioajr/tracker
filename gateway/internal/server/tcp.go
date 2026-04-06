package server

import (
	"bufio"
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
	HandlePosition(pos *protocol.Position, protocolName string)
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

	// Peek to detect protocol
	peek, err := reader.Peek(4)
	if err != nil {
		s.logger.Debug("connection closed during peek", "remote", remoteAddr, "error", err)
		return
	}

	parser := s.registry.Find(peek)
	if parser == nil {
		s.logger.Warn("unknown protocol", "remote", remoteAddr, "data", fmt.Sprintf("%x", peek))
		return
	}

	s.logger.Debug("protocol detected", "remote", remoteAddr, "protocol", parser.Name())

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
			s.logger.Warn("parse error", "protocol", parser.Name(), "error", err, "remote", remoteAddr)
			continue
		}

		if ack := parser.ACK(frame, &session); ack != nil {
			conn.Write(ack)
		}

		// nil position means non-data packet (login, heartbeat) — skip
		if pos == nil {
			continue
		}

		pos.RemoteAddr = remoteAddr

		// Use session IMEI if parser didn't set it on the position
		if pos.IMEI == "" && session.IMEI != "" {
			pos.IMEI = session.IMEI
		}

		s.handler.HandlePosition(pos, parser.Name())
	}
}
