// @vitest-environment jsdom

import { render, waitFor } from "@testing-library/react";
import L from "leaflet";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useMapMock } = vi.hoisted(() => ({
  useMapMock: vi.fn(),
}));

vi.mock("react-leaflet", () => ({
  useMap: useMapMock,
}));

import {
  MapController,
  expandBoundsForRotation,
  getDashboardFitAllAction,
  getDashboardFollowAction,
  shouldCancelFollowOnMapDrag,
} from "./map-controller";
import type { VehiclePosition } from "./types";

const positions: VehiclePosition[] = [
  {
    device_id: "truck-1",
    latitude: -23.55,
    longitude: -46.63,
    speed: 42,
    heading: 0,
    ignition: true,
    device_time: "2026-04-07T12:00:00.000Z",
    server_time: "2026-04-07T12:00:00.000Z",
  },
  {
    device_id: "van-2",
    latitude: -23.56,
    longitude: -46.64,
    speed: 0,
    heading: 0,
    ignition: true,
    device_time: "2026-04-07T12:00:00.000Z",
    server_time: "2026-04-07T12:00:00.000Z",
  },
];

describe("map-controller", () => {
  beforeEach(() => {
    useMapMock.mockReset();
    useMapMock.mockReturnValue(null);
  });

  it("consumes fit-all as a one-shot trigger", () => {
    expect(
      getDashboardFitAllAction({
        positions,
        fitAllTrigger: 2,
        lastFitAllTrigger: 2,
      })
    ).toEqual({ type: "none" });
  });

  it("fits all visible vehicles when the trigger advances", () => {
    expect(
      getDashboardFitAllAction({
        positions,
        fitAllTrigger: 3,
        lastFitAllTrigger: 2,
      })
    ).toEqual({
      type: "fit-bounds",
      bounds: [
        [-23.56, -46.64],
        [-23.55, -46.63],
      ],
    });
  });

  it("does not recenter follow when only other vehicles move", () => {
    expect(
      getDashboardFollowAction({
        followedDeviceId: "truck-1",
        positions: [
          positions[0],
          {
            ...positions[1],
            latitude: -23.58,
            longitude: -46.66,
            server_time: "2026-04-07T12:01:00.000Z",
          },
        ],
        lastFollowedId: "truck-1",
        lastCenteredPoint: "-23.55:-46.63",
      })
    ).toEqual({ type: "none" });
  });

  it("recenters follow when the followed vehicle receives a new point", () => {
    expect(
      getDashboardFollowAction({
        followedDeviceId: "truck-1",
        positions: [
          {
            ...positions[0],
            latitude: -23.551,
            longitude: -46.631,
            server_time: "2026-04-07T12:01:00.000Z",
          },
          positions[1],
        ],
        lastFollowedId: "truck-1",
        lastCenteredPoint: "-23.55:-46.63",
      })
    ).toEqual({
      type: "set-current-view",
      center: [-23.551, -46.631],
    });
  });

  it("only cancels follow when no rotation gesture is active", () => {
    expect(shouldCancelFollowOnMapDrag(false)).toBe(true);
    expect(shouldCancelFollowOnMapDrag(true)).toBe(false);
  });

  it("expandBoundsForRotation devolve bounds iguais quando bearing e 0", () => {
    const bounds = L.latLngBounds(
      [-23.56, -46.64],
      [-23.55, -46.63]
    );

    const expanded = expandBoundsForRotation(bounds, 0);

    expect(expanded.getSouthWest().lat).toBe(bounds.getSouthWest().lat);
    expect(expanded.getSouthWest().lng).toBe(bounds.getSouthWest().lng);
    expect(expanded.getNorthEast().lat).toBe(bounds.getNorthEast().lat);
    expect(expanded.getNorthEast().lng).toBe(bounds.getNorthEast().lng);
  });

  it("expandBoundsForRotation expande bounds com bearing diferente de 0", () => {
    const bounds = L.latLngBounds(
      [-23.56, -46.64],
      [-23.55, -46.63]
    );
    const originalHeight = bounds.getNorthEast().lat - bounds.getSouthWest().lat;
    const originalWidth = bounds.getNorthEast().lng - bounds.getSouthWest().lng;

    const expanded = expandBoundsForRotation(bounds, 45);
    const expandedHeight =
      expanded.getNorthEast().lat - expanded.getSouthWest().lat;
    const expandedWidth =
      expanded.getNorthEast().lng - expanded.getSouthWest().lng;

    expect(expandedHeight).toBeGreaterThanOrEqual(
      originalHeight * Math.SQRT2
    );
    expect(expandedWidth).toBeGreaterThanOrEqual(
      originalWidth * Math.SQRT2
    );
  });

  it("fit-all usa bounds expandidos quando map esta rotacionado", async () => {
    const rawBounds = L.latLngBounds(
      [-23.56, -46.64],
      [-23.55, -46.63]
    );
    const fitBounds = vi.fn();
    const setBearing = vi.fn();

    useMapMock.mockReturnValue({
      on: vi.fn(),
      off: vi.fn(),
      setView: vi.fn(),
      fitBounds,
      getZoom: vi.fn(() => 12),
      getBearing: vi.fn(() => 45),
      setBearing,
    });

    render(
      createElement(MapController, {
        followedDeviceId: null,
        positions,
        fitAllTrigger: 1,
        onCancelFollow: vi.fn(),
        interactionStateRef: { current: { isRotating: false } },
      })
    );

    await waitFor(() => expect(fitBounds).toHaveBeenCalledTimes(1));

    const expandedBounds = fitBounds.mock.calls[0][0] as L.LatLngBounds;

    expect(expandedBounds.getSouthWest().lat).toBeLessThan(
      rawBounds.getSouthWest().lat
    );
    expect(expandedBounds.getSouthWest().lng).toBeLessThan(
      rawBounds.getSouthWest().lng
    );
    expect(expandedBounds.getNorthEast().lat).toBeGreaterThan(
      rawBounds.getNorthEast().lat
    );
    expect(expandedBounds.getNorthEast().lng).toBeGreaterThan(
      rawBounds.getNorthEast().lng
    );
    expect(setBearing).toHaveBeenCalledWith(45);
  });
});
