# Gateway Protocol Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the gateway accept the live compact Suntech `STT;...` variant, separate protocol detection from parser logic, and persist unknown traffic and parser failures as first-class operational records.

**Architecture:** The first slice implements Phase 1 and the backend core of Phase 2 from the approved spec. Detection becomes an explicit stage with family/variant metadata, parsers stay typed in Go, and the gateway routes outcomes into `pending_devices`, `unknown_frames`, or `protocol_failures` instead of collapsing everything into logs.

**Tech Stack:** Go 1.24 gateway, PostgreSQL/Supabase migrations, pgx, Next.js monorepo conventions, Go test

---

## File Structure

### New files

- `gateway/internal/protocol/detection.go`
  Purpose: detection result types, family/variant metadata, explicit detector, fingerprint helpers.
- `gateway/internal/protocol/detection_test.go`
  Purpose: detector regression tests for Suntech ASCII variants, Suntech binary, GT06, ambiguous/unknown paths.
- `gateway/internal/storage/protocol_events.go`
  Purpose: writers for `unknown_frames` and `protocol_failures`, with deduplication by fingerprint/family+variant+error.
- `gateway/internal/storage/protocol_events_test.go`
  Purpose: unit tests for deduplication key and normalization helpers.
- `supabase/migrations/20260410130000_protocol_intake_events.sql`
  Purpose: create `unknown_frames` and `protocol_failures`, and extend `pending_devices` with `protocol_family` and `protocol_variant`.

### Modified files

- `gateway/internal/protocol/protocol.go`
  Purpose: extend parser contract with family/variant-aware parse context and outcome metadata.
- `gateway/internal/protocol/suntech.go`
  Purpose: accept `STT;...` frames and parse the compact ASCII layout.
- `gateway/internal/protocol/suntech_test.go`
  Purpose: lock in both legacy Suntech ASCII and the production `STT;...` compact fixture.
- `gateway/internal/protocol/suntech_binary.go`
  Purpose: normalize business-facing family/variant metadata for binary Suntech.
- `gateway/internal/protocol/gt06.go`
  Purpose: expose stable family/variant metadata to the detector/router.
- `gateway/internal/server/tcp.go`
  Purpose: replace parser-local detection with explicit detection outcome routing; surface unknown frames and parser failures.
- `gateway/internal/server/tcp_test.go`
  Purpose: integration-level tests for known, unknown, and parse-failure flows.
- `gateway/cmd/gateway/main.go`
  Purpose: wire new storage writers and route outcomes by family/variant instead of parser implementation name.
- `gateway/internal/storage/pending.go`
  Purpose: persist protocol family/variant on pending devices and keep Suntech binary normalized to family `suntech`.
- `gateway/internal/storage/pending_test.go`
  Purpose: assert protocol normalization and pending metadata behavior.
- `web/src/types/database.ts`
  Purpose: refresh generated Supabase types after the migration lands.

## Task 1: Add Protocol Intake Tables and Pending Metadata

**Files:**
- Create: `supabase/migrations/20260410130000_protocol_intake_events.sql`
- Modify: `web/src/types/database.ts`

- [ ] **Step 1: Write the migration with first-class protocol event tables**

```sql
ALTER TABLE pending_devices
  ADD COLUMN protocol_family TEXT NOT NULL DEFAULT 'suntech',
  ADD COLUMN protocol_variant TEXT;

UPDATE pending_devices
SET protocol_family = protocol::text
WHERE protocol_family IS NULL OR protocol_family = '';

CREATE TABLE unknown_frames (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transport TEXT NOT NULL DEFAULT 'tcp',
  remote_ip TEXT,
  raw_preview TEXT NOT NULL,
  raw_payload TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  candidate_family TEXT,
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0,
  occurrences INT NOT NULL DEFAULT 1,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewing', 'mapped', 'ignored')),
  notes TEXT
);

CREATE UNIQUE INDEX idx_unknown_frames_fingerprint ON unknown_frames(fingerprint);

CREATE TABLE protocol_failures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family TEXT NOT NULL,
  variant TEXT,
  error_code TEXT NOT NULL,
  error_message TEXT NOT NULL,
  raw_payload TEXT NOT NULL,
  device_hint TEXT,
  remote_ip TEXT,
  occurrences INT NOT NULL DEFAULT 1,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_protocol_failures_group
  ON protocol_failures(family, COALESCE(variant, ''), error_code, COALESCE(device_hint, ''));
```

