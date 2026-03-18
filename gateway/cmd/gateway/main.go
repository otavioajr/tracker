// gateway/cmd/gateway/main.go
package main

import (
	"fmt"
	"os"

	"github.com/otavioajr/tracker/gateway/internal/config"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to load config: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("tracker gateway starting on :%d\n", cfg.TCPPort)
}
