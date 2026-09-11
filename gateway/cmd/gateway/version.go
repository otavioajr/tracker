package main

import (
	"encoding/json"
	"io"

	"github.com/otavioajr/tracker/gateway/internal/buildinfo"
)

// writeVersion runs before configuration loading so --version never needs a database.
func writeVersion(args []string, output io.Writer) (bool, error) {
	if len(args) != 1 || args[0] != "--version" {
		return false, nil
	}
	return true, json.NewEncoder(output).Encode(buildinfo.Current())
}
