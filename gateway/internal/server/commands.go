package server

import (
	"errors"
	"io"
	"net"
	"strings"
	"time"

	"github.com/otavioajr/tracker/gateway/internal/protocol"
)

var (
	ErrInvalidCommand   = errors.New("invalid IMEI or command")
	ErrCommandQueueFull = errors.New("command queue is full")
	ErrServerStopped    = errors.New("server is stopping")
)

const (
	commandTTL        = 5 * time.Minute
	maxQueuedCommands = 1024
	maxDeviceCommands = 16
)

type queuedCommand struct {
	text      string
	expiresAt time.Time
}

// EnqueueCommand accepts a volatile command, not confirmation of device execution.
// Bounded queues and expiry prevent offline devices accumulating stale operations.
func (s *Server) EnqueueCommand(imei, command string) error {
	if !validCommand(imei, command) {
		return ErrInvalidCommand
	}
	s.commandMu.Lock()
	defer s.commandMu.Unlock()
	select {
	case <-s.quit:
		return ErrServerStopped
	default:
	}
	now := time.Now()
	total := 0
	for device := range s.commands {
		s.pruneCommands(device, now)
		total += len(s.commands[device])
	}
	if total >= maxQueuedCommands || len(s.commands[imei]) >= maxDeviceCommands {
		return ErrCommandQueueFull
	}
	s.commands[imei] = append(s.commands[imei], queuedCommand{text: command, expiresAt: now.Add(commandTTL)})
	s.logger.Info("command queued", "imei", imei, "expires_at", now.Add(commandTTL))
	return nil
}

func validCommand(imei, command string) bool {
	if len(imei) != 15 || len(command) == 0 || len(command) > protocol.MaxOnlineCommandBytes {
		return false
	}
	for _, c := range imei {
		if c < '0' || c > '9' {
			return false
		}
	}
	// Reject framing/control bytes instead of allowing concatenated device messages.
	return !strings.ContainsFunc(command, func(c rune) bool { return c < 0x20 || c > 0x7e })
}

// pruneCommands runs only while commandMu is held.
func (s *Server) pruneCommands(imei string, now time.Time) {
	queue := s.commands[imei]
	for len(queue) > 0 && !queue[0].expiresAt.After(now) {
		queue = queue[1:]
	}
	if len(queue) == 0 {
		delete(s.commands, imei)
	} else {
		s.commands[imei] = queue
	}
}

// flushCommands is called by the connection's single writer after its ACK.
// Never retry uncertain writes: repeating a vehicle operation may be unsafe.
func (s *Server) flushCommands(conn net.Conn, imei string) error {
	s.commandMu.Lock()
	s.pruneCommands(imei, time.Now())
	queue := s.commands[imei]
	delete(s.commands, imei)
	s.commandMu.Unlock()
	for _, command := range queue {
		if !command.expiresAt.After(time.Now()) {
			continue
		}
		sequence := uint16(s.commandSequence.Add(1))
		frame, err := protocol.BuildOnlineCommand(sequence, command.text)
		if err != nil {
			return err
		}
		if err = conn.SetWriteDeadline(time.Now().Add(5 * time.Second)); err != nil {
			return err
		}
		n, err := conn.Write(frame)
		if err == nil && n != len(frame) {
			err = io.ErrShortWrite
		}
		if err != nil {
			s.logger.Warn("command write failed; execution unknown, batch not retried", "imei", imei, "sequence", sequence, "error", err)
			return err
		}
		// Socket delivery does not prove that the tracker executed the operation.
		s.logger.Info("command written to socket", "imei", imei, "sequence", sequence)
	}
	return nil
}
