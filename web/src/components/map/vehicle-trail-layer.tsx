"use client";

import { Polyline } from "react-leaflet";

import type { DashboardVehicleTrail } from "./types";

export const DASHBOARD_TRAIL_COLOR = "#13d392";

type VehicleTrailLayerProps = {
  trail: DashboardVehicleTrail;
};

export function VehicleTrailLayer({ trail }: VehicleTrailLayerProps) {
  if (trail.points.length < 2) {
    return null;
  }

  return (
    <Polyline
      positions={trail.points.map(
        (point) => [point.latitude, point.longitude] as [number, number]
      )}
      pathOptions={{
        color: DASHBOARD_TRAIL_COLOR,
        weight: 4,
        opacity: 0.8,
      }}
    />
  );
}
