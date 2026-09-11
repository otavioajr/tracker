import type { VehiclePosition } from "@/components/map/types";

export type LatestPositionRow = {
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

type Point = { type: "Point"; coordinates: [number, number] };
export const MAX_POSITION_FUTURE_MS = 120_000;

export function normalizeRealtimeLocation(location: unknown): Point | null {
  let value = location;
  if (typeof value === "string") {
    const hex = value.replace(/^\\x/i, "");
    // PostGIS envia EWKB hexadecimal: apenas Point 2D com SRID 4326.
    if (/^[\da-f]{50}$/i.test(hex)) {
      const bytes = Uint8Array.from(hex.match(/../g)!, (byte) => parseInt(byte, 16));
      const view = new DataView(bytes.buffer);
      if (bytes[0] !== 0 && bytes[0] !== 1) return null;
      const little = bytes[0] === 1;
      if (view.getUint32(1, little) !== 0x20000001 || view.getUint32(5, little) !== 4326) return null;
      value = { type: "Point", coordinates: [view.getFloat64(9, little), view.getFloat64(17, little)] };
    } else {
      try { value = JSON.parse(value); } catch { return null; }
    }
  }
  if (!value || typeof value !== "object") return null;
  const point = value as Point;
  if (point.type !== "Point" || !Array.isArray(point.coordinates) || point.coordinates.length !== 2) return null;
  const [lon, lat] = point.coordinates;
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90) return null;
  return { type: "Point", coordinates: [lon, lat] };
}

export function isValidPositionTime(position: Pick<LatestPositionRow, "device_time" | "received_at" | "server_time">): boolean {
  const measurement = Date.parse(position.device_time);
  const reception = Date.parse(position.received_at ?? position.server_time);
  return Number.isFinite(measurement) && Number.isFinite(reception) && measurement <= reception + MAX_POSITION_FUTURE_MS;
}

export function shouldReplaceVehiclePosition(current: VehiclePosition | undefined, next: VehiclePosition): boolean {
  // Um estado futuro contaminado não pode bloquear medições corretas.
  return isValidPositionTime(next) && (!current || !isValidPositionTime(current) || Date.parse(next.device_time) > Date.parse(current.device_time));
}

export function mergeRealtimeVehiclePosition(existing: VehiclePosition | undefined, row: LatestPositionRow): VehiclePosition | null {
  const location = normalizeRealtimeLocation(row.location);
  if (!location || !isValidPositionTime(row)) return existing ?? null;
  const candidate: VehiclePosition = {
    device_id: row.device_id,
    vehicle_id: row.vehicle_id === undefined ? existing?.vehicle_id : row.vehicle_id ?? undefined,
    longitude: location.coordinates[0], latitude: location.coordinates[1],
    speed: row.speed ?? 0, heading: row.heading ?? 0, ignition: row.ignition ?? false,
    device_time: row.device_time, server_time: row.server_time,
    ...(row.received_at !== undefined ? { received_at: row.received_at } : {}),
    plate: existing?.plate, vehicle_name: existing?.vehicle_name, vehicle_model: existing?.vehicle_model,
  };
  return shouldReplaceVehiclePosition(existing, candidate) ? candidate : existing ?? null;
}

export function reconcilePositions(current: VehiclePosition[], snapshot: VehiclePosition[]): VehiclePosition[] {
  const previous = new Map(current.map((position) => [position.device_id, position]));
  const next = snapshot.flatMap((position) => {
    const existing = previous.get(position.device_id);
    if (!existing && !isValidPositionTime(position)) return [];
    // A fotografia é autoridade para associação/metadados e remoções, não para regredir medições.
    const merged = { ...(shouldReplaceVehiclePosition(existing, position) ? position : existing!),
      vehicle_id: position.vehicle_id, plate: position.plate,
      vehicle_name: position.vehicle_name, vehicle_model: position.vehicle_model };
    const unchanged = existing && (Object.keys(merged) as (keyof VehiclePosition)[]).every((key) => merged[key] === existing[key]);
    return [unchanged ? existing : merged];
  });
  return next.length === current.length && next.every((position, index) => position === current[index]) ? current : next;
}
