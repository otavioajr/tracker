"use client";

import { useEffect, useEffectEvent, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import type { VehiclePosition } from "./types";

type MapControllerProps = {
  followedDeviceId: string | null;
  positions: VehiclePosition[];
  fitAllTrigger: number;
  onCancelFollow: () => void;
};

const FOLLOW_ZOOM = 16;
const FITALL_PADDING: L.PointTuple = [50, 50];
type MapPoint = [number, number];
type MapBounds = [MapPoint, MapPoint];

export function MapController({
  followedDeviceId,
  positions,
  fitAllTrigger,
  onCancelFollow,
}: MapControllerProps) {
  const map = useMap();
  const lastFitAllTrigger = useRef(0);
  const prevFollowedId = useRef<string | null>(null);
  const lastCenteredPoint = useRef<string | null>(null);
  const handleCancelFollow = useEffectEvent(onCancelFollow);

  // Drag exits follow mode, but selection stays in the dashboard state.
  useEffect(() => {
    const handler = () => handleCancelFollow();
    map.on("dragstart", handler);
    return () => {
      map.off("dragstart", handler);
    };
  }, [map]);

  // Follow mode: recenter on position updates
  useEffect(() => {
    const action = getDashboardFollowAction({
      followedDeviceId,
      positions,
      lastFollowedId: prevFollowedId.current,
      lastCenteredPoint: lastCenteredPoint.current,
    });

    if (action.type === "reset") {
      prevFollowedId.current = null;
      lastCenteredPoint.current = null;
      return;
    }

    if (action.type === "none") {
      return;
    }

    if (action.type === "set-initial-view") {
      map.setView(action.center, FOLLOW_ZOOM, { animate: true });
    }

    if (action.type === "set-current-view") {
      map.setView(action.center, map.getZoom(), { animate: true });
    }

    prevFollowedId.current = followedDeviceId;
    lastCenteredPoint.current = serializePoint(action.center);
  }, [followedDeviceId, positions, map]);

  // Fit all vehicles
  useEffect(() => {
    const action = getDashboardFitAllAction({
      positions,
      fitAllTrigger,
      lastFitAllTrigger: lastFitAllTrigger.current,
    });

    if (action.type === "none") {
      return;
    }

    if (action.type === "set-initial-view") {
      map.setView(action.center, 14, { animate: true });
    }

    if (action.type === "fit-bounds") {
      map.fitBounds(L.latLngBounds(action.bounds), {
        padding: FITALL_PADDING,
        animate: true,
      });
    }

    lastFitAllTrigger.current = fitAllTrigger;
  }, [fitAllTrigger, map, positions]);

  return null;
}

export function getDashboardFollowAction({
  followedDeviceId,
  positions,
  lastFollowedId,
  lastCenteredPoint,
}: {
  followedDeviceId: string | null;
  positions: VehiclePosition[];
  lastFollowedId: string | null;
  lastCenteredPoint: string | null;
}) {
  if (!followedDeviceId) {
    return { type: "reset" } as const;
  }

  const pos = positions.find((position) => position.device_id === followedDeviceId);
  if (!pos) {
    return { type: "none" } as const;
  }

  const center: MapPoint = [pos.latitude, pos.longitude];
  const serializedPoint = serializePoint(center);

  if (lastFollowedId !== followedDeviceId) {
    return { type: "set-initial-view", center } as const;
  }

  if (lastCenteredPoint === serializedPoint) {
    return { type: "none" } as const;
  }

  return { type: "set-current-view", center } as const;
}

export function getDashboardFitAllAction({
  positions,
  fitAllTrigger,
  lastFitAllTrigger,
}: {
  positions: VehiclePosition[];
  fitAllTrigger: number;
  lastFitAllTrigger: number;
}) {
  if (fitAllTrigger <= 0 || fitAllTrigger === lastFitAllTrigger || positions.length === 0) {
    return { type: "none" } as const;
  }

  if (positions.length === 1) {
    return {
      type: "set-initial-view",
      center: [positions[0].latitude, positions[0].longitude] as MapPoint,
    } as const;
  }

  const latitudes = positions.map((position) => position.latitude);
  const longitudes = positions.map((position) => position.longitude);
  const southWest: MapPoint = [Math.min(...latitudes), Math.min(...longitudes)];
  const northEast: MapPoint = [Math.max(...latitudes), Math.max(...longitudes)];

  return {
    type: "fit-bounds",
    bounds: [southWest, northEast] as MapBounds,
  } as const;
}

function serializePoint([latitude, longitude]: MapPoint) {
  return `${latitude}:${longitude}`;
}
