"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { useRealtimePositions } from "@/lib/hooks/use-realtime-positions";
import type { VehiclePosition } from "@/lib/actions/positions";

const TrackingMap = dynamic(
  () => import("@/components/map/tracking-map").then((mod) => mod.TrackingMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center rounded-lg bg-card text-sm text-muted-foreground">
        Carregando mapa...
      </div>
    ),
  }
);

type DashboardMapProps = {
  initialPositions: VehiclePosition[];
};

export function DashboardMap({ initialPositions }: DashboardMapProps) {
  const positions = useRealtimePositions(initialPositions);
  const [followedDeviceId, setFollowedDeviceId] = useState<string | null>(null);
  const [fitAllTrigger, setFitAllTrigger] = useState(0);

  const handleFollow = useCallback((deviceId: string) => {
    setFollowedDeviceId(deviceId);
  }, []);

  const handleCancelFollow = useCallback(() => {
    setFollowedDeviceId(null);
  }, []);

  const handleFitAll = useCallback(() => {
    setFollowedDeviceId(null);
    setFitAllTrigger((prev) => prev + 1);
  }, []);

  const followedVehicle = followedDeviceId
    ? positions.find((p) => p.device_id === followedDeviceId)
    : null;

  return (
    <div className="relative w-full h-full">
      <TrackingMap
        positions={positions}
        className="w-full h-full"
        followedDeviceId={followedDeviceId}
        onFollow={handleFollow}
        onCancelFollow={handleCancelFollow}
        fitAllTrigger={fitAllTrigger}
      />

      {/* Following indicator */}
      {followedVehicle && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none">
          <div className="flex items-center gap-2 bg-primary text-primary-foreground rounded-full px-4 py-2 shadow-lg glow-primary text-xs sm:text-sm font-semibold whitespace-nowrap">
            <span className="w-2 h-2 bg-primary-foreground/40 rounded-full animate-pulse" />
            Seguindo:{" "}
            {followedVehicle.vehicle_name ||
              followedVehicle.plate ||
              followedVehicle.device_id}{" "}
            — {followedVehicle.speed.toFixed(0)} km/h
          </div>
        </div>
      )}

      {/* Drag hint */}
      {followedDeviceId && (
        <div className="absolute bottom-28 lg:bottom-14 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none">
          <div className="bg-black/60 text-white rounded-lg px-3 py-1.5 text-xs whitespace-nowrap backdrop-blur-sm">
            Arraste o mapa para sair do modo follow
          </div>
        </div>
      )}

      {/* Fit all button */}
      <button
        onClick={handleFitAll}
        className="absolute bottom-24 lg:bottom-4 right-3 z-[1000] flex items-center gap-2 bg-card/90 hover:bg-accent border border-border/50 rounded-xl px-4 py-2.5 shadow-lg text-xs font-semibold text-foreground backdrop-blur-sm transition-all active:scale-95"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
        </svg>
        Ver todos
      </button>

      {/* Vehicle count */}
      <div className="absolute bottom-24 lg:bottom-4 left-3 z-[1000] pointer-events-none">
        <div className="bg-card/90 border border-border/50 rounded-xl px-3 py-2 shadow-lg text-xs font-semibold text-foreground backdrop-blur-sm">
          <span className="text-primary font-bold">{positions.length}</span>{" "}
          {positions.length === 1 ? "veículo" : "veículos"}
        </div>
      </div>
    </div>
  );
}
