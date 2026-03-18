package suntech

import (
	"fmt"
	"math"
	"time"
)

type Point struct {
	Lat, Lon float64
}

func GenerateSTT(imei string, lat, lon, speed, heading float64, ignition bool) string {
	now := time.Now().UTC()
	date := now.Format("20060102")
	timeStr := now.Format("15:04:05")

	ign := "0"
	if ignition {
		ign = "1"
	}

	return fmt.Sprintf("ST300STT;%s;04;374;%s;%s;0CD4A;%f;%f;%06.3f;%06.2f;11;1;%s;12.24\r\n",
		imei, date, timeStr, lat, lon, speed, heading, ign)
}

func GenerateRoute(startLat, startLon, endLat, endLon float64, steps int) []Point {
	if steps < 2 {
		steps = 2
	}

	points := make([]Point, steps)
	for i := 0; i < steps; i++ {
		t := float64(i) / float64(steps-1)
		points[i] = Point{
			Lat: startLat + t*(endLat-startLat),
			Lon: startLon + t*(endLon-startLon),
		}
	}
	return points
}

func Heading(from, to Point) float64 {
	dLon := (to.Lon - from.Lon) * math.Pi / 180
	fromLat := from.Lat * math.Pi / 180
	toLat := to.Lat * math.Pi / 180

	y := math.Sin(dLon) * math.Cos(toLat)
	x := math.Cos(fromLat)*math.Sin(toLat) - math.Sin(fromLat)*math.Cos(toLat)*math.Cos(dLon)

	bearing := math.Atan2(y, x) * 180 / math.Pi
	if bearing < 0 {
		bearing += 360
	}
	return bearing
}