- [ ] **Step 2: Validate the migration against the linked Supabase cloud project**

Run:

```bash
mkdir -p supabase/.temp
cp /Users/otavioajr/Documents/Projetos/tracker/supabase/.temp/project-ref supabase/.temp/project-ref
supabase db push --dry-run --linked
```

Expected: the CLI reaches the remote project and either:

- prints the migration dry-run successfully, or
- reports a pre-existing remote migration history mismatch that must be handled separately from this task.

Do not use Docker or `supabase db reset --local` in this repository.

- [ ] **Step 3: Update Supabase types for implementation work**

Preferred path:

```bash
make db-types
```

If `make db-types` cannot reflect the additive schema yet because the migration has not been applied to the remote project, update `web/src/types/database.ts` manually in this task so the implementation can compile. The final regeneration from the live schema must happen after `make db-push` in Task 7.

Expected: `web/src/types/database.ts` includes `unknown_frames`, `protocol_failures`, and the new `pending_devices.protocol_family` / `pending_devices.protocol_variant` fields.

- [ ] **Step 4: Sanity-check generated types**

```ts
// Expect these shapes to exist after regeneration.
type UnknownFrameRow =
  Database["public"]["Tables"]["unknown_frames"]["Row"];

type ProtocolFailureRow =
  Database["public"]["Tables"]["protocol_failures"]["Row"];
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260410130000_protocol_intake_events.sql web/src/types/database.ts
git commit -m "feat: adiciona eventos operacionais de protocolos"
```

## Task 2: Introduce Explicit Detection Types and Registry

**Files:**
- Create: `gateway/internal/protocol/detection.go`
- Create: `gateway/internal/protocol/detection_test.go`
- Modify: `gateway/internal/protocol/protocol.go`

- [ ] **Step 1: Write the failing detector tests**

```go
func TestDetectorDetectsCompactSuntechASCII(t *testing.T) {
	detector := NewDetector(
		NewFingerprintRule("suntech", "st300_ascii", MatchASCII("ST300")),
		NewFingerprintRule("suntech", "st340_ascii", MatchASCII("ST340")),
		NewFingerprintRule("suntech", "stt_compact_ascii", MatchASCII("STT;")),
		NewFingerprintRule("suntech", "st310_binary", MatchBytePrefix(0x02)),
		NewFingerprintRule("gt06", "gt06", MatchBytePrefix(0x78, 0x78), MatchMinLength(2)),
	)

	result, ok := detector.Detect([]byte("STT;1910006088;FFFFFF;191"))
	if !ok {
		t.Fatal("expected detector match")
	}

	if result.Family != "suntech" || result.Variant != "stt_compact_ascii" {
		t.Fatalf("got family=%q variant=%q", result.Family, result.Variant)
	}
}

func TestDetectorReturnsUnknownForNoise(t *testing.T) {
	detector := NewDefaultDetector()
	if _, ok := detector.Detect([]byte("GET / HTTP/1.1")); ok {
		t.Fatal("expected no match for scanner traffic")
	}
}
```

- [ ] **Step 2: Run the detector test to verify it fails**

Run: `cd gateway && go test ./internal/protocol -run 'TestDetectorDetectsCompactSuntechASCII|TestDetectorReturnsUnknownForNoise' -v`

Expected: FAIL because `NewDetector`, `NewFingerprintRule`, and `NewDefaultDetector` do not exist yet.

- [ ] **Step 3: Add the minimal detector implementation**

```go
type DetectionResult struct {
	Family      string
	Variant     string
	Confidence  float64
	Fingerprint string
	ParserName  string
}

type FingerprintRule struct {
	Family     string
	Variant    string
	ParserName string
	Matchers   []Matcher
}

type Detector struct {
	rules []FingerprintRule
}

func (d *Detector) Detect(peek []byte) (DetectionResult, bool) {
	for _, rule := range d.rules {
		if rule.matches(peek) {
			return DetectionResult{
				Family:      rule.Family,
				Variant:     rule.Variant,
				Confidence:  1,
				Fingerprint: fingerprintPreview(peek),
				ParserName:  rule.ParserName,
			}, true
		}
	}
	return DetectionResult{}, false
}
```

