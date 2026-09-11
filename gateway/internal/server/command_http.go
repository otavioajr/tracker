package server

import (
	"crypto/subtle"
	"errors"
	"fmt"
	"net"
	"net/http"
	"time"
)

// NewCommandHTTPServer preserves the local legacy route without exposing vehicle
// control publicly. External binding requires a token and a trusted TLS proxy.
func NewCommandHTTPServer(addr, token string, queue *Server) (*http.Server, error) {
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		return nil, fmt.Errorf("invalid command address: %w", err)
	}
	ip := net.ParseIP(host)
	if token == "" && (ip == nil || !ip.IsLoopback()) {
		return nil, errors.New("COMMAND_TOKEN is required for non-loopback COMMAND_ADDR")
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/cmd", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		if r.Header.Get("Origin") != "" || r.Header.Get("Sec-Fetch-Site") != "" {
			http.Error(w, "browser command requests are forbidden", http.StatusForbidden)
			return
		}
		if token != "" {
			if subtle.ConstantTimeCompare([]byte(r.Header.Get("Authorization")), []byte("Bearer "+token)) != 1 {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
		} else {
			remote, _, err := net.SplitHostPort(r.RemoteAddr)
			if err != nil || !net.ParseIP(remote).IsLoopback() {
				http.Error(w, "local access only", http.StatusForbidden)
				return
			}
		}
		if r.Method != http.MethodGet && r.Method != http.MethodPost {
			w.Header().Set("Allow", "GET, POST")
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		imei, command := r.URL.Query().Get("imei"), r.URL.Query().Get("cmd")
		if imei == "" || command == "" {
			http.Error(w, "need imei and cmd query params", http.StatusBadRequest)
			return
		}
		if err := queue.EnqueueCommand(imei, command); err != nil {
			status := http.StatusBadRequest
			if errors.Is(err, ErrCommandQueueFull) {
				status = http.StatusTooManyRequests
			}
			if errors.Is(err, ErrServerStopped) {
				status = http.StatusServiceUnavailable
			}
			http.Error(w, err.Error(), status)
			return
		}
		fmt.Fprintf(w, "queued: %s -> %s\n", imei, command)
	})
	return &http.Server{
		Addr:              addr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       30 * time.Second,
		MaxHeaderBytes:    8192,
	}, nil
}
