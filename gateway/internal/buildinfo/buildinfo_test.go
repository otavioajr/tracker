package buildinfo

import (
	"runtime"
	"runtime/debug"
	"testing"
)

func TestResolvePrefersLdflags(t *testing.T) {
	info := resolve(&debug.BuildInfo{
		GoVersion: "go1.24.0",
		Settings: []debug.BuildSetting{
			{Key: "vcs.revision", Value: "abc"},
			{Key: "vcs.modified", Value: "false"},
		},
	}, "def", "2026-09-11T00:00:00Z", "true")
	if info.Revision != "def" || info.BuildTime != "2026-09-11T00:00:00Z" || !info.Dirty {
		t.Fatalf("%+v", info)
	}
}

func TestResolveMissingMetadataIsDirty(t *testing.T) {
	info := resolve(nil, "", "", "")
	if info.Revision != "unknown" || info.BuildTime != "unknown" || !info.Dirty || info.GoVersion != runtime.Version() {
		t.Fatalf("%+v", info)
	}
}
