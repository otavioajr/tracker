"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getLatestPositions } from "@/lib/actions/positions";
import type { VehiclePosition } from "@/lib/actions/positions";
import {
  normalizeRealtimeLocation,
  reconcilePositions,
  shouldReplaceVehiclePosition,
} from "@/lib/map/position-data";

export type RealtimeConnectionStatus = "connecting" | "live" | "recovering" | "offline";

type LatestPositionRow = {
  device_id: string;
  vehicle_id?: string | null;
  location: unknown;
  speed: number | null;
  heading: number | null;
  ignition: boolean | null;
  device_time: string;
  server_time: string;
  received_at?: string | null;
};

const RECOVERY_POLL_MS = 30_000;

export function useRealtimePositions(initialPositions: VehiclePosition[]): VehiclePosition[] {
  return useRealtimePositionsState(initialPositions).positions;
}

export function useRealtimePositionsState(initialPositions: VehiclePosition[]): {
  positions: VehiclePosition[];
  connectionStatus: RealtimeConnectionStatus;
} {
  const [positions, setPositions] = useState(initialPositions);
  const [connectionStatus, setConnectionStatus] =
    useState<RealtimeConnectionStatus>("connecting");
  const supabaseRef = useRef(createClient());
  // Atualizações funcionais abaixo já usam o estado atual, sem ref durante render.

  const applySnapshot = useCallback((incoming: VehiclePosition[]) => {
    setPositions((current) => reconcilePositions(current, incoming));
  }, []);

  const recover = useCallback(async () => {
    setConnectionStatus((status) => (status === "live" ? status : "recovering"));
    try {
      applySnapshot(await getLatestPositions());
      setConnectionStatus("live");
    } catch (error) {
      console.warn("latest_positions recovery failed", error);
      setConnectionStatus("offline");
    }
  }, [applySnapshot]);

  useEffect(() => {
    // Aplica snapshots do servidor após o commit e cancela snapshots já substituídos.
    const timer = window.setTimeout(() => applySnapshot(initialPositions), 0);
    return () => window.clearTimeout(timer);
  }, [applySnapshot, initialPositions]);

  useEffect(() => {
    const supabase = supabaseRef.current;
    const channel = supabase
      .channel("realtime:latest_positions")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "latest_positions" },
        (payload) => {
          const row = payload.new as LatestPositionRow;
          setPositions((current) => {
            const existing = current.find((position) => position.device_id === row.device_id);
            const merged = mergeRealtimeVehiclePosition(existing, row);
            if (!merged) {
              return current;
            }
            if (existing && merged === existing) {
              return current;
            }
            if (!existing) {
              return [...current, merged];
            }
            return current.map((position) =>
              position.device_id === merged.device_id ? merged : position
            );
          });
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setConnectionStatus("live");
          return;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setConnectionStatus("recovering");
          void recover();
        }
      });

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void recover();
      }
    };
    window.addEventListener("online", recover);
    document.addEventListener("visibilitychange", onVisible);
    const poll = window.setInterval(() => {
      void recover();
    }, RECOVERY_POLL_MS);

    return () => {
      window.clearInterval(poll);
      window.removeEventListener("online", recover);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [recover]);

  return { positions, connectionStatus };
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
    received_at: row.received_at ?? existing?.received_at ?? null,
    plate: existing?.plate,
    vehicle_name: existing?.vehicle_name,
    vehicle_model: existing?.vehicle_model,
  };

  if (!shouldReplaceVehiclePosition(existing, candidate)) {
    return existing ?? candidate;
  }

  return candidate;
}

export { normalizeRealtimeLocation };
