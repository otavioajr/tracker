import type { VehiclePosition } from "@/components/map/types";

type GeoJsonPoint = {
  type: "Point";
  coordinates: [number, number];
};

const FUTURE_TOLERANCE_MS = 15 * 60 * 1000;

export function normalizeRealtimeLocation(location: unknown): GeoJsonPoint | null {
  const parsed = typeof location === "string" ? safeJsonParse(location) : location;
  if (parsed && typeof parsed === "object" && "type" in parsed && "coordinates" in parsed) {
    const point = parsed as GeoJsonPoint;
    if (
      point.type === "Point" &&
      Array.isArray(point.coordinates) &&
      point.coordinates.length === 2 &&
      isFiniteCoordinate(point.coordinates[0], point.coordinates[1])
    ) {
      return point;
    }
  }

  // PostGIS may send EWKB hex (little-endian Point, optional SRID 4326).
  if (typeof location === "string") {
    return parseEwkbPoint(location);
  }
  return null;
}

export function isValidPositionTime(value: string, now = Date.now()): boolean {
  const ms = Date.parse(value);
  return Number.isFinite(ms) && ms <= now + FUTURE_TOLERANCE_MS;
}

export function shouldReplaceVehiclePosition(
  current: VehiclePosition | undefined,
  next: VehiclePosition,
  now = Date.now()
): boolean {
  if (!current) {
    return isValidPositionTime(next.device_time, now);
  }
  const currentMs = Date.parse(current.device_time);
  const nextMs = Date.parse(next.device_time);
  if (!Number.isFinite(nextMs)) {
    return false;
  }
  if (nextMs > now + FUTURE_TOLERANCE_MS) {
    return false;
  }
  if (Number.isFinite(currentMs) && currentMs > now + FUTURE_TOLERANCE_MS) {
    return true;
  }
  return nextMs > currentMs;
}

export function reconcilePositions(
  current: VehiclePosition[],
  incoming: VehiclePosition[],
  now = Date.now()
): VehiclePosition[] {
  const byId = new Map(current.map((position) => [position.device_id, position]));
  const kept = new Set<string>();
  const next: VehiclePosition[] = [];

  for (const candidate of incoming) {
    kept.add(candidate.device_id);
    const existing = byId.get(candidate.device_id);
    if (!shouldReplaceVehiclePosition(existing, candidate, now)) {
      next.push(existing ?? candidate);
      continue;
    }
    next.push(candidate);
  }

  for (const position of current) {
    if (!kept.has(position.device_id)) {
      continue;
    }
  }
  return next;
}

function isFiniteCoordinate(longitude: number, latitude: number): boolean {
  return (
    Number.isFinite(longitude) &&
    Number.isFinite(latitude) &&
    longitude >= -180 &&
    longitude <= 180 &&
    latitude >= -90 &&
    latitude <= 90
  );
}

function parseEwkbPoint(value: string): GeoJsonPoint | null {
  const hex = value.startsWith("\\x") ? value.slice(2) : value;
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length < 42) {
    return null;
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  const view = new DataView(bytes.buffer);
  const littleEndian = bytes[0] === 1;
  const type = view.getUint32(1, littleEndian) & 0x1fffffff;
  const hasSrid = (view.getUint32(1, littleEndian) & 0x20000000) !== 0;
  if (type !== 1) {
    return null;
  }
  const offset = hasSrid ? 9 : 5;
  if (bytes.length < offset + 16) {
    return null;
  }
  const longitude = view.getFloat64(offset, littleEndian);
  const latitude = view.getFloat64(offset + 8, littleEndian);
  if (!isFiniteCoordinate(longitude, latitude)) {
    return null;
  }
  return { type: "Point", coordinates: [longitude, latitude] };
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
