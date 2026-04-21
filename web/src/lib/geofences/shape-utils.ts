import circle from "@turf/circle";
import type { LngLat } from "./types";

type CircleInput = { center: LngLat; radiusM: number; steps?: number };

export function circleToPolygon({ center, radiusM, steps = 64 }: CircleInput): LngLat[] {
  const feature = circle(center, radiusM / 1000, { steps, units: "kilometers" });
  const coords = feature.geometry.coordinates[0] as LngLat[];
  return coords;
}

export function isClosedRing(coords: LngLat[]): boolean {
  if (coords.length < 2) return false;
  const first = coords[0];
  const last = coords[coords.length - 1];
  return first[0] === last[0] && first[1] === last[1];
}

type ValidationResult = { ok: true } | { ok: false; error: string };

export function validatePolygonCoords(coords: LngLat[]): ValidationResult {
  if (coords.length < 4) {
    return { ok: false, error: "Polígono precisa de pelo menos 3 vértices distintos." };
  }
  if (!isClosedRing(coords)) {
    return { ok: false, error: "Polígono precisa estar fechado (primeiro e último ponto iguais)." };
  }
  for (const [lng, lat] of coords) {
    if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
      return { ok: false, error: "Coordenadas fora do intervalo válido." };
    }
  }
  return { ok: true };
}

export function validateRadiusMeters(radiusM: number): ValidationResult {
  if (!(radiusM > 0)) {
    return { ok: false, error: "Raio precisa ser maior que zero." };
  }
  if (radiusM > 100_000) {
    return { ok: false, error: "Raio máximo é 100000 metros." };
  }
  return { ok: true };
}

function formatCoord(value: number): string {
  return String(Number(value.toFixed(8)));
}

export function polygonToWkt(coords: LngLat[]): string {
  const inner = coords.map(([lng, lat]) => `${formatCoord(lng)} ${formatCoord(lat)}`).join(", ");
  return `POLYGON((${inner}))`;
}

export function pointToWkt([lng, lat]: LngLat): string {
  return `POINT(${formatCoord(lng)} ${formatCoord(lat)})`;
}
