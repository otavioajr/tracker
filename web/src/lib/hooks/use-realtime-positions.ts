"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { VehiclePosition } from "@/lib/actions/positions";

type GeoJsonPoint = {
  type: "Point";
  coordinates: [number, number]; // [longitude, latitude]
};

type LatestPositionRow = {
  device_id: string;
  vehicle_id?: string | null;
  location: unknown;
  speed: number | null;
  heading: number | null;
  ignition: boolean | null;
  device_time: string;
  server_time: string;
};

export function useRealtimePositions(
  initialPositions: VehiclePosition[]
): VehiclePosition[] {
  const [positionsMap, setPositionsMap] = useState<Map<string, VehiclePosition>>(
    () => new Map(initialPositions.map((p) => [p.device_id, p]))
  );
  const supabaseRef = useRef(createClient());

  useEffect(() => {
    setPositionsMap((prev) => {
      const next = new Map(prev);

      for (const initialPosition of initialPositions) {
        const existing = next.get(initialPosition.device_id);
        next.set(
          initialPosition.device_id,
          shouldReplaceVehiclePosition(existing, initialPosition)
            ? initialPosition
            : existing!
        );
      }

      return next;
    });
  }, [initialPositions]);

  useEffect(() => {
    const supabase = supabaseRef.current;

    const channel = supabase
      .channel("realtime:latest_positions")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "latest_positions",
        },
        (payload) => {
          setPositionsMap((prev) => {
            const next = new Map(prev);
            const row = payload.new as LatestPositionRow;
            const existing = next.get(row.device_id);
            const merged = mergeRealtimeVehiclePosition(existing, row);

            if (merged) {
              next.set(row.device_id, merged);
            }

            return next;
          });
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("latest_positions realtime channel degraded", { status });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return Array.from(positionsMap.values());
}

export function normalizeRealtimeLocation(location: unknown): GeoJsonPoint | null {
  const parsed = typeof location === "string" ? safeJsonParse(location) : location;

  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("type" in parsed) ||
    !("coordinates" in parsed)
  ) {
    return null;
  }

  const point = parsed as GeoJsonPoint;
  if (
    point.type !== "Point" ||
    !Array.isArray(point.coordinates) ||
    point.coordinates.length !== 2
  ) {
    return null;
  }

  return point;
}

export function mergeRealtimeVehiclePosition(
  existing: VehiclePosition | undefined,
  row: LatestPositionRow
): VehiclePosition | null {
  const location = normalizeRealtimeLocation(row.location);
  if (!location) {
    return null;
  }

  const [longitude, latitude] = location.coordinates;
  const candidate: VehiclePosition = {
    device_id: row.device_id,
    vehicle_id: row.vehicle_id ?? existing?.vehicle_id,
    latitude,
    longitude,
    speed: row.speed ?? 0,
    heading: row.heading ?? 0,
    ignition: row.ignition ?? false,
    device_time: row.device_time,
    server_time: row.server_time,
    plate: existing?.plate,
    vehicle_name: existing?.vehicle_name,
    vehicle_model: existing?.vehicle_model,
  };

  if (!shouldReplaceVehiclePosition(existing, candidate)) {
    return existing ?? candidate;
  }

  return candidate;
}

function shouldReplaceVehiclePosition(
  current: VehiclePosition | undefined,
  next: VehiclePosition
) {
  if (!current) {
    return true;
  }

  return new Date(next.server_time).getTime() >= new Date(current.server_time).getTime();
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
