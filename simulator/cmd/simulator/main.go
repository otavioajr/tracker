package main

import (
	"flag"
	"fmt"
	"net"
	"os"
	"time"

	"github.com/otavioajr/tracker/simulator/internal/suntech"
)

func main() {
	host := flag.String("host", "localhost", "Gateway host")
	port := flag.Int("port", 5001, "Gateway TCP port")
	imei := flag.String("imei", "123456789012345", "Device IMEI")
	interval := flag.Duration("interval", 10*time.Second, "Send interval")
	speed := flag.Float64("speed", 60.0, "Simulated speed (km/h)")
	count := flag.Int("count", 0, "Number of messages (0 = infinite)")
	flag.Parse()

	addr := fmt.Sprintf("%s:%d", *host, *port)
	fmt.Printf("Connecting to %s as IMEI %s...\n", addr, *imei)

	conn, err := net.Dial("tcp", addr)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to connect: %v\n", err)
		os.Exit(1)
	}
	defer conn.Close()

	fmt.Println("Connected. Sending positions...")

	route := suntech.GenerateRoute(-23.55, -46.63, -23.57, -46.65, 20)
	routeIdx := 0
	sent := 0

	for {
		if *count > 0 && sent >= *count {
			break
		}

		point := route[routeIdx%len(route)]
		var heading float64
		if routeIdx > 0 {
			prev := route[(routeIdx-1)%len(route)]
			heading = suntech.Heading(prev, point)
		}

		msg := suntech.GenerateSTT(*imei, point.Lat, point.Lon, *speed, heading, true)
		_, err := conn.Write([]byte(msg))
		if err != nil {
			fmt.Fprintf(os.Stderr, "Send error: %v\n", err)
			os.Exit(1)
		}

		sent++
		routeIdx++
		fmt.Printf("[%d] Sent position: %.6f, %.6f @ %.0f km/h\n", sent, point.Lat, point.Lon, *speed)

		time.Sleep(*interval)
	}

	fmt.Printf("Done. Sent %d positions.\n", sent)
}
