import { notFound } from "next/navigation";

import { GeofenceEditor } from "@/components/geofences/geofence-editor";
import { getGeofence } from "@/lib/actions/geofences";
import type { LngLat } from "@/lib/geofences/types";

type Params = { id: string };

export default async function EditGeofenceShapePage(props: { params: Promise<Params> }) {
  const { id } = await props.params;
  const geofence = await getGeofence(id);
  if (!geofence) notFound();

  const initialShape = mapGeofenceToEditorShape(geofence);
  if (!initialShape) notFound();

  const initialCenter: [number, number] = deriveCenter(geofence) ?? [-23.55, -46.63];

  return (
    <div className="h-[calc(100vh-4rem)] -m-4 lg:-m-6">
      <GeofenceEditor
        mode="edit-shape"
        geofenceId={geofence.id as string}
        initialMeta={{
          name: geofence.name as string,
          type: geofence.type as "inclusion" | "exclusion",
          active: geofence.active ?? true,
        }}
        initialShape={initialShape}
        initialCenter={initialCenter}
      />
    </div>
  );
}

type GeofenceLike = Awaited<ReturnType<typeof getGeofence>>;

function mapGeofenceToEditorShape(g: NonNullable<GeofenceLike>):
  | { shape_type: "polygon" | "rectangle"; coordinates: LngLat[] }
  | { shape_type: "circle"; center: LngLat; radiusM: number }
  | null {
  if (g.shape_type === "circle") {
    const center = parsePoint(g.center);
    if (!center || g.radius_m == null) return null;
    return { shape_type: "circle", center, radiusM: Number(g.radius_m) };
  }
  if (g.shape_type !== "polygon" && g.shape_type !== "rectangle") return null;
  const coords = parsePolygon(g.area);
  if (!coords) return null;
  return { shape_type: g.shape_type, coordinates: coords };
}

function deriveCenter(g: NonNullable<GeofenceLike>): [number, number] | null {
  if (g.shape_type === "circle") {
    const center = parsePoint(g.center);
    return center ? [center[1], center[0]] : null;
  }
  const coords = parsePolygon(g.area);
  if (!coords || coords.length === 0) return null;
  const [lng, lat] = coords[0];
  return [lat, lng];
}

function parsePolygon(value: unknown): LngLat[] | null {
  if (!value) return null;
  const geo = coerceGeoJson(value);
  if (!geo) return null;
  if (geo.type === "Polygon" && Array.isArray(geo.coordinates)) {
    const ring = (geo.coordinates as unknown[])[0];
    if (!Array.isArray(ring)) return null;
    return (ring as [number, number][]).map((p) => [p[0], p[1]] as LngLat);
  }
  return null;
}

function parsePoint(value: unknown): LngLat | null {
  if (!value) return null;
  const geo = coerceGeoJson(value);
  if (!geo) return null;
  if (geo.type === "Point" && Array.isArray(geo.coordinates)) {
    const coords = geo.coordinates as number[];
    return [coords[0], coords[1]] as LngLat;
  }
  return null;
}

function coerceGeoJson(value: unknown): { type: string; coordinates: unknown } | null {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (typeof value === "object" && value !== null && "type" in value) {
    return value as { type: string; coordinates: unknown };
  }
  return null;
}
