"use server";

import { createClient } from "@/lib/supabase/server";
import type { VehiclePosition } from "@/components/map/types";
import { normalizeRealtimeLocation } from "@/lib/map/position-data";

export type { VehiclePosition } from "@/components/map/types";

const LATEST_POSITION_PAGE = 500;

type VehicleMeta = {
  name: string | null;
  plate: string;
  brand: string | null;
  model: string | null;
};

type LatestPositionRow = {
  device_id: string;
  vehicle_id?: string | null;
  location: unknown;
  speed: number | null;
  heading: number | null;
  ignition: boolean | null;
  device_time: string;
  server_time: string;
  received_at?: string | null;
};

export async function getLatestPositions(): Promise<VehiclePosition[]> {
  const supabase = await createClient();

  const { data: devices, error: devicesError } = await supabase
    .from("devices")
    .select("id, imei, vehicles(name, plate, brand, model)")
    .eq("active", true);

  if (devicesError) throw new Error(devicesError.message);
  if (!devices || devices.length === 0) return [];

  const deviceIds = devices.map((device) => device.id);
  const rows: LatestPositionRow[] = [];

  // latest_positions is the live snapshot; paginate to stay under PostgREST limits.
  for (let offset = 0; offset < deviceIds.length; offset += LATEST_POSITION_PAGE) {
    const page = deviceIds.slice(offset, offset + LATEST_POSITION_PAGE);
    const { data, error } = await supabase
      .from("latest_positions")
      .select("device_id, vehicle_id, location, speed, heading, ignition, device_time, server_time, received_at")
      .in("device_id", page);

    if (error) throw new Error(error.message);
    if (data) {
      rows.push(...(data as LatestPositionRow[]));
    }
  }

  const byDevice = new Map(rows.map((row) => [row.device_id, row]));
  const positions: VehiclePosition[] = [];

  for (const device of devices) {
    const pos = byDevice.get(device.id);
    if (!pos) continue;

    const location = normalizeRealtimeLocation(pos.location);
    if (!location) continue;

    const [longitude, latitude] = location.coordinates;
    const vehicles = device.vehicles as VehicleMeta | VehicleMeta[] | null;
    const vehicle = Array.isArray(vehicles) ? vehicles[0] : vehicles;

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
      received_at: pos.received_at ?? null,
      plate: vehicle?.plate ?? undefined,
      vehicle_name: vehicle?.name ?? undefined,
      vehicle_model: vehicle
        ? [vehicle.brand, vehicle.model].filter(Boolean).join(" ") || undefined
        : undefined,
    });
  }

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
    .select("device_id, vehicle_id, location, speed, heading, ignition, device_time, server_time, received_at")
    .eq("vehicle_id", vehicleId)
    .gte("server_time", startDate)
    .lte("server_time", endDate)
    .order("server_time", { ascending: true });

  if (error) throw new Error(error.message);
  if (!data) return [];

  const positions: VehiclePosition[] = [];

  for (const pos of data) {
    const location = normalizeRealtimeLocation(pos.location);
    if (!location) continue;

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
      received_at: pos.received_at ?? null,
    });
  }

  return positions;
}
