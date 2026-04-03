"use client";

import { useState, useCallback } from "react";
import { TrackingMap } from "@/components/map/tracking-map";
import { useRealtimePositions } from "@/lib/hooks/use-realtime-positions";
import type { VehiclePosition } from "@/lib/actions/positions";

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
      {followedVehicle && (
        <div
          style={{
            position: "absolute",
            top: 12,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1000,
            background: "#2563eb",
            color: "white",
            borderRadius: 20,
            padding: "8px 20px",
            boxShadow: "0 2px 12px rgba(37,99,235,0.35)",
            fontSize: 14,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 8,
            pointerEvents: "none",
            whiteSpace: "nowrap",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              background: "#60a5fa",
              borderRadius: "50%",
              display: "inline-block",
            }}
          />
          Seguindo: {followedVehicle.vehicle_name || followedVehicle.plate || followedVehicle.device_id} — {followedVehicle.speed.toFixed(0)} km/h
        </div>
      )}
      {followedDeviceId && (
        <div
          style={{
            position: "absolute",
            bottom: 48,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1000,
            background: "rgba(0,0,0,0.6)",
            color: "white",
            borderRadius: 8,
            padding: "4px 14px",
            fontSize: 12,
            pointerEvents: "none",
            whiteSpace: "nowrap",
          }}
        >
          Arraste o mapa para sair do modo follow
        </div>
      )}
      <button
        onClick={handleFitAll}
        style={{
          position: "absolute",
          bottom: 12,
          right: 12,
          zIndex: 1000,
          background: "white",
          border: "1px solid #d1d5db",
          borderRadius: 8,
          padding: "8px 16px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          fontSize: 13,
          fontWeight: 600,
          color: "#374151",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
        </svg>
        Ver todos
      </button>
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
