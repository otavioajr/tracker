import { describe, expect, it } from "vitest";

import {
  activateTrailForVehicle,
  clearTrailForVehicle,
  ingestRealtimeTrailPositions,
} from "./dashboard-trails";

describe("dashboard-trails", () => {
  it("starts empty and stores the current cursor when a trail is activated", () => {
    const result = activateTrailForVehicle({
      deviceId: "truck-1",
      currentServerTime: "2026-04-07T12:00:00.000Z",
      activeTrailDeviceIds: new Set<string>(),
      trailCursors: {},
      trails: {},
    });

    expect(result.activeTrailDeviceIds.has("truck-1")).toBe(true);
    expect(result.trails["truck-1"]).toEqual([]);
    expect(result.trailCursors["truck-1"]).toBe("2026-04-07T12:00:00.000Z");
  });

  it("appends only new realtime points for active vehicles and trims by limit", () => {
    const result = ingestRealtimeTrailPositions({
      positions: [
        {
          device_id: "truck-1",
          latitude: -23.551,
          longitude: -46.631,
          speed: 42,
          heading: 0,
          ignition: true,
          device_time: "2026-04-07T12:01:00.000Z",
          server_time: "2026-04-07T12:01:00.000Z",
        },
      ],
      activeTrailDeviceIds: new Set(["truck-1"]),
      trailCursors: { "truck-1": "2026-04-07T12:00:00.000Z" },
      trails: {
        "truck-1": [
          {
            latitude: -23.55,
            longitude: -46.63,
            server_time: "2026-04-07T11:59:00.000Z",
          },
        ],
      },
      pointLimit: 1,
    });

    expect(result.trails["truck-1"]).toEqual([
      {
        latitude: -23.551,
        longitude: -46.631,
        server_time: "2026-04-07T12:01:00.000Z",
      },
    ]);
    expect(result.trailCursors["truck-1"]).toBe("2026-04-07T12:01:00.000Z");
  });

  it("clears only the requested vehicle when a trail is disabled", () => {
    const result = clearTrailForVehicle({
      deviceId: "truck-1",
      activeTrailDeviceIds: new Set(["truck-1", "van-2"]),
      trailCursors: {
        "truck-1": "2026-04-07T12:00:00.000Z",
        "van-2": "2026-04-07T12:00:00.000Z",
      },
      trails: {
        "truck-1": [
          {
            latitude: -23.55,
            longitude: -46.63,
            server_time: "2026-04-07T12:00:00.000Z",
          },
        ],
        "van-2": [
          {
            latitude: -23.56,
            longitude: -46.64,
            server_time: "2026-04-07T12:00:00.000Z",
          },
        ],
      },
    });

    expect(result.activeTrailDeviceIds.has("truck-1")).toBe(false);
    expect(result.trails["truck-1"]).toBeUndefined();
    expect(result.trails["van-2"]).toHaveLength(1);
  });
});