- [ ] **Step 4: Adapt the parser registry to resolve by parser name**

```go
type Parser interface {
	Name() string
	ReadFrame(reader *bufio.Reader) ([]byte, error)
	Parse(data []byte, session *Session) (*Position, error)
	ACK(data []byte, session *Session) []byte
}

type Registry struct {
	parsers map[string]Parser
}

func (r *Registry) Get(name string) (Parser, bool) {
	p, ok := r.parsers[name]
	return p, ok
}
```

- [ ] **Step 5: Run protocol tests and commit**

Run: `cd gateway && go test ./internal/protocol -v`

Expected: PASS, including the new detector coverage.

```bash
git add gateway/internal/protocol/protocol.go gateway/internal/protocol/detection.go gateway/internal/protocol/detection_test.go
git commit -m "feat: adiciona detector explicito de protocolos"
```

## Task 3: Teach Suntech ASCII Parser the Compact `STT;...` Variant

**Files:**
- Modify: `gateway/internal/protocol/suntech.go`
- Modify: `gateway/internal/protocol/suntech_test.go`

- [ ] **Step 1: Write the failing compact Suntech parser test using the production fixture**

```go
func TestSuntechParseCompactSTTMessage(t *testing.T) {
	p := NewSuntechParser()
	data := []byte("STT;1910006088;FFFFFF;191;1.0.14;0;20260410;11:22:16;0C3F4D15;724;10;E93F;54;-23.616218;-46.737257;0.00;0.00;16;1;00000000;00000000;0;1;0057;;0083800F;4.0;12.41;;;;;;")

	pos, err := p.Parse(data, &Session{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if pos.IMEI != "1910006088" {
		t.Fatalf("IMEI = %q", pos.IMEI)
	}
	if pos.Latitude != -23.616218 || pos.Longitude != -46.737257 {
		t.Fatalf("coords = %f,%f", pos.Latitude, pos.Longitude)
	}
	if pos.Speed != 0 || pos.Heading != 0 {
		t.Fatalf("speed=%f heading=%f", pos.Speed, pos.Heading)
	}
	if pos.Satellites != 16 || !pos.Ignition {
		t.Fatalf("sat=%d ignition=%v", pos.Satellites, pos.Ignition)
	}
}
```

- [ ] **Step 2: Run the Suntech tests to verify the new fixture fails**

Run: `cd gateway && go test ./internal/protocol -run TestSuntechParseCompactSTTMessage -v`

Expected: FAIL because the current parser expects the legacy `ST300...` field layout.

- [ ] **Step 3: Extend `Identify` and `Parse` for the compact layout**

```go
func (p *SuntechParser) Name() string { return "suntech" }

func (p *SuntechParser) IsCompact(fields []string) bool {
	return len(fields) >= 19 && fields[0] == "STT"
}

func (p *SuntechParser) Parse(data []byte, session *Session) (*Position, error) {
	raw := strings.TrimRight(string(data), "\r\n")
	fields := strings.Split(raw, ";")

	if p.IsCompact(fields) {
		return parseCompactSTT(fields, raw)
	}

	return parseLegacySuntech(fields, raw)
}

func parseCompactSTT(fields []string, raw string) (*Position, error) {
	deviceTime, err := time.Parse("20060102;15:04:05", fields[6]+";"+fields[7])
	if err != nil {
		return nil, fmt.Errorf("suntech compact: invalid datetime: %w", err)
	}

	lat, _ := strconv.ParseFloat(fields[13], 64)
	lon, _ := strconv.ParseFloat(fields[14], 64)
	speed, _ := strconv.ParseFloat(fields[15], 64)
	heading, _ := strconv.ParseFloat(fields[16], 64)
	sats, _ := strconv.Atoi(fields[17])

	return &Position{
		IMEI:       fields[1],
		Latitude:   lat,
		Longitude:  lon,
		Speed:      speed,
		Heading:    heading,
		Satellites: sats,
		Ignition:   fields[18] == "1",
		Battery:    mustParseOptionalFloat(fields[27]),
		DeviceTime: deviceTime,
		RawData:    raw,
	}, nil
}
```

