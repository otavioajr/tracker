"use client";

import { useEffect, useEffectEvent, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import type { VehiclePosition } from "./types";

export function shouldCancelFollowOnMapDrag(isRotationGestureActive: boolean) {
  return !isRotationGestureActive;
}

type MapInteractionRef = {
  current: {
    isRotating: boolean;
  };
};

type MapControllerProps = {
  followedDeviceId: string | null;
  positions: VehiclePosition[];
  fitAllTrigger: number;
  onCancelFollow: () => void;
  interactionStateRef: MapInteractionRef;
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
  interactionStateRef,
}: MapControllerProps) {
  const map = useMap();
  const lastFitAllTrigger = useRef(0);
  const prevFollowedId = useRef<string | null>(null);
  const lastCenteredPoint = useRef<string | null>(null);
  const handleCancelFollow = useEffectEvent(onCancelFollow);

  // Drag exits follow mode unless the user is currently rotating the map.
  useEffect(() => {
    const handler = () => {
      if (!shouldCancelFollowOnMapDrag(interactionStateRef.current.isRotating)) {
        return;
      }
      handleCancelFollow();
    };
    map.on("dragstart", handler);
    return () => {
      map.off("dragstart", handler);
    };
  }, [map, interactionStateRef]);

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
      const rotatableMap = map as unknown as {
        getBearing?: () => number;
        setBearing?: (bearing: number) => void;
      };
      const previousBearing =
        typeof rotatableMap.getBearing === "function"
          ? rotatableMap.getBearing()
          : 0;

      map.fitBounds(L.latLngBounds(action.bounds), {
        padding: FITALL_PADDING,
        animate: true,
      });

      if (
        previousBearing !== 0 &&
        typeof rotatableMap.setBearing === "function"
      ) {
        rotatableMap.setBearing(previousBearing);
      }
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
