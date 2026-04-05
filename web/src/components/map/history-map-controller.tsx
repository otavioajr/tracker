"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";

const INITIAL_ZOOM = 15;
const FIT_PADDING: [number, number] = [32, 32];

export function HistoryMapController({
  center,
  routeCoords,
  fitVersion,
}: {
  center: [number, number] | null;
  routeCoords: [number, number][];
  fitVersion: number;
}) {
  const map = useMap();
  const latestRouteCoords = useRef(routeCoords);
  const lastFitVersion = useRef(0);
  const lastCenteredPoint = useRef<string | null>(null);

  useEffect(() => {
    latestRouteCoords.current = routeCoords;
  }, [routeCoords]);

  useEffect(() => {
    if (!center) {
      lastFitVersion.current = 0;
      lastCenteredPoint.current = null;
      return;
    }

    if (fitVersion > 0 && fitVersion !== lastFitVersion.current) {
      if (latestRouteCoords.current.length > 1) {
        map.fitBounds(latestRouteCoords.current, {
          animate: false,
          padding: FIT_PADDING,
        });
      } else {
        map.setView(center, INITIAL_ZOOM, { animate: false });
      }

      lastFitVersion.current = fitVersion;
      lastCenteredPoint.current = serializePoint(center);
    }
  }, [center, fitVersion, map]);

  useEffect(() => {
    if (!center) return;

    const serializedCenter = serializePoint(center);

    if (lastCenteredPoint.current === serializedCenter) {
      return;
    }

    if (lastCenteredPoint.current === null) {
      map.setView(center, INITIAL_ZOOM, { animate: false });
    } else {
      map.setView(center, map.getZoom(), { animate: true });
    }

    lastCenteredPoint.current = serializedCenter;
  }, [center, map]);

  return null;
}

function serializePoint([latitude, longitude]: [number, number]) {
  return `${latitude}:${longitude}`;
}