- [ ] **Step 4: Run the focused protocol tests**

Run: `cd gateway && go test ./internal/protocol -run 'TestSuntech' -v`

Expected: PASS for both legacy and compact Suntech variants.

- [ ] **Step 5: Commit**

```bash
git add gateway/internal/protocol/suntech.go gateway/internal/protocol/suntech_test.go
git commit -m "feat: suporta variante compacta stt do suntech"
```

## Task 4: Persist Unknown Frames and Parser Failures in Storage

**Files:**
- Create: `gateway/internal/storage/protocol_events.go`
- Create: `gateway/internal/storage/protocol_events_test.go`
- Modify: `gateway/internal/storage/pending.go`
- Modify: `gateway/internal/storage/pending_test.go`

- [ ] **Step 1: Write failing storage tests for deduplicated unknown frames and protocol failures**

```go
func TestNormalizeProtocolIdentity(t *testing.T) {
	family, variant := normalizeProtocolIdentity("suntech", "st310_binary")
	if family != "suntech" || variant != "st310_binary" {
		t.Fatalf("got %q/%q", family, variant)
	}
}

func TestUnknownFrameFingerprintKey(t *testing.T) {
	key := unknownFingerprintKey("STT;1910006088;FFFFFF;191")
	if key == "" {
		t.Fatal("expected fingerprint key")
	}
}

func TestProtocolFailureGroupKey(t *testing.T) {
	key := protocolFailureGroupKey("suntech", "stt_compact_ascii", "invalid_datetime", "1910006088")
	if key != "suntech|stt_compact_ascii|invalid_datetime|1910006088" {
		t.Fatalf("unexpected key %q", key)
	}
}
```

- [ ] **Step 2: Run the storage tests to verify the new helpers are missing**

Run: `cd gateway && go test ./internal/storage -run 'TestNormalizeProtocolIdentity|TestUnknownFrameFingerprintKey|TestProtocolFailureGroupKey' -v`

Expected: FAIL because the helpers and event writer do not exist yet.

- [ ] **Step 3: Implement the protocol event writer and extend pending tracking**

```go
type ProtocolEventWriter struct {
	pool   *pgxpool.Pool
	logger *slog.Logger
}

func (w *ProtocolEventWriter) TrackUnknownFrame(ctx context.Context, event UnknownFrameEvent) {
	_, err := w.pool.Exec(ctx, `
		INSERT INTO unknown_frames (transport, remote_ip, raw_preview, raw_payload, fingerprint, candidate_family, confidence, first_seen_at, last_seen_at, occurrences)
		VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now(), 1)
		ON CONFLICT (fingerprint) DO UPDATE SET
		  last_seen_at = now(),
		  remote_ip = EXCLUDED.remote_ip,
		  occurrences = unknown_frames.occurrences + 1
	`, event.Transport, event.RemoteIP, event.RawPreview, event.RawPayload, event.Fingerprint, event.CandidateFamily, event.Confidence)
	if err != nil {
		w.logger.Error("failed to track unknown frame", "fingerprint", event.Fingerprint, "error", err)
	}
}

func (pw *PendingWriter) Track(ctx context.Context, serial, family, variant, ipAddress string) {
	family, variant = normalizeProtocolIdentity(family, variant)
	_, err := pw.pool.Exec(ctx, `
		INSERT INTO pending_devices (serial, protocol, protocol_family, protocol_variant, ip_address, first_seen_at, last_seen_at, message_count)
		VALUES ($1, $2::device_protocol, $2, $3, $4, now(), now(), 1)
		ON CONFLICT (serial) DO UPDATE SET
		  protocol_family = EXCLUDED.protocol_family,
		  protocol_variant = EXCLUDED.protocol_variant,
		  last_seen_at = now(),
		  ip_address = EXCLUDED.ip_address,
		  message_count = pending_devices.message_count + 1
	`, serial, family, variant, ipAddress)
	_ = err
}
```

