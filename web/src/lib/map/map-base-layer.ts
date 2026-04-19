export const MAP_BASE_LAYERS = [
  "Ruas",
  "Detalhado",
  "Satelite",
  "Escuro",
] as const;

export type MapBaseLayer = (typeof MAP_BASE_LAYERS)[number];

export const DEFAULT_MAP_BASE_LAYER: MapBaseLayer = "Ruas";

export function isMapBaseLayer(value: unknown): value is MapBaseLayer {
  return (
    typeof value === "string" &&
    (MAP_BASE_LAYERS as readonly string[]).includes(value)
  );
}

export function normalizeMapBaseLayer(
  value: unknown,
  fallback: MapBaseLayer = DEFAULT_MAP_BASE_LAYER
): MapBaseLayer {
  return isMapBaseLayer(value) ? value : fallback;
}
