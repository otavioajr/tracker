# Multi-Protocol Gateway Design

## Problem

The gateway only supports the Suntech protocol. To accept any GPS tracker (GT06, Teltonika, Coban, etc.), the gateway needs a generic multi-protocol framework where adding a new protocol requires only implementing a parser — no server changes.

## Design

### Parser Interface

Replace the current `Parser` interface with one that includes framing control and session state:

```go
type Parser interface {
    Name() string
    Identify(peek []byte) bool
    ReadFrame(reader *bufio.Reader) ([]byte, error)
    Parse(data []byte, session *Session) (*Position, error)
    ACK(data []byte, session *Session) []byte
}

type Session struct {
    IMEI string
    Data map[string]any
}
```

- **ReadFrame**: each protocol controls how it reads bytes from the TCP stream (newline-delimited, length-prefixed, STX/ETX, etc.)
- **Session**: per-connection state. Stateful protocols (GT06) store IMEI on login; stateless protocols (Suntech) ignore it
- **Identify**: called once per connection on peeked bytes to detect the protocol
- **Parse returning nil**: when a packet has no position (login, heartbeat), `Parse` returns `(nil, nil)`. The server skips it and continues the loop.

### Server TCP Flow

The `handleConnection` flow becomes:

1. Peek first bytes from the connection (e.g., 4 bytes)
2. `Registry.Find(peek)` identifies the parser — once per connection
3. Create a `Session{}` for the connection
4. Loop:
   - `frame = parser.ReadFrame(reader)`
   - `pos, err = parser.Parse(frame, &session)`
   - `ack = parser.ACK(frame, &session)`
   - Write ACK if non-nil
   - Call `handler.HandlePosition(pos)` if pos is non-nil

If no parser matches the peek, log "unknown protocol" and close the connection.

The `readFrame` and `readBinaryFrame` functions are removed from `tcp.go` — framing logic moves into each parser's `ReadFrame` method.

### Pending Device Tracking

`HandlePosition` currently hardcodes `"suntech"` as the protocol name for pending devices. This changes to pass the parser name dynamically. The server needs to expose which parser was matched for the connection.

### Suntech Parser Changes

Both `SuntechParser` and `SuntechBinaryParser` are adapted:

- **ReadFrame**: extracted from the current `readFrame`/`readBinaryFrame` in `tcp.go`
  - `SuntechParser.ReadFrame` — reads until `\n`, trims `\r\n`
  - `SuntechBinaryParser.ReadFrame` — reads STX + 2-byte length + payload + ETX
- **Parse/ACK**: signature gains `*Session` parameter but ignores it (IMEI is in every message)
- **Identify**: unchanged

Behavior is identical to current implementation — just restructured.

### GT06 Protocol Parser

New file: `gateway/internal/protocol/gt06.go`

**Framing** (`ReadFrame`):
- Start bits: `0x78 0x78` (short packet) or `0x79 0x79` (long packet)
- Length: 1 byte (short) or 2 bytes (long)
- Payload: protocol number + data + serial number
- Checksum: 2 bytes CRC-ITU
- Stop bits: `0x0D 0x0A`

**Identify**: peek starts with `0x78 0x78` or `0x79 0x79`

**Parse** (by protocol number):
- `0x01` — **Login**: extract IMEI from 8 bytes BCD, store in `session.IMEI`, return `nil` position
- `0x12` / `0x22` — **GPS data**: decode latitude, longitude, speed, heading, satellites. IMEI comes from session
- `0x13` — **Heartbeat**: return `nil` position

**ACK**: GT06 requires ACK for login and some data packets:
- Format: `0x78 0x78 05 [protocol_number] [serial_2bytes] [crc_2bytes] 0x0D 0x0A`

## Files Changed

| File | Change |
|------|--------|
| `gateway/internal/protocol/protocol.go` | New `Parser` interface with `ReadFrame` + `Session` struct |
| `gateway/internal/protocol/suntech.go` | Add `ReadFrame`, `*Session` parameter to Parse/ACK |
| `gateway/internal/protocol/suntech_binary.go` | Add `ReadFrame`, `*Session` parameter to Parse/ACK |
| `gateway/internal/server/tcp.go` | Remove `readFrame`/`readBinaryFrame`, new per-connection loop with peek + session |
| `gateway/cmd/gateway/main.go` | Pass parser name to `pending.Track` dynamically |

## Files Created

| File | Purpose |
|------|---------|
| `gateway/internal/protocol/gt06.go` | GT06 parser (framing, login, GPS, heartbeat, ACK) |
| `gateway/internal/protocol/gt06_test.go` | Tests for GT06 parser |

## Files Unchanged

Storage, alerts, metrics, database, web — no changes needed.

## Implementation Order

1. Refactor `Parser` interface + add `Session` struct
2. Adapt Suntech parsers (move framing logic, add session parameter)
3. Adapt `tcp.go` (new loop with peek/session, remove old frame readers)
4. Adapt `main.go` (dynamic protocol name in pending tracking)
5. Implement GT06 parser
6. Tests for all changes
