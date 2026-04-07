// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

vi.mock("react-leaflet", () => ({
  useMap: () => null,
}));

import {
  getDashboardFitAllAction,
  getDashboardFollowAction,
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
});
