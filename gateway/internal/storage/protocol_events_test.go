package storage

import "testing"

func TestNormalizeProtocolIdentity(t *testing.T) {
	got := normalizeProtocolIdentity("suntech", "st310_binary")
	want := "suntech/st310_binary"

	if got != want {
		t.Fatalf("normalizeProtocolIdentity() = %q, want %q", got, want)
	}
}

func TestUnknownFingerprintKey(t *testing.T) {
	input := "STT;1910006088;FFFFFF;191"
	a := unknownFingerprintKey(input)
	b := unknownFingerprintKey(input)

	if a == "" {
		t.Fatal("expected non-empty fingerprint key")
	}
	if a != b {
		t.Fatalf("fingerprint key not stable: %q != %q", a, b)
	}
}

func TestProtocolFailureGroupKey(t *testing.T) {
	got := protocolFailureGroupKey("suntech", "stt_compact_ascii", "invalid_datetime", "1910006088")
	want := "suntech|stt_compact_ascii|invalid_datetime|1910006088"
	if got != want {
		t.Fatalf("protocolFailureGroupKey() = %q, want %q", got, want)
	}
}

func TestNormalizeProtocolIdentityWithLegacyFamily(t *testing.T) {
	got := normalizeProtocolIdentity("suntech-binary", "st310_binary")
	want := "suntech/st310_binary"
	if got != want {
		t.Fatalf("normalizeProtocolIdentity() = %q, want %q", got, want)
	}
}
