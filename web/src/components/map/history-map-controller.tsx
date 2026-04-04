"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";

const INITIAL_ZOOM = 15;

export function HistoryMapController({
  center,
}: {
  center: [number, number] | null;
}) {
  const map = useMap();
  const isFirstView = useRef(true);

  useEffect(() => {
    if (!center) return;

    if (isFirstView.current) {
      map.setView(center, INITIAL_ZOOM, { animate: false });
      isFirstView.current = false;
      return;
    }

    map.setView(center, map.getZoom(), { animate: true });
  }, [center, map]);

  // Reset first-view flag when center becomes null (new search)
  useEffect(() => {
    if (!center) {
      isFirstView.current = true;
    }
  }, [center]);

  return null;
}
