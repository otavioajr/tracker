"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";

const INITIAL_ZOOM = 15;
const FIT_PADDING: [number, number] = [32, 32];

type HistoryMapPoint = [number, number];
type HistoryMapBounds = [HistoryMapPoint, HistoryMapPoint];

export function HistoryMapController({
  center,
  bounds,
  fitVersion,
}: {
  center: HistoryMapPoint | null;
  bounds: HistoryMapBounds | null;
  fitVersion: number;
}) {
  const map = useMap();
  const lastFitVersion = useRef(0);
  const lastCenteredPoint = useRef<string | null>(null);

  useEffect(() => {
    const action = getHistoryFitAction({
      center,
      bounds,
      fitVersion,
      lastFitVersion: lastFitVersion.current,
    });

    if (action.type === "reset") {
      lastFitVersion.current = 0;
      lastCenteredPoint.current = null;
      return;
    }

    if (action.type === "fit-bounds") {
      map.fitBounds(action.bounds, {
        animate: false,
        padding: FIT_PADDING,
      });
      lastFitVersion.current = fitVersion;
      lastCenteredPoint.current = serializePoint(center!);
      return;
    }

    if (action.type === "set-initial-view") {
      map.setView(action.center, INITIAL_ZOOM, { animate: false });
      lastFitVersion.current = fitVersion;
      lastCenteredPoint.current = serializePoint(action.center);
    }
  }, [bounds, center, fitVersion, map]);

  useEffect(() => {
    const action = getHistoryCenterAction({
      center,
      lastCenteredPoint: lastCenteredPoint.current,
    });

    if (action.type === "none") {
      return;
    }

    if (action.type === "set-initial-view") {
      map.setView(action.center, INITIAL_ZOOM, { animate: false });
    }

    if (action.type === "set-current-view") {
      map.setView(action.center, map.getZoom(), { animate: true });
    }

    lastCenteredPoint.current = serializePoint(action.center);
  }, [center, map]);

  return null;
}

export function getHistoryFitAction({
  center,
  bounds,
  fitVersion,
  lastFitVersion,
}: {
  center: HistoryMapPoint | null;
  bounds: HistoryMapBounds | null;
  fitVersion: number;
  lastFitVersion: number;
}) {
  if (!center || !bounds) {
    return { type: "reset" } as const;
  }

  if (fitVersion <= 0 || fitVersion === lastFitVersion) {
    return { type: "none" } as const;
  }

  if (isSinglePointBounds(bounds)) {
    return { type: "set-initial-view", center } as const;
  }

  return { type: "fit-bounds", bounds } as const;
}

export function getHistoryCenterAction({
  center,
  lastCenteredPoint,
}: {
  center: HistoryMapPoint | null;
  lastCenteredPoint: string | null;
}) {
  if (!center) {
    return { type: "none" } as const;
  }

  const serializedCenter = serializePoint(center);

  if (lastCenteredPoint === serializedCenter) {
    return { type: "none" } as const;
  }

  if (lastCenteredPoint === null) {
    return { type: "set-initial-view", center } as const;
  }

  return { type: "set-current-view", center } as const;
}

function serializePoint([latitude, longitude]: [number, number]) {
  return `${latitude}:${longitude}`;
}

function isSinglePointBounds(bounds: HistoryMapBounds) {
  return (
    bounds[0][0] === bounds[1][0] &&
    bounds[0][1] === bounds[1][1]
  );
}
