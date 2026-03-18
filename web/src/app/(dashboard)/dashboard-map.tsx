"use client";

import { TrackingMap } from "@/components/map/tracking-map";
import { useRealtimePositions } from "@/lib/hooks/use-realtime-positions";
import type { VehiclePosition } from "@/lib/actions/positions";

type DashboardMapProps = {
  initialPositions: VehiclePosition[];
};

export function DashboardMap({ initialPositions }: DashboardMapProps) {
  const positions = useRealtimePositions(initialPositions);

  return (
    <div className="relative w-full h-full">
      <TrackingMap positions={positions} className="w-full h-full" />
      <div
        style={{
          position: "absolute",
          bottom: 12,
          left: 12,
          zIndex: 1000,
          background: "white",
          borderRadius: 8,
          padding: "6px 14px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          fontSize: 13,
          fontWeight: 600,
          color: "#374151",
          pointerEvents: "none",
        }}
      >
        {positions.length} {positions.length === 1 ? "veículo" : "veículos"} ativos
      </div>
    </div>
  );
}
