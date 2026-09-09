export const MAP_BASE_LAYERS = [
  "Ruas",
  "Detalhado",
  "Satelite",
  "Escuro",
] as const;

export type MapBaseLayer = (typeof MAP_BASE_LAYERS)[number];

export const DEFAULT_MAP_BASE_LAYER: MapBaseLayer = "Ruas";

// Chave pública incorporada pelo Next.js no build; o valor fica no ambiente, não no Git.
const cartoApiKey = encodeURIComponent(
  process.env.NEXT_PUBLIC_CARTO_API_KEY?.trim() ?? ""
);

// Rastreamento e histórico compartilham autenticação e créditos exigidos pela CARTO.
export const CARTO_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attributions">CARTO</a>';

export const CARTO_TILE_URLS = {
  light: `https://{s}.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}{r}.png?key=${cartoApiKey}`,
  dark: `https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png?key=${cartoApiKey}`,
} as const;

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
