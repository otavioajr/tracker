package storage

import (
	"context"
	"fmt"
	"log/slog"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

const defaultProtocolFamily = "suntech"

// UnknownFrameEvent captures intake attempts that cannot be confidently classified.
type UnknownFrameEvent struct {
	Transport       string
	Fingerprint     string
	RemoteIP        string
	RawPreview      string
	RawPayload      string
	CandidateFamily string
	Confidence      *float64
}

// ProtocolFailureEvent captures parser failures for known protocol families.
type ProtocolFailureEvent struct {
	Family       string
	Variant      string
	ErrorCode    string
	ErrorMessage string
	RawPayload   string
	DeviceHint   string
	RemoteIP     string
}

// ProtocolEventWriter persists protocol intake diagnostics.
type ProtocolEventWriter struct {
	pool   *pgxpool.Pool
	logger *slog.Logger
}

// NewProtocolEventWriter creates a new ProtocolEventWriter.
func NewProtocolEventWriter(pool *pgxpool.Pool, logger *slog.Logger) *ProtocolEventWriter {
	if logger == nil {
		logger = slog.Default()
	}

	return &ProtocolEventWriter{
		pool:   pool,
		logger: logger,
	}
}

// TrackUnknownFrame persists an unknown protocol frame, deduplicating by fingerprint.
func (pew *ProtocolEventWriter) TrackUnknownFrame(ctx context.Context, event UnknownFrameEvent) {
	if pew == nil || pew.pool == nil {
		return
	}

	fingerprint := unknownFingerprintKey(event.Fingerprint)
	if fingerprint == "" {
		fingerprint = unknownFingerprintKey(event.RawPayload)
	}
	if fingerprint == "" {
		pew.logger.Warn("protocol event writer skipped unknown frame with empty fingerprint", "has_payload", event.RawPayload != "")
		return
	}

	rawPreview := strings.TrimSpace(event.RawPreview)
	if rawPreview == "" && event.RawPayload != "" {
		rawPreview = strings.TrimSpace(event.RawPayload)
		if len(rawPreview) > 120 {
			rawPreview = rawPreview[:120]
		}
	}

	candidateFamily := strings.TrimSpace(event.CandidateFamily)
	transport := strings.TrimSpace(event.Transport)
	if transport == "" {
		transport = "tcp"
	}

	_, err := pew.pool.Exec(ctx,
		`INSERT INTO unknown_frames (transport, remote_ip, raw_preview, raw_payload, fingerprint, candidate_family, confidence, occurrences, first_seen_at, last_seen_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, 1, now(), now())
		 ON CONFLICT (fingerprint) DO UPDATE SET
		   occurrences = unknown_frames.occurrences + 1,
		   last_seen_at = now(),
		   remote_ip = EXCLUDED.remote_ip,
		   raw_preview = EXCLUDED.raw_preview,
		   raw_payload = EXCLUDED.raw_payload,
		   candidate_family = COALESCE(NULLIF(EXCLUDED.candidate_family, ''), unknown_frames.candidate_family),
		   confidence = COALESCE(EXCLUDED.confidence, unknown_frames.confidence)`,
		transport,
		nullableString(event.RemoteIP),
		rawPreview,
		event.RawPayload,
		fingerprint,
		candidateFamily,
		event.Confidence,
	)
	if err != nil {
		pew.logger.Error("failed to track unknown frame", "fingerprint", fingerprint, "error", err)
	}
}

// TrackProtocolFailure persists parser errors for known protocol families, deduplicating by group key.
func (pew *ProtocolEventWriter) TrackProtocolFailure(ctx context.Context, event ProtocolFailureEvent) {
	if pew == nil || pew.pool == nil {
		return
	}

	family := normalizeProtocolIdentity(event.Family, event.Variant)
	familyParts := strings.SplitN(family, "/", 2)
	storageFamily := familyParts[0]
	storageVariant := strings.TrimSpace(strings.ToLower(event.Variant))
	groupKey := protocolFailureGroupKey(storageFamily, storageVariant, event.ErrorCode, event.DeviceHint)
	if strings.TrimSpace(event.ErrorCode) == "" {
		pew.logger.Warn("protocol event writer skipped protocol failure with empty error code", "group_key", groupKey)
		return
	}

	_, err := pew.pool.Exec(ctx,
		`INSERT INTO protocol_failures (family, variant, error_code, error_message, raw_payload, device_hint, remote_ip, occurrences, first_seen_at, last_seen_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, 1, now(), now())
		 ON CONFLICT (family, COALESCE(variant, ''), error_code, COALESCE(device_hint, '')) DO UPDATE SET
		   occurrences = protocol_failures.occurrences + 1,
		   last_seen_at = now(),
		   raw_payload = EXCLUDED.raw_payload,
		   remote_ip = EXCLUDED.remote_ip,
		   error_message = EXCLUDED.error_message,
		   error_code = EXCLUDED.error_code`,
		storageFamily,
		nullableString(storageVariant),
		strings.TrimSpace(event.ErrorCode),
		event.ErrorMessage,
		event.RawPayload,
		nullableString(event.DeviceHint),
		nullableString(event.RemoteIP),
	)
	if err != nil {
		pew.logger.Error("failed to track protocol failure", "group_key", groupKey, "error", err)
	}
}

// normalizeProtocolIdentity normalizes family/variant into a canonical protocol identity marker.
// family/variant are returned as "family/variant".
func normalizeProtocolIdentity(family, variant string) string {
	normFamily := strings.TrimSpace(strings.ToLower(family))
	normVariant := strings.TrimSpace(strings.ToLower(variant))

	switch normFamily {
	case "suntech-binary":
		normFamily = "suntech"
	case "":
		normFamily = defaultProtocolFamily
	}

	return fmt.Sprintf("%s/%s", normFamily, normVariant)
}

func protocolEnumFromFamily(family string) string {
	normalized := normalizeProtocolForStorage(strings.TrimSpace(strings.ToLower(family)))
	switch normalized {
	case "suntech", "gt06":
		return normalized
	case "":
		return defaultProtocolFamily
	default:
		return defaultProtocolFamily
	}
}

func normalizeProtocolForStorage(family string) string {
	if strings.TrimSpace(family) == "" {
		return defaultProtocolFamily
	}
	if strings.TrimSpace(family) == "suntech-binary" {
		return "suntech"
	}
	return strings.TrimSpace(family)
}

// unknownFingerprintKey deduplicates unknown-frame tracking groups deterministically.
func unknownFingerprintKey(rawFingerprint string) string {
	return strings.TrimSpace(strings.ToLower(rawFingerprint))
}

// protocolFailureGroupKey identifies parser-failure groups in a stable way.
func protocolFailureGroupKey(family, variant, errorCode, deviceHint string) string {
	normFamily := strings.TrimSpace(strings.ToLower(family))
	normVariant := strings.TrimSpace(strings.ToLower(variant))
	normErrorCode := strings.TrimSpace(strings.ToLower(errorCode))
	normDeviceHint := strings.TrimSpace(strings.ToLower(deviceHint))

	if normFamily == "" {
		normFamily = defaultProtocolFamily
	}

	return fmt.Sprintf("%s|%s|%s|%s", normFamily, normVariant, normErrorCode, normDeviceHint)
}

func nullableString(v string) any {
	v = strings.TrimSpace(v)
	if v == "" {
		return nil
	}
	return v
}
