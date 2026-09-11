package main

import (
	"bytes"
	"encoding/json"
	"testing"

	"github.com/otavioajr/tracker/gateway/internal/buildinfo"
)

func TestWriteVersion(t *testing.T) {
	var buf bytes.Buffer
	handled, err := writeVersion([]string{"--version"}, &buf)
	if !handled || err != nil {
		t.Fatalf("handled=%v err=%v", handled, err)
	}
	var info buildinfo.Info
	if err := json.Unmarshal(buf.Bytes(), &info); err != nil || info.Revision == "" {
		t.Fatalf("invalid json: %q %v", buf.String(), err)
	}
	if handled, err := writeVersion(nil, &buf); handled || err != nil {
		t.Fatal("empty args must not print version")
	}
}