- [ ] **Step 4: Run focused storage tests**

Run: `cd gateway && go test ./internal/storage -v`

Expected: PASS, including the existing pending tests and the new event helper coverage.

- [ ] **Step 5: Commit**

```bash
git add gateway/internal/storage/protocol_events.go gateway/internal/storage/protocol_events_test.go gateway/internal/storage/pending.go gateway/internal/storage/pending_test.go
git commit -m "feat: persiste frames desconhecidos e falhas de parser"
```

## Task 5: Refactor TCP Handling to Route by Detection Outcome

**Files:**
- Modify: `gateway/internal/server/tcp.go`
- Modify: `gateway/internal/server/tcp_test.go`
- Modify: `gateway/cmd/gateway/main.go`

- [ ] **Step 1: Write failing server tests for unknown and parse-failure routing**

```go
type mockOutcomeHandler struct {
	positions []*protocol.Position
	unknowns  []server.UnknownFrame
	failures  []server.ProtocolFailure
}

func (m *mockOutcomeHandler) HandlePosition(pos *protocol.Position, family, variant string) {
	m.positions = append(m.positions, pos)
}

func (m *mockOutcomeHandler) HandleUnknownFrame(frame server.UnknownFrame) {
	m.unknowns = append(m.unknowns, frame)
}

func (m *mockOutcomeHandler) HandleProtocolFailure(failure server.ProtocolFailure) {
	m.failures = append(m.failures, failure)
}
```

Add tests:

```go
func TestTCPServerRoutesUnknownFrames(t *testing.T) {
	handler := &mockOutcomeHandler{}
	detector := protocol.NewDefaultDetector()
	registry := protocol.NewRegistry(protocol.NewSuntechParser(), protocol.NewSuntechBinaryParser(), protocol.NewGT06Parser())
	srv := New(Config{Port: 0, Logger: slog.Default()}, registry, detector, handler)

	go func() { _ = srv.Start() }()
	defer srv.Stop()

	conn, err := net.Dial("tcp", srv.Addr())
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer conn.Close()

	if _, err := conn.Write([]byte("GET / HTTP/1.1\r\n")); err != nil {
		t.Fatalf("write: %v", err)
	}

	require.Eventually(t, func() bool { return len(handler.unknowns) == 1 }, time.Second, 10*time.Millisecond)
}

func TestTCPServerRoutesParserFailures(t *testing.T) {
	handler := &mockOutcomeHandler{}
	parser := &failingParser{name: "suntech", err: errors.New("invalid_datetime")}
	detector := protocol.NewDetector(
		protocol.NewFingerprintRule("suntech", "stt_compact_ascii", "suntech", protocol.MatchASCII("STT;")),
	)
	registry := protocol.NewRegistry(parser)
	srv := New(Config{Port: 0, Logger: slog.Default()}, registry, detector, handler)

	go func() { _ = srv.Start() }()
	defer srv.Stop()

	conn, err := net.Dial("tcp", srv.Addr())
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer conn.Close()

	_, err = conn.Write([]byte("STT;1910006088;FFFFFF;191\r\n"))
	if err != nil {
		t.Fatalf("write: %v", err)
	}

	require.Eventually(t, func() bool { return len(handler.failures) == 1 }, time.Second, 10*time.Millisecond)
}
```

- [ ] **Step 2: Run the server tests to verify the new outcome hooks do not exist yet**

Run: `cd gateway && go test ./internal/server -run 'TestTCPServerRoutesUnknownFrames|TestTCPServerRoutesParserFailures' -v`

Expected: FAIL because `UnknownFrame`, `ProtocolFailure`, and the expanded handler contract do not exist.

- [ ] **Step 3: Refactor `tcp.go` to use detector + parser registry**

