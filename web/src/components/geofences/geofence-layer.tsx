"use client";

import { Polygon, Popup } from "react-leaflet";
import type { GeofenceRow, LngLat } from "@/lib/geofences/types";

type Props = {
  geofences: GeofenceRow[];
};

export function GeofenceLayer({ geofences }: Props) {
  return (
    <>
      {geofences
        .filter((g) => g.active)
        .map((g) => {
          const coords = parsePolygon(g.area);
          if (!coords || coords.length < 4) return null;
          const isProhibited = g.type === "exclusion";
          const color = isProhibited ? "#dc2626" : "#16a34a";
          // Leaflet Polygon quer [lat, lng] — inverter de [lng, lat]
          const latlngs = coords.map(([lng, lat]) => [lat, lng] as [number, number]);
          return (
            <Polygon
              key={g.id as string}
              positions={latlngs}
              pathOptions={{ color, fillColor: color, fillOpacity: 0.2, weight: 2 }}
            >
              <Popup>
                <div className="font-medium">{g.name}</div>
                <div className="text-xs text-muted-foreground">
                  {isProhibited ? "Zona proibida" : "Zona permitida"}
                </div>
              </Popup>
            </Polygon>
          );
        })}
    </>
  );
}

function parsePolygon(value: unknown): LngLat[] | null {
  if (!value) return null;
  const geo = coerceGeoJson(value);
  if (!geo || geo.type !== "Polygon" || !Array.isArray(geo.coordinates)) return null;
  const first = geo.coordinates[0];
  if (!Array.isArray(first)) return null;
  return first.map((p) => [p[0], p[1]] as LngLat);
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
