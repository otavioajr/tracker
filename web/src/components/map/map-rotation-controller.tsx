"use client";

import { useEffect } from "react";
import { useMap } from "react-leaflet";

export const ANGULAR_THRESHOLD_DEG = 8;
export const DISTANCE_DOMINANCE_RATIO = 1.2;
const PINCH_DISTANCE_THRESHOLD_RATIO = 0.15;

type RotationInteractionRef = {
  current: {
    isRotating: boolean;
  };
};

type RotatableMap = {
  getContainer: () => HTMLElement;
  getBearing: () => number;
  setBearing: (theta: number) => void;
  on?: (event: string, handler: () => void) => unknown;
  off?: (event: string, handler: () => void) => unknown;
};

type Point = { x: number; y: number };
type TouchGestureMode = "idle" | "undecided" | "rotation" | "pinch";

export function normalizeMapBearing(rawBearing: number) {
  const normalized = rawBearing % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

export function supportsMapRotation(map: Partial<RotatableMap>) {
  return (
    typeof map.getBearing === "function" &&
    typeof map.setBearing === "function"
  );
}

export function angleBetweenPoints(center: Point, point: Point) {
  return (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI;
}

export function angleDelta(from: number, to: number) {
  let delta = to - from;
  while (delta > 180) delta -= 360;
  while (delta <= -180) delta += 360;
  return delta;
}

function distanceBetweenPoints(a: Point, b: Point) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function shouldStartTouchRotation(
  angularDeltaDeg: number,
  relativeDistanceChange: number
) {
  if (angularDeltaDeg < ANGULAR_THRESHOLD_DEG) {
    return false;
  }

  const angularProgress = angularDeltaDeg / ANGULAR_THRESHOLD_DEG;
  const distanceProgress =
    relativeDistanceChange / PINCH_DISTANCE_THRESHOLD_RATIO;

  return angularProgress >= distanceProgress * DISTANCE_DOMINANCE_RATIO;
}

type GestureBindingArgs = {
  map: RotatableMap;
  interactionStateRef: RotationInteractionRef;
  onBearingChange: (bearing: number) => void;
};

export function attachCtrlDragRotation({
  map,
  interactionStateRef,
  onBearingChange,
}: GestureBindingArgs) {
  const container = map.getContainer();
  let active = false;
  let lastAngle = 0;
  let gestureRect: DOMRect | null = null;

  const handleMouseUp = () => {
    if (!active) return;
    active = false;
    gestureRect = null;
    interactionStateRef.current.isRotating = false;
    onBearingChange(normalizeMapBearing(map.getBearing()));
    document.removeEventListener("mousemove", handleMouseMove, true);
    document.removeEventListener("mouseup", handleMouseUp, true);
    window.removeEventListener("blur", handleMouseUp);
  };

  const handleMouseDown = (event: MouseEvent) => {
    if (!event.ctrlKey || event.button !== 0) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    active = true;
    gestureRect = container.getBoundingClientRect();
    interactionStateRef.current.isRotating = true;
    const center = { x: gestureRect.width / 2, y: gestureRect.height / 2 };
    const point = { x: event.clientX - gestureRect.left, y: event.clientY - gestureRect.top };
    lastAngle = angleBetweenPoints(center, point);
    document.addEventListener("mousemove", handleMouseMove, true);
    document.addEventListener("mouseup", handleMouseUp, true);
    window.addEventListener("blur", handleMouseUp);
  };

  const handleMouseMove = (event: MouseEvent) => {
    if (!active || !gestureRect) return;
    const center = { x: gestureRect.width / 2, y: gestureRect.height / 2 };
    const point = { x: event.clientX - gestureRect.left, y: event.clientY - gestureRect.top };
    const angle = angleBetweenPoints(center, point);
    const delta = angleDelta(lastAngle, angle);
    lastAngle = angle;
    const next = map.getBearing() + delta;
    map.setBearing(next);
    onBearingChange(normalizeMapBearing(next));
  };

  container.addEventListener("mousedown", handleMouseDown, true);

  return () => {
    container.removeEventListener("mousedown", handleMouseDown, true);
    document.removeEventListener("mousemove", handleMouseMove, true);
    document.removeEventListener("mouseup", handleMouseUp, true);
    window.removeEventListener("blur", handleMouseUp);
  };
}

export function attachTouchRotation({
  map,
  interactionStateRef,
  onBearingChange,
}: GestureBindingArgs) {
  const container = map.getContainer();
  let gestureMode: TouchGestureMode = "idle";
  let baselineAngle = 0;
  let baselineDistance = 0;
  let lastAngle = 0;
  let gestureRect: DOMRect | null = null;

  const pointsForTouches = (
    rect: DOMRect,
    touches: ArrayLike<{ clientX: number; clientY: number }>
  ) => {
    const a = { x: touches[0].clientX - rect.left, y: touches[0].clientY - rect.top };
    const b = { x: touches[1].clientX - rect.left, y: touches[1].clientY - rect.top };
    return { a, b };
  };

  const angleForTouches = (
    rect: DOMRect,
    touches: ArrayLike<{ clientX: number; clientY: number }>
  ) => {
    const { a, b } = pointsForTouches(rect, touches);
    return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  };

  const distanceForTouches = (
    rect: DOMRect,
    touches: ArrayLike<{ clientX: number; clientY: number }>
  ) => {
    const { a, b } = pointsForTouches(rect, touches);
    return distanceBetweenPoints(a, b);
  };

  const resetTouchGesture = () => {
    gestureMode = "idle";
    gestureRect = null;
    baselineAngle = 0;
    baselineDistance = 0;
    lastAngle = 0;
    interactionStateRef.current.isRotating = false;
  };

  const handleTouchStart = (event: Event) => {
    const touchEvent = event as unknown as { touches: ArrayLike<{ clientX: number; clientY: number }> };
    if (!touchEvent.touches || touchEvent.touches.length !== 2) return;
    gestureRect = container.getBoundingClientRect();
    baselineAngle = angleForTouches(gestureRect, touchEvent.touches);
    baselineDistance = distanceForTouches(gestureRect, touchEvent.touches);
    lastAngle = baselineAngle;
    gestureMode = "undecided";
    interactionStateRef.current.isRotating = false;
  };

  const handleTouchMove = (event: Event) => {
    const touchEvent = event as unknown as { touches: ArrayLike<{ clientX: number; clientY: number }> };
    if (
      !gestureRect ||
      !touchEvent.touches ||
      touchEvent.touches.length !== 2 ||
      gestureMode === "idle" ||
      gestureMode === "pinch"
    ) {
      return;
    }

    const angle = angleForTouches(gestureRect, touchEvent.touches);
    const distance = distanceForTouches(gestureRect, touchEvent.touches);

    if (gestureMode === "undecided") {
      const angularDeltaDeg = Math.abs(angleDelta(baselineAngle, angle));
      const relativeDistanceChange =
        baselineDistance > 0
          ? Math.abs(distance - baselineDistance) / baselineDistance
          : 0;

      if (shouldStartTouchRotation(angularDeltaDeg, relativeDistanceChange)) {
        gestureMode = "rotation";
        interactionStateRef.current.isRotating = true;
      } else if (relativeDistanceChange > PINCH_DISTANCE_THRESHOLD_RATIO) {
        gestureMode = "pinch";
        return;
      } else {
        return;
      }
    }

    event.stopPropagation();
    event.preventDefault();
    const delta = angleDelta(lastAngle, angle);
    lastAngle = angle;
    const next = map.getBearing() + delta;
    map.setBearing(next);
    onBearingChange(normalizeMapBearing(next));
  };

  const handleTouchEnd = (event: Event) => {
    const touchEvent = event as unknown as { touches: ArrayLike<unknown> };
    if (gestureMode === "idle") return;
    if (touchEvent.touches && touchEvent.touches.length >= 2) return;

    const shouldReportBearing = gestureMode === "rotation";
    resetTouchGesture();

    if (shouldReportBearing) {
      onBearingChange(normalizeMapBearing(map.getBearing()));
    }
  };

  container.addEventListener("touchstart", handleTouchStart, { capture: true, passive: false });
  container.addEventListener("touchmove", handleTouchMove, { capture: true, passive: false });
  container.addEventListener("touchend", handleTouchEnd, { capture: true });
  container.addEventListener("touchcancel", handleTouchEnd, { capture: true });

  return () => {
    container.removeEventListener("touchstart", handleTouchStart, { capture: true });
    container.removeEventListener("touchmove", handleTouchMove, { capture: true });
    container.removeEventListener("touchend", handleTouchEnd, { capture: true });
    container.removeEventListener("touchcancel", handleTouchEnd, { capture: true });
  };
}

export function MapRotationController({
  enabled,
  resetRotationTrigger,
  interactionStateRef,
  onBearingChange,
}: {
  enabled: boolean;
  resetRotationTrigger: number;
  interactionStateRef: RotationInteractionRef;
  onBearingChange: (bearing: number) => void;
}) {
  const map = useMap() as unknown as RotatableMap;

  useEffect(() => {
    const interactionState = interactionStateRef.current;

    if (!enabled || !supportsMapRotation(map)) {
      interactionState.isRotating = false;
      onBearingChange(0);
      return;
    }

    const detachCtrlDrag = attachCtrlDragRotation({
      map,
      interactionStateRef: { current: interactionState },
      onBearingChange,
    });
    const detachTouch = attachTouchRotation({
      map,
      interactionStateRef: { current: interactionState },
      onBearingChange,
    });

    onBearingChange(normalizeMapBearing(map.getBearing()));

    return () => {
      detachCtrlDrag();
      detachTouch();
      interactionState.isRotating = false;
      onBearingChange(0);
    };
  }, [enabled, interactionStateRef, map, onBearingChange]);

  useEffect(() => {
    if (!enabled || resetRotationTrigger <= 0 || !supportsMapRotation(map)) {
      return;
    }

    map.setBearing(0);
    onBearingChange(0);
  }, [enabled, map, onBearingChange, resetRotationTrigger]);

  return null;
}
