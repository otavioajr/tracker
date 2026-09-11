"use server";

import { mergeRealtimeVehiclePosition } from "@/lib/map/position-data";
import { createClient } from "@/lib/supabase/server";
import type { VehiclePosition } from "@/components/map/types";

export type { VehiclePosition } from "@/components/map/types";

type GeoJsonPoint = {
  type: "Point";
  coordinates: [number, number]; // [longitude, latitude]
};

export async function getLatestPositions(): Promise<VehiclePosition[]> {
  const supabase = await createClient();
  const positions: VehiclePosition[] = [];
  const pageSize = 200;

  // Paginação estável respeita RLS e evita uma consulta por rastreador.
  for (let offset = 0; ; offset += pageSize) {
    const { data: devices, error } = await supabase.from("devices")
      .select("id, vehicles(id, name, plate, brand, model)")
      .eq("active", true).order("id").range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!devices?.length) break;
    const metadata = new Map(devices.map((device) => [device.id, device]));
    const { data: rows, error: positionsError } = await supabase.from("latest_positions")
      .select("device_id, vehicle_id, location, speed, heading, ignition, device_time, server_time, received_at")
      .in("device_id", devices.map((device) => device.id)).order("device_id").range(0, pageSize - 1);
    if (positionsError) throw new Error(positionsError.message);
    for (const row of rows ?? []) {
      const device = metadata.get(row.device_id);
      if (!device) continue;
      const position = mergeRealtimeVehiclePosition(undefined, row);
      if (!position) throw new Error(`Posição inválida para o dispositivo ${row.device_id}`);
      const vehicles = device.vehicles;
      const vehicle = Array.isArray(vehicles) ? vehicles[0] : vehicles;
      positions.push({ ...position, vehicle_id: vehicle?.id ?? undefined,
        plate: vehicle?.plate ?? undefined, vehicle_name: vehicle?.name ?? undefined,
        vehicle_model: vehicle ? [vehicle.brand, vehicle.model].filter(Boolean).join(" ") || undefined : undefined });
    }
    if (devices.length < pageSize) break;
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