```go
type OutcomeHandler interface {
	HandlePosition(pos *protocol.Position, family, variant string)
	HandleUnknownFrame(frame UnknownFrame)
	HandleProtocolFailure(failure ProtocolFailure)
}

func (s *Server) handleConnection(conn net.Conn) {
	peek, err := reader.Peek(8)
	if err != nil {
		s.logger.Debug("connection closed during peek", "remote", remoteAddr, "error", err)
		return
	}

	match, ok := s.detector.Detect(peek)
	if !ok {
		s.handler.HandleUnknownFrame(UnknownFrame{
			RemoteAddr:   remoteAddr,
			RawPreview:   string(peek),
			RawPayload:   string(peek),
			Fingerprint:  protocol.FingerprintPreview(peek),
			Confidence:   0,
		})
		return
	}

	parser, ok := s.registry.Get(match.ParserName)
	if !ok {
		s.handler.HandleProtocolFailure(ProtocolFailure{
			Family: match.Family,
			Variant: match.Variant,
			ErrorCode: "parser_not_registered",
			RawPayload: string(peek),
		})
		return
	}
}
```

- [ ] **Step 4: Wire the gateway handler in `main.go`**

```go
type gateway struct {
	writer         *storage.Writer
	pending        *storage.PendingWriter
	protocolEvents *storage.ProtocolEventWriter
}

func (g *gateway) HandlePosition(pos *protocol.Position, family, variant string) {
	info, ok := g.writer.LookupDevice(pos.IMEI)
	if !ok {
		g.pending.Track(context.Background(), pos.IMEI, family, variant, pos.RemoteAddr)
		return
	}
	g.writer.Enqueue(pos)
}

func (g *gateway) HandleUnknownFrame(frame server.UnknownFrame) {
	g.protocolEvents.TrackUnknownFrame(context.Background(), storage.UnknownFrameEvent(frame))
}
```

- [ ] **Step 5: Run server and gateway tests, then commit**

Run: `cd gateway && go test ./internal/server ./cmd/gateway ./internal/storage -v`

Expected: PASS, with the new routing behavior covered.

```bash
git add gateway/internal/server/tcp.go gateway/internal/server/tcp_test.go gateway/cmd/gateway/main.go
git commit -m "feat: roteia resultados de ingestao por detector"
```

## Task 6: Lock in End-to-End Regression Coverage

**Files:**
- Modify: `gateway/internal/protocol/suntech_test.go`
- Modify: `gateway/internal/server/tcp_test.go`
- Modify: `gateway/internal/storage/writer_test.go`

- [ ] **Step 1: Add end-to-end tests for the three critical operational outcomes**

```go
func TestGatewaySTTCompactUnknownDeviceBecomesPending(t *testing.T) {
	pos := mustParseCompactSTT(t)
	gw := newTestGatewayWithoutRegisteredDevice()

	gw.HandlePosition(pos, "suntech", "stt_compact_ascii")

	require.Equal(t, "1910006088", gw.pendingCalls[0].Serial)
	require.Equal(t, "suntech", gw.pendingCalls[0].Family)
	require.Equal(t, "stt_compact_ascii", gw.pendingCalls[0].Variant)
}

func TestGatewayUnknownScannerTrafficBecomesUnknownFrame(t *testing.T) {
	gw := newTestGatewayWithoutRegisteredDevice()
	gw.HandleUnknownFrame(server.UnknownFrame{
		RemoteAddr:  "178.83.200.2:60000",
		RawPreview:  "GET / HT",
		RawPayload:  "GET / HTTP/1.1",
		Fingerprint: "474554202f204854",
	})

	require.Len(t, gw.unknownFrameCalls, 1)
	require.Equal(t, "GET / HTTP/1.1", gw.unknownFrameCalls[0].RawPayload)
}

func TestGatewayKnownFamilyBadPayloadBecomesProtocolFailure(t *testing.T) {
	gw := newTestGatewayWithoutRegisteredDevice()
	gw.HandleProtocolFailure(server.ProtocolFailure{
		Family:      "suntech",
		Variant:     "stt_compact_ascii",
		ErrorCode:   "invalid_datetime",
		RawPayload:  "STT;1910006088;FFFFFF;191;1.0.14;0;BADDATE",
		DeviceHint:  "1910006088",
	})

	require.Len(t, gw.protocolFailureCalls, 1)
	require.Equal(t, "invalid_datetime", gw.protocolFailureCalls[0].ErrorCode)
}
```

- [ ] **Step 2: Run the focused regression suite and verify failures first**

