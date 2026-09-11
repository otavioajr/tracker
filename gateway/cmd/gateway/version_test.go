package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"testing"

	"github.com/otavioajr/tracker/gateway/internal/buildinfo"
)

func TestWriteVersion(t *testing.T) {
	// Empty database settings prove that this path only reads build metadata.
	t.Setenv("DATABASE_URL", "")
	var output bytes.Buffer
	handled, err := writeVersion([]string{"--version"}, &output)
	if !handled || err != nil {
		t.Fatalf("handled=%v, err=%v", handled, err)
	}
	var got buildinfo.Info
	if err := json.Unmarshal(output.Bytes(), &got); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if want := buildinfo.Current(); got != want {
		t.Fatalf("got %+v, want %+v", got, want)
	}
}

func TestWriteVersionIgnoresOtherArguments(t *testing.T) {
	for _, args := range [][]string{nil, {"--other"}, {"--version", "extra"}} {
		var output bytes.Buffer
		handled, err := writeVersion(args, &output)
		if handled || err != nil || output.Len() != 0 {
			t.Fatalf("args=%v: handled=%v, err=%v, output=%q", args, handled, err, output.String())
		}
	}
}

type failingVersionWriter struct{ err error }

func (w failingVersionWriter) Write([]byte) (int, error) { return 0, w.err }

func TestWriteVersionPropagatesOutputError(t *testing.T) {
	want := errors.New("output unavailable")
	handled, err := writeVersion([]string{"--version"}, failingVersionWriter{err: want})
	if !handled || !errors.Is(err, want) {
		t.Fatalf("handled=%v, err=%v", handled, err)
	}
}
