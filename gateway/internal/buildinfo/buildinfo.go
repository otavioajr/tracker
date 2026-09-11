// Package buildinfo identifies the source and toolchain embedded in a gateway binary.
package buildinfo

import (
	"runtime"
	"runtime/debug"
)

// These strings are overridden by the Makefile with go build -ldflags -X.
var (
	revision  string
	buildTime string
	dirty     string
)

// Info is shared by startup logs and the machine-readable --version response.
type Info struct {
	Revision  string `json:"revision"`
	BuildTime string `json:"build_time"`
	Dirty     bool   `json:"dirty"`
	GoVersion string `json:"go_version"`
}

// Current also supports direct go builds through Go's embedded VCS metadata.
func Current() Info {
	metadata, _ := debug.ReadBuildInfo()
	return resolve(metadata, revision, buildTime, dirty)
}

func resolve(metadata *debug.BuildInfo, revision, buildTime, dirty string) Info {
	// Missing source metadata must never assert that a binary came from clean code.
	info := Info{Revision: "unknown", BuildTime: "unknown", Dirty: true, GoVersion: runtime.Version()}
	if metadata != nil {
		if metadata.GoVersion != "" {
			info.GoVersion = metadata.GoVersion
		}
		for _, setting := range metadata.Settings {
			switch setting.Key {
			case "vcs.revision":
				if setting.Value != "" {
					info.Revision = setting.Value
				}
			case "vcs.modified":
				info.Dirty = setting.Value != "false"
			}
		}
	}
	if revision != "" {
		info.Revision = revision
	}
	// vcs.time is a commit timestamp, not evidence of when a direct build ran.
	if buildTime != "" {
		info.BuildTime = buildTime
	}
	if dirty != "" {
		info.Dirty = dirty != "false"
	}
	return info
}