Run: `cd gateway && go test ./internal/protocol ./internal/server ./internal/storage -run 'TestGatewaySTTCompactUnknownDeviceBecomesPending|TestGatewayUnknownScannerTrafficBecomesUnknownFrame|TestGatewayKnownFamilyBadPayloadBecomesProtocolFailure' -v`

Expected: FAIL until the missing regression assertions are implemented.

- [ ] **Step 3: Fill in the missing assertions and test helpers**

```go
func compactSTTMessage() []byte {
	return []byte("STT;1910006088;FFFFFF;191;1.0.14;0;20260410;11:22:16;0C3F4D15;724;10;E93F;54;-23.616218;-46.737257;0.00;0.00;16;1;00000000;00000000;0;1;0057;;0083800F;4.0;12.41;;;;;;\r\n")
}
```

- [ ] **Step 4: Run the full gateway test suite**

Run: `cd gateway && go test ./...`

Expected: PASS for the complete gateway package set.

- [ ] **Step 5: Commit**

```bash
git add gateway/internal/protocol/suntech_test.go gateway/internal/server/tcp_test.go gateway/internal/storage/writer_test.go
git commit -m "test: cobre onboarding operacional de protocolos"
```

## Task 7: Verify Production Behavior and Roll Out

**Files:**
- Modify: none

- [ ] **Step 1: Build the Linux gateway binary**

Run: `cd gateway && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o bin/gateway-linux ./cmd/gateway`

Expected: binary created at `gateway/bin/gateway-linux`.

- [ ] **Step 2: Push the migration and deploy the binary**

Run:

```bash
make db-push
make db-types
scp gateway/bin/gateway-linux ubuntu@137.131.168.96:~/tracker/gateway-binary-new
ssh ubuntu@137.131.168.96 'set -e; pkill -f ./gateway-binary || pkill -f gateway-binary || true; sleep 2; mv ~/tracker/gateway-binary-new ~/tracker/gateway-binary; chmod +x ~/tracker/gateway-binary; cd ~/tracker; source gateway/.env; nohup env DATABASE_URL="$DATABASE_URL" TCP_PORT=5001 METRICS_PORT=9090 ./gateway-binary > gateway.log 2>&1 < /dev/null &'
```

Expected: migration applies successfully to Supabase cloud, `web/src/types/database.ts` is regenerated from the real remote schema, and the new binary is installed and restarted on port `5001`.

- [ ] **Step 3: Verify startup health on the Oracle VM**

Run:

```bash
ssh ubuntu@137.131.168.96 'pgrep -af gateway-binary && ss -lntp | grep 5001 && tail -n 20 ~/tracker/gateway.log'
```

Expected: one live `gateway-binary` process, `*:5001` listening, and log lines including `connected to database` and `tracker gateway started`.

- [ ] **Step 4: Verify live device outcomes**

Run:

```bash
ssh ubuntu@137.131.168.96 'grep -aE "pending device tracked|failed to track pending device|failed to track unknown frame|failed to track protocol failure|parse error|unknown protocol" ~/tracker/gateway.log | tail -n 50'
```

Expected:

- compact `STT;...` traffic no longer appears as `unknown protocol`
- an unlinked real device appears in `pending_devices`
- unsupported traffic appears in `unknown_frames`
- known-family parse breakage appears in `protocol_failures`

- [ ] **Step 5: Commit deployment helper changes if any**

```bash
git status --short
```

Expected: clean working tree, or only intentional deployment helper changes staged and committed with a focused message.

## Self-Review Checklist

- Spec coverage:
  - live `STT;...` fix is covered in Task 3
  - detector/parser separation is covered in Tasks 2 and 5
  - `unknown_frames` and `protocol_failures` are covered in Tasks 1 and 4
  - pending-device family/variant persistence is covered in Task 4
  - end-to-end operational verification is covered in Tasks 6 and 7
- Placeholder scan:
  - no deferred placeholders or vague “complete later” instructions remain
- Type consistency:
  - business-facing identity uses `family` and `variant`
  - parser lookup remains internal via `ParserName`
  - TCP routing always ends in one of: position, unknown frame, or protocol failure
