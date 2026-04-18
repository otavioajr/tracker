"use client";

import { useEffect } from "react";
import { useMap } from "react-leaflet";

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

function containerCenter(container: HTMLElement) {
  const rect = container.getBoundingClientRect();
  return { x: rect.width / 2, y: rect.height / 2 };
}

function pointerToContainer(
  container: HTMLElement,
  clientX: number,
  clientY: number
) {
  const rect = container.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top };
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

  const handleMouseDown = (event: MouseEvent) => {
    if (!event.ctrlKey || event.button !== 0) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    active = true;
    interactionStateRef.current.isRotating = true;
    const point = pointerToContainer(container, event.clientX, event.clientY);
    lastAngle = angleBetweenPoints(containerCenter(container), point);
    document.addEventListener("mousemove", handleMouseMove, true);
    document.addEventListener("mouseup", handleMouseUp, true);
  };

  const handleMouseMove = (event: MouseEvent) => {
    if (!active) return;
    const point = pointerToContainer(container, event.clientX, event.clientY);
    const angle = angleBetweenPoints(containerCenter(container), point);
    const delta = angleDelta(lastAngle, angle);
    lastAngle = angle;
    const next = map.getBearing() + delta;
    map.setBearing(next);
    onBearingChange(normalizeMapBearing(next));
  };

  const handleMouseUp = () => {
    if (!active) return;
    active = false;
    interactionStateRef.current.isRotating = false;
    onBearingChange(normalizeMapBearing(map.getBearing()));
    document.removeEventListener("mousemove", handleMouseMove, true);
    document.removeEventListener("mouseup", handleMouseUp, true);
  };

  container.addEventListener("mousedown", handleMouseDown, true);

  return () => {
    container.removeEventListener("mousedown", handleMouseDown, true);
    document.removeEventListener("mousemove", handleMouseMove, true);
    document.removeEventListener("mouseup", handleMouseUp, true);
  };
}

export function attachTouchRotation({
  map,
  interactionStateRef,
  onBearingChange,
}: GestureBindingArgs) {
  const container = map.getContainer();
  let active = false;
  let lastAngle = 0;

  const angleForTouches = (touches: ArrayLike<{ clientX: number; clientY: number }>) => {
    const a = pointerToContainer(container, touches[0].clientX, touches[0].clientY);
    const b = pointerToContainer(container, touches[1].clientX, touches[1].clientY);
    return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  };

  const handleTouchStart = (event: Event) => {
    const touchEvent = event as unknown as { touches: ArrayLike<{ clientX: number; clientY: number }> };
    if (!touchEvent.touches || touchEvent.touches.length !== 2) return;
    event.stopPropagation();
    active = true;
    interactionStateRef.current.isRotating = true;
    lastAngle = angleForTouches(touchEvent.touches);
  };

  const handleTouchMove = (event: Event) => {
    const touchEvent = event as unknown as { touches: ArrayLike<{ clientX: number; clientY: number }> };
    if (!active || !touchEvent.touches || touchEvent.touches.length !== 2) return;
    event.stopPropagation();
    event.preventDefault();
    const angle = angleForTouches(touchEvent.touches);
    const delta = angleDelta(lastAngle, angle);
    lastAngle = angle;
    const next = map.getBearing() + delta;
    map.setBearing(next);
    onBearingChange(normalizeMapBearing(next));
  };

  const handleTouchEnd = (event: Event) => {
    const touchEvent = event as unknown as { touches: ArrayLike<unknown> };
    if (!active) return;
    if (touchEvent.touches && touchEvent.touches.length >= 2) return;
    active = false;
    interactionStateRef.current.isRotating = false;
    onBearingChange(normalizeMapBearing(map.getBearing()));
  };

  container.addEventListener("touchstart", handleTouchStart, { capture: true, passive: false });
  container.addEventListener("touchmove", handleTouchMove, { capture: true, passive: false });
  container.addEventListener("touchend", handleTouchEnd, true);
  container.addEventListener("touchcancel", handleTouchEnd, true);

  return () => {
    container.removeEventListener("touchstart", handleTouchStart, true);
    container.removeEventListener("touchmove", handleTouchMove, true);
    container.removeEventListener("touchend", handleTouchEnd, true);
    container.removeEventListener("touchcancel", handleTouchEnd, true);
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
    if (!enabled || !supportsMapRotation(map)) {
      interactionStateRef.current.isRotating = false;
      onBearingChange(0);
      return;
    }

    const detachCtrlDrag = attachCtrlDragRotation({
      map,
      interactionStateRef,
      onBearingChange,
    });
    const detachTouch = attachTouchRotation({
      map,
      interactionStateRef,
      onBearingChange,
    });

    onBearingChange(normalizeMapBearing(map.getBearing()));

    return () => {
      detachCtrlDrag();
      detachTouch();
      interactionStateRef.current.isRotating = false;
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
