"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { VehiclePosition } from "@/lib/actions/positions";

type GeoJsonPoint = {
  type: "Point";
  coordinates: [number, number]; // [longitude, latitude]
};

export function useRealtimePositions(
  initialPositions: VehiclePosition[]
): VehiclePosition[] {
  const [positionsMap, setPositionsMap] = useState<Map<string, VehiclePosition>>(
    () => new Map(initialPositions.map((p) => [p.device_id, p]))
  );

  const supabaseRef = useRef(createClient());

  useEffect(() => {
    const supabase = supabaseRef.current;

    const channel = supabase
      .channel("realtime:positions")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "positions",
        },
        (payload) => {
          const row = payload.new as {
            device_id: string;
            location: unknown;
            speed: number | null;
            heading: number | null;
            ignition: boolean | null;
            device_time: string;
          };

          const location = row.location as GeoJsonPoint;
          if (!location || location.type !== "Point") return;

          const [longitude, latitude] = location.coordinates;

          setPositionsMap((prev) => {
            const next = new Map(prev);
            const existing = next.get(row.device_id);
            next.set(row.device_id, {
              device_id: row.device_id,
              latitude,
              longitude,
              speed: row.speed ?? 0,
              heading: row.heading ?? 0,
              ignition: row.ignition ?? false,
              device_time: row.device_time,
              plate: existing?.plate,
            });
            return next;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return Array.from(positionsMap.values());
}
