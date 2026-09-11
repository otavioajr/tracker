package buildinfo

import (
	"runtime/debug"
	"testing"
)

func TestResolve(t *testing.T) {
	metadata := &debug.BuildInfo{
		GoVersion: "go1.24.0",
		Settings: []debug.BuildSetting{
			{Key: "vcs.revision", Value: "commit-fallback"},
			{Key: "vcs.time", Value: "2026-09-01T00:00:00Z"},
			{Key: "vcs.modified", Value: "false"},
		},
	}
	t.Run("direct build keeps unknown compilation time", func(t *testing.T) {
		got := resolve(metadata, "", "", "")
		want := Info{Revision: "commit-fallback", BuildTime: "unknown", Dirty: false, GoVersion: "go1.24.0"}
		if got != want {
			t.Fatalf("got %+v, want %+v", got, want)
		}
	})
	t.Run("linker values override vcs", func(t *testing.T) {
		got := resolve(metadata, "injected-commit", "2026-09-11T12:00:00Z", "true")
		want := Info{Revision: "injected-commit", BuildTime: "2026-09-11T12:00:00Z", Dirty: true, GoVersion: "go1.24.0"}
		if got != want {
			t.Fatalf("got %+v, want %+v", got, want)
		}
	})
	t.Run("missing metadata is conservatively dirty", func(t *testing.T) {
		got := resolve(nil, "", "", "")
		if got.Revision != "unknown" || got.BuildTime != "unknown" || !got.Dirty || got.GoVersion == "" {
			t.Fatalf("unexpected defaults: %+v", got)
		}
	})
	t.Run("explicit clean linker metadata", func(t *testing.T) {
		if got := resolve(nil, "commit", "time", "false"); got.Dirty {
			t.Fatalf("explicit clean build marked dirty: %+v", got)
		}
	})
	// Malformed metadata must not silently label a build as clean.
	for _, value := range []string{"true", "invalid", ""} {
		t.Run("vcs modified "+value, func(t *testing.T) {
			got := resolve(&debug.BuildInfo{Settings: []debug.BuildSetting{{Key: "vcs.modified", Value: value}}}, "", "", "")
			if !got.Dirty {
				t.Fatalf("modified=%q unexpectedly clean", value)
			}
		})
	}
}

func TestCurrent(t *testing.T) {
	if got := Current(); got.Revision == "" || got.BuildTime == "" || got.GoVersion == "" {
		t.Fatalf("missing version fields: %+v", got)
	}
}
