"use client";

import { useEffect, useEffectEvent, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";

type VehiclePosition = {
  device_id: string;
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
  ignition: boolean;
  device_time: string;
  server_time: string;
  plate?: string;
  vehicle_name?: string;
  vehicle_model?: string;
};

type MapControllerProps = {
  followedDeviceId: string | null;
  positions: VehiclePosition[];
  fitAllTrigger: number;
  onCancelFollow: () => void;
};

const FOLLOW_ZOOM = 16;
const FITALL_PADDING: L.PointTuple = [50, 50];

export function MapController({
  followedDeviceId,
  positions,
  fitAllTrigger,
  onCancelFollow,
}: MapControllerProps) {
  const map = useMap();
  const prevFollowedId = useRef<string | null>(null);
  const handleCancelFollow = useEffectEvent(onCancelFollow);

  // Drag cancels follow
  useEffect(() => {
    const handler = () => handleCancelFollow();
    map.on("dragstart", handler);
    return () => {
      map.off("dragstart", handler);
    };
  }, [map]);

  // Follow mode: recenter on position updates
  useEffect(() => {
    if (!followedDeviceId) {
      prevFollowedId.current = null;
      return;
    }

    const pos = positions.find((p) => p.device_id === followedDeviceId);
    if (!pos) return;

    const isNewFollow = prevFollowedId.current !== followedDeviceId;
    const zoom = isNewFollow ? FOLLOW_ZOOM : map.getZoom();

    map.setView([pos.latitude, pos.longitude], zoom, { animate: true });
    prevFollowedId.current = followedDeviceId;
  }, [followedDeviceId, positions, map]);

  // Fit all vehicles
  useEffect(() => {
    if (fitAllTrigger === 0) return;
    if (positions.length === 0) return;

    if (positions.length === 1) {
      map.setView(
        [positions[0].latitude, positions[0].longitude],
        14,
        { animate: true }
      );
      return;
    }

    const bounds = L.latLngBounds(
      positions.map((p) => [p.latitude, p.longitude] as L.LatLngTuple)
    );
    map.fitBounds(bounds, { padding: FITALL_PADDING, animate: true });
  }, [fitAllTrigger, map, positions]);

  return null;
}
