"use server";

import { createClient } from "@/lib/supabase/server";

export type VehiclePosition = {
  device_id: string;
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
  ignition: boolean;
  device_time: string;
  plate?: string;
};

type GeoJsonPoint = {
  type: "Point";
  coordinates: [number, number]; // [longitude, latitude]
};

export async function getLatestPositions(): Promise<VehiclePosition[]> {
  const supabase = await createClient();

  const { data: devices, error: devicesError } = await supabase
    .from("devices")
    .select("id, imei, vehicles(plate)")
    .eq("active", true);

  if (devicesError) throw new Error(devicesError.message);
  if (!devices || devices.length === 0) return [];

  const positions: VehiclePosition[] = [];

  await Promise.all(
    devices.map(async (device) => {
      const { data: pos } = await supabase
        .from("positions")
        .select("device_id, location, speed, heading, ignition, device_time")
        .eq("device_id", device.id)
        .order("device_time", { ascending: false })
        .limit(1)
        .single();

      if (!pos) return;

      const location = pos.location as GeoJsonPoint;
      if (!location || location.type !== "Point") return;

      const [longitude, latitude] = location.coordinates;

      const vehicles = device.vehicles as { plate: string } | { plate: string }[] | null;
      const plate = Array.isArray(vehicles)
        ? vehicles[0]?.plate
        : vehicles?.plate;

      positions.push({
        device_id: pos.device_id,
        latitude,
        longitude,
        speed: pos.speed ?? 0,
        heading: pos.heading ?? 0,
        ignition: pos.ignition ?? false,
        device_time: pos.device_time,
        plate: plate ?? undefined,
      });
    })
  );

  return positions;
}

export async function getPositionHistory(
  deviceId: string,
  startDate: string,
  endDate: string
): Promise<VehiclePosition[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("positions")
    .select("device_id, location, speed, heading, ignition, device_time")
    .eq("device_id", deviceId)
    .gte("device_time", startDate)
    .lte("device_time", endDate)
    .order("device_time", { ascending: true });

  if (error) throw new Error(error.message);
  if (!data) return [];

  return data
    .map((pos) => {
      const location = pos.location as GeoJsonPoint;
      if (!location || location.type !== "Point") return null;

      const [longitude, latitude] = location.coordinates;

      return {
        device_id: pos.device_id,
        latitude,
        longitude,
        speed: pos.speed ?? 0,
        heading: pos.heading ?? 0,
        ignition: pos.ignition ?? false,
        device_time: pos.device_time,
      };
    })
    .filter((p): p is VehiclePosition => p !== null);
}
