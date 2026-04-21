import type { Database } from "@/types/database";

// Row da tabela base (mantida para contextos que lidam com WKB).
export type GeofenceTableRow = Database["public"]["Tables"]["geofences"]["Row"];

// Row da view que retorna `area` e `center` como GeoJSON JSONB — usada pelo frontend.
// Após `make db-types`, esse tipo vem gerado em `Database["public"]["Views"]["geofences_geojson"]["Row"]`.
export type GeofenceRow = Database["public"]["Views"]["geofences_geojson"]["Row"];

export type GeofenceType = Database["public"]["Enums"]["geofence_type"]; // 'inclusion' | 'exclusion'
export type GeofenceShape = Database["public"]["Enums"]["geofence_shape"]; // 'polygon' | 'rectangle' | 'circle'

export type LngLat = [number, number];

export type ShapeInput =
  | { kind: "polygon"; coordinates: LngLat[] }
  | { kind: "rectangle"; coordinates: LngLat[] }
  | { kind: "circle"; center: LngLat; radiusM: number; polygon: LngLat[] };

export type GeofenceMeta = {
  name: string;
  type: GeofenceType;
  active: boolean;
};
