"use server";

import { createClient } from "@/lib/supabase/server";

export type TripReport = {
  plate: string;
  start_time: string;
  end_time: string;
  duration_min: number;
  max_speed: number;
};

type GeoJsonPoint = {
  type: "Point";
  coordinates: [number, number];
};

export async function getTripsReport(
  deviceId: string,
  startDate: string,
  endDate: string
): Promise<TripReport[]> {
  const supabase = await createClient();

  // Get vehicle plate via devices -> vehicles FK
  const { data: device, error: deviceError } = await supabase
    .from("devices")
    .select("id, vehicles(plate)")
    .eq("id", deviceId)
    .single();

  if (deviceError) throw new Error(deviceError.message);

  const vehicles = device?.vehicles as { plate: string } | { plate: string }[] | null;
  const plate = Array.isArray(vehicles)
    ? (vehicles[0]?.plate ?? "Sem placa")
    : (vehicles?.plate ?? "Sem placa");

  // Fetch positions in date range, ordered ascending by server_time
  const { data: positions, error: positionsError } = await supabase
    .from("positions")
    .select("location, speed, server_time")
    .eq("device_id", deviceId)
    .gte("server_time", startDate)
    .lte("server_time", endDate)
    .order("server_time", { ascending: true });

  if (positionsError) throw new Error(positionsError.message);
  if (!positions || positions.length === 0) return [];

  // Detect trips: consecutive positions where speed > 2 km/h
  const SPEED_THRESHOLD = 2;
  const trips: TripReport[] = [];

  let tripStart: string | null = null;
  let tripEnd: string | null = null;
  let maxSpeed = 0;
  let inTrip = false;

  for (const pos of positions) {
    const location = pos.location as GeoJsonPoint;
    if (!location || location.type !== "Point") continue;

    const speed = pos.speed ?? 0;
    const time = pos.server_time;

    if (speed > SPEED_THRESHOLD) {
      if (!inTrip) {
        // Start of a new trip
        tripStart = time;
        inTrip = true;
        maxSpeed = speed;
      } else {
        // Continuing trip
        tripEnd = time;
        if (speed > maxSpeed) maxSpeed = speed;
      }
    } else {
      if (inTrip) {
        // End of trip
        const end = tripEnd ?? tripStart!;
        const startMs = new Date(tripStart!).getTime();
        const endMs = new Date(end).getTime();
        const durationMin = Math.round((endMs - startMs) / 60000);

        trips.push({
          plate,
          start_time: tripStart!,
          end_time: end,
          duration_min: durationMin,
          max_speed: Math.round(maxSpeed),
        });

        inTrip = false;
        tripStart = null;
        tripEnd = null;
        maxSpeed = 0;
      }
    }
  }

  // Close any open trip at end of data
  if (inTrip && tripStart) {
    const end = tripEnd ?? tripStart;
    const startMs = new Date(tripStart).getTime();
    const endMs = new Date(end).getTime();
    const durationMin = Math.round((endMs - startMs) / 60000);

    trips.push({
      plate,
      start_time: tripStart,
      end_time: end,
      duration_min: durationMin,
      max_speed: Math.round(maxSpeed),
    });
  }

  return trips;
}
