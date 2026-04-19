// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import {
  angleBetweenPoints,
  angleDelta,
  attachCtrlDragRotation,
  attachTouchRotation,
  normalizeMapBearing,
  supportsMapRotation,
} from "./map-rotation-controller";

function createMapStub() {
  let bearing = 0;
  const container = document.createElement("div");
  Object.defineProperty(container, "getBoundingClientRect", {
    value: () => ({ left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200, x: 0, y: 0, toJSON: () => ({}) }),
  });
  document.body.appendChild(container);

  const map = {
    getContainer: () => container,
    getBearing: vi.fn(() => bearing),
    setBearing: vi.fn((value: number) => {
      bearing = value;
    }),
  };

  return { map, container };
}

function dispatchTouchEvent(
  container: HTMLElement,
  type: string,
  touches: Array<{ clientX: number; clientY: number }>
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const stopPropagation = vi.fn();
  const preventDefault = vi.fn();

  Object.defineProperty(event, "touches", { value: touches });
  Object.defineProperty(event, "stopPropagation", { value: stopPropagation });
  Object.defineProperty(event, "preventDefault", { value: preventDefault });

  container.dispatchEvent(event);

  return { event, stopPropagation, preventDefault };
}

describe("map-rotation-controller helpers", () => {
  it("normalizes bearings to the 0-360 range", () => {
    expect(normalizeMapBearing(-90)).toBe(270);
    expect(normalizeMapBearing(-450)).toBe(270);
    expect(normalizeMapBearing(0)).toBe(0);
    expect(normalizeMapBearing(360)).toBe(0);
    expect(normalizeMapBearing(450)).toBe(90);
  });

  it("detects maps missing getBearing or setBearing", () => {
    expect(supportsMapRotation({})).toBe(false);
    expect(
      supportsMapRotation({
        getBearing() {
          return 0;
        },
      })
    ).toBe(false);
    expect(
      supportsMapRotation({
        getBearing() {
          return 0;
        },
        setBearing() {},
      })
    ).toBe(true);
  });

  it("computes the angle between a point and the container center in degrees", () => {
    const center = { x: 100, y: 100 };
    expect(angleBetweenPoints(center, { x: 200, y: 100 })).toBeCloseTo(0);
    expect(angleBetweenPoints(center, { x: 100, y: 200 })).toBeCloseTo(90);
    expect(angleBetweenPoints(center, { x: 0, y: 100 })).toBeCloseTo(180);
    expect(angleBetweenPoints(center, { x: 100, y: 0 })).toBeCloseTo(-90);
  });

  it("wraps angle deltas into the -180..180 range", () => {
    expect(angleDelta(10, 20)).toBeCloseTo(10);
    expect(angleDelta(350, 10)).toBeCloseTo(20);
    expect(angleDelta(10, 350)).toBeCloseTo(-20);
    expect(angleDelta(-170, 170)).toBeCloseTo(-20);
  });

  it("tracks ctrl+drag rotation gestures end-to-end", () => {
    const { map, container } = createMapStub();
    const interactionStateRef = { current: { isRotating: false } };
    const onBearingChange = vi.fn();

    const cleanup = attachCtrlDragRotation({
      map,
      interactionStateRef,
      onBearingChange,
    });

    const down = new MouseEvent("mousedown", {
      clientX: 200,
      clientY: 100,
      button: 0,
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    container.dispatchEvent(down);
    expect(interactionStateRef.current.isRotating).toBe(true);

    const move = new MouseEvent("mousemove", {
      clientX: 100,
      clientY: 200,
      bubbles: true,
    });
    document.dispatchEvent(move);
    expect(map.setBearing).toHaveBeenLastCalledWith(expect.any(Number));
    expect(onBearingChange).toHaveBeenLastCalledWith(expect.any(Number));
    expect(onBearingChange.mock.lastCall?.[0]).toBeGreaterThan(0);

    const up = new MouseEvent("mouseup", { bubbles: true });
    document.dispatchEvent(up);
    expect(interactionStateRef.current.isRotating).toBe(false);

    cleanup();
    container.remove();
  });

  it("ignores mousedown without Ctrl or on non-primary buttons", () => {
    const { map, container } = createMapStub();
    const interactionStateRef = { current: { isRotating: false } };
    const onBearingChange = vi.fn();

    const cleanup = attachCtrlDragRotation({
      map,
      interactionStateRef,
      onBearingChange,
    });

    container.dispatchEvent(
      new MouseEvent("mousedown", {
        clientX: 200,
        clientY: 100,
        button: 0,
        ctrlKey: false,
        bubbles: true,
      })
    );
    expect(interactionStateRef.current.isRotating).toBe(false);

    container.dispatchEvent(
      new MouseEvent("mousedown", {
        clientX: 200,
        clientY: 100,
        button: 2,
        ctrlKey: true,
        bubbles: true,
      })
    );
    expect(interactionStateRef.current.isRotating).toBe(false);
    expect(map.setBearing).not.toHaveBeenCalled();

    cleanup();
    container.remove();
  });

  it("tracks two-finger touch rotation gestures end-to-end", () => {
    const { map, container } = createMapStub();
    const interactionStateRef = { current: { isRotating: false } };
    const onBearingChange = vi.fn();

    const cleanup = attachTouchRotation({
      map,
      interactionStateRef,
      onBearingChange,
    });

    dispatchTouchEvent(container, "touchstart", [
      { clientX: 50, clientY: 100 },
      { clientX: 150, clientY: 100 },
    ]);
    expect(interactionStateRef.current.isRotating).toBe(false);

    const move = dispatchTouchEvent(container, "touchmove", [
      { clientX: 51.7, clientY: 87.06 },
      { clientX: 148.3, clientY: 112.94 },
    ]);
    expect(map.setBearing).toHaveBeenCalled();
    expect(move.stopPropagation).toHaveBeenCalled();
    expect(interactionStateRef.current.isRotating).toBe(true);

    dispatchTouchEvent(container, "touchend", [{ clientX: 100, clientY: 50 }]);
    expect(interactionStateRef.current.isRotating).toBe(false);

    cleanup();
    container.remove();
  });

  it("deixa pinch zoom passar quando so a distancia muda", () => {
    const { map, container } = createMapStub();
    const interactionStateRef = { current: { isRotating: false } };
    const onBearingChange = vi.fn();

    const cleanup = attachTouchRotation({
      map,
      interactionStateRef,
      onBearingChange,
    });

    dispatchTouchEvent(container, "touchstart", [
      { clientX: 50, clientY: 100 },
      { clientX: 150, clientY: 100 },
    ]);

    const move = dispatchTouchEvent(container, "touchmove", [
      { clientX: 0, clientY: 100 },
      { clientX: 200, clientY: 100 },
    ]);

    expect(map.setBearing).not.toHaveBeenCalled();
    expect(interactionStateRef.current.isRotating).toBe(false);
    expect(move.stopPropagation).not.toHaveBeenCalled();

    cleanup();
    container.remove();
  });

  it("entra em rotacao quando o angulo muda antes da distancia", () => {
    const { map, container } = createMapStub();
    const interactionStateRef = { current: { isRotating: false } };
    const onBearingChange = vi.fn();

    const cleanup = attachTouchRotation({
      map,
      interactionStateRef,
      onBearingChange,
    });

    dispatchTouchEvent(container, "touchstart", [
      { clientX: 50, clientY: 100 },
      { clientX: 150, clientY: 100 },
    ]);

    const move = dispatchTouchEvent(container, "touchmove", [
      { clientX: 51.7, clientY: 87.06 },
      { clientX: 148.3, clientY: 112.94 },
    ]);

    expect(map.setBearing).toHaveBeenCalled();
    expect(interactionStateRef.current.isRotating).toBe(true);
    expect(move.stopPropagation).toHaveBeenCalled();

    cleanup();
    container.remove();
  });

  it("pinch-e-depois-gira continua sendo pinch", () => {
    const { map, container } = createMapStub();
    const interactionStateRef = { current: { isRotating: false } };
    const onBearingChange = vi.fn();

    const cleanup = attachTouchRotation({
      map,
      interactionStateRef,
      onBearingChange,
    });

    dispatchTouchEvent(container, "touchstart", [
      { clientX: 50, clientY: 100 },
      { clientX: 150, clientY: 100 },
    ]);

    dispatchTouchEvent(container, "touchmove", [
      { clientX: 40, clientY: 100 },
      { clientX: 160, clientY: 103 },
    ]);

    dispatchTouchEvent(container, "touchmove", [
      { clientX: 70, clientY: 60 },
      { clientX: 130, clientY: 140 },
    ]);

    expect(map.setBearing).not.toHaveBeenCalled();
    expect(interactionStateRef.current.isRotating).toBe(false);

    cleanup();
    container.remove();
  });
});
