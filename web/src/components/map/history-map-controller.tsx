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
  const isFirstView = useRef(true);
  const lastFitVersion = useRef(0);

  useEffect(() => {
    if (!center) {
      isFirstView.current = true;
      lastFitVersion.current = 0;
      return;
    }

    if (fitVersion > 0 && fitVersion !== lastFitVersion.current) {
      if (routeCoords.length > 1) {
        map.fitBounds(routeCoords, {
          animate: false,
          padding: FIT_PADDING,
        });
      } else {
        map.setView(center, INITIAL_ZOOM, { animate: false });
      }

      isFirstView.current = false;
      lastFitVersion.current = fitVersion;
      return;
    }

    if (isFirstView.current) {
      map.setView(center, INITIAL_ZOOM, { animate: false });
      isFirstView.current = false;
      return;
    }

    map.setView(center, map.getZoom(), { animate: true });
  }, [center, fitVersion, map, routeCoords]);

  return null;
}
