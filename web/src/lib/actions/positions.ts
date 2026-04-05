"use server";

import { createClient } from "@/lib/supabase/server";
import type { VehiclePosition } from "@/components/map/types";

export type { VehiclePosition } from "@/components/map/types";

type GeoJsonPoint = {
  type: "Point";
  coordinates: [number, number]; // [longitude, latitude]
};

export async function getLatestPositions(): Promise<VehiclePosition[]> {
  const supabase = await createClient();

  const { data: devices, error: devicesError } = await supabase
    .from("devices")
    .select("id, imei, vehicles(name, plate, brand, model)")
    .eq("active", true);

  if (devicesError) throw new Error(devicesError.message);
  if (!devices || devices.length === 0) return [];

  const positions: VehiclePosition[] = [];

  await Promise.all(
    devices.map(async (device) => {
      const { data: pos } = await supabase
        .from("positions")
        .select("device_id, location, speed, heading, ignition, device_time, server_time")
        .eq("device_id", device.id)
        .order("server_time", { ascending: false })
        .limit(1)
        .single();

      if (!pos) return;

      const location = pos.location as GeoJsonPoint;
      if (!location || location.type !== "Point") return;

      const [longitude, latitude] = location.coordinates;

      const vehicles = device.vehicles as { name: string | null; plate: string; brand: string | null; model: string | null } | { name: string | null; plate: string; brand: string | null; model: string | null }[] | null;
      const vehicle = Array.isArray(vehicles) ? vehicles[0] : vehicles;

      positions.push({
        device_id: pos.device_id,
        latitude,
        longitude,
        speed: pos.speed ?? 0,
        heading: pos.heading ?? 0,
        ignition: pos.ignition ?? false,
        device_time: pos.device_time,
        server_time: pos.server_time,
        plate: vehicle?.plate ?? undefined,
        vehicle_name: vehicle?.name ?? undefined,
        vehicle_model: vehicle ? [vehicle.brand, vehicle.model].filter(Boolean).join(" ") || undefined : undefined,
      });
    })
  );

  return positions;
}

export async function getPositionHistory(
  vehicleId: string,
  startDate: string,
  endDate: string
): Promise<VehiclePosition[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("positions")
    .select("device_id, vehicle_id, location, speed, heading, ignition, device_time, server_time")
    .eq("vehicle_id", vehicleId)
    .gte("server_time", startDate)
    .lte("server_time", endDate)
    .order("server_time", { ascending: true });

  if (error) throw new Error(error.message);
  if (!data) return [];

  const positions: VehiclePosition[] = [];

  for (const pos of data) {
    const location = pos.location as GeoJsonPoint;
    if (!location || location.type !== "Point") continue;

    const [longitude, latitude] = location.coordinates;

    positions.push({
      device_id: pos.device_id,
      vehicle_id: pos.vehicle_id ?? undefined,
      latitude,
      longitude,
      speed: pos.speed ?? 0,
      heading: pos.heading ?? 0,
      ignition: pos.ignition ?? false,
      device_time: pos.device_time,
      server_time: pos.server_time,
    });
  }

  return positions;
}
