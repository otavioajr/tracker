"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getLatestPositions, type VehiclePosition } from "@/lib/actions/positions";
import { mergeRealtimeVehiclePosition, reconcilePositions, type LatestPositionRow } from "@/lib/map/position-data";

export { mergeRealtimeVehiclePosition, normalizeRealtimeLocation } from "@/lib/map/position-data";
export type ConnectionStatus = "connecting" | "live" | "recovering" | "offline";

export function useRealtimePositions(initialPositions: VehiclePosition[]): VehiclePosition[] {
  return useRealtimePositionsState(initialPositions).positions;
}

export function useRealtimePositionsState(initialPositions: VehiclePosition[]) {
  const [positions, setPositions] = useState(initialPositions);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const revision = useRef(0);
  useEffect(() => {
    revision.current++;
    setPositions((current) => reconcilePositions(current, initialPositions));
  }, [initialPositions]);

  useEffect(() => {
    const supabase = createClient();
    let disposed = false;
    let subscribed = false;
    let inFlight = false;
    let pending = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const eligible = () => navigator.onLine && document.visibilityState === "visible";
    const schedule = () => {
      clearTimeout(timer);
      if (!disposed && eligible()) timer = setTimeout(() => { void sync(); }, Math.min(120_000, 30_000 * 2 ** Math.max(0, failures - 1)));
    };
    const sync = async () => {
      if (disposed || !eligible()) return;
      if (inFlight) { pending = true; return; }
      clearTimeout(timer);
      inFlight = true;
      const startedAt = revision.current;
      try {
        const snapshot = await getLatestPositions();
        if (disposed) return;
        // Eventos posteriores à consulta invalidam a fotografia inteira, inclusive remoções.
        if (startedAt !== revision.current) { pending = true; return; }
        setPositions((current) => reconcilePositions(current, snapshot));
        failures = 0;
        setConnectionStatus(navigator.onLine ? (subscribed ? "live" : "recovering") : "offline");
      } catch (error) {
        if (disposed) return;
        failures = Math.min(failures + 1, 3);
        setConnectionStatus(navigator.onLine ? "recovering" : "offline");
        console.warn("Falha ao ressincronizar posições", error);
      } finally {
        inFlight = false;
        if (!disposed) {
          if (pending && eligible()) { pending = false; void sync(); }
          else schedule();
        }
      }
    };
    const resume = () => {
      if (disposed) return;
      revision.current++;
      clearTimeout(timer);
      if (!navigator.onLine) { setConnectionStatus("offline"); return; }
      if (eligible()) { setConnectionStatus("recovering"); void sync(); }
    };
    const channel = supabase.channel("realtime:latest_positions")
      .on("postgres_changes", { event: "*", schema: "public", table: "latest_positions" }, (payload) => {
        if (disposed) return;
        revision.current++;
        if (payload.eventType === "DELETE") {
          // DELETE pode conter só a chave primária; confirmar remoção pela consulta autorizada.
          void sync();
          return;
        }
        const row = payload.new as LatestPositionRow;
        setPositions((current) => {
          const index = current.findIndex((position) => position.device_id === row.device_id);
          if (index < 0) return current; // Novos dispositivos só entram pela fotografia autorizada.
          const merged = mergeRealtimeVehiclePosition(current[index], row);
          if (!merged || merged === current[index]) return current;
          const next = [...current]; next[index] = merged; return next;
        });
      })
      .subscribe((status) => {
        if (disposed) return;
        subscribed = status === "SUBSCRIBED";
        setConnectionStatus(!navigator.onLine ? "offline" : "recovering");
        if (subscribed) { revision.current++; void sync(); }
        else schedule();
      });
    window.addEventListener("online", resume);
    window.addEventListener("offline", resume);
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    if (!navigator.onLine) setConnectionStatus("offline");
    schedule();
    return () => {
      disposed = true;
      clearTimeout(timer);
      window.removeEventListener("online", resume);
      window.removeEventListener("offline", resume);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
      void supabase.removeChannel(channel);
    };
  }, []);
  return { positions, connectionStatus };
}
