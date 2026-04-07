import { describe, expect, it } from "vitest";

import {
  mergeRealtimeVehiclePosition,
  normalizeRealtimeLocation,
} from "./use-realtime-positions";
import type { VehiclePosition } from "@/lib/actions/positions";

describe("use-realtime-positions helpers", () => {
  it("accepts GeoJSON payloads encoded as strings", () => {
    expect(
      normalizeRealtimeLocation(
        JSON.stringify({
          type: "Point",
          coordinates: [-46.63, -23.55],
        })
      )
    ).toEqual({
      type: "Point",
      coordinates: [-46.63, -23.55],
    });
  });

  it("preserves vehicle metadata while merging realtime rows", () => {
    const existing: VehiclePosition = {
      device_id: "truck-1",
      latitude: -23.55,
      longitude: -46.63,
      speed: 10,
      heading: 0,
      ignition: true,
      device_time: "2026-04-07T12:00:00.000Z",
      server_time: "2026-04-07T12:00:00.000Z",
      plate: "ABC1D23",
      vehicle_name: "Truck 01",
      vehicle_model: "Cargo",
    };

    expect(
      mergeRealtimeVehiclePosition(existing, {
        device_id: "truck-1",
        location: {
          type: "Point",
          coordinates: [-46.631, -23.551],
        },
        speed: 42,
        heading: 15,
        ignition: true,
        device_time: "2026-04-07T12:01:00.000Z",
        server_time: "2026-04-07T12:01:00.000Z",
      })
    ).toEqual({
      ...existing,
      latitude: -23.551,
      longitude: -46.631,
      speed: 42,
      heading: 15,
      device_time: "2026-04-07T12:01:00.000Z",
      server_time: "2026-04-07T12:01:00.000Z",
    });
  });

  it("ignores stale realtime rows older than the current position", () => {
    const existing: VehiclePosition = {
      device_id: "truck-1",
      latitude: -23.55,
      longitude: -46.63,
      speed: 10,
      heading: 0,
      ignition: true,
      device_time: "2026-04-07T12:00:00.000Z",
      server_time: "2026-04-07T12:05:00.000Z",
    };

    expect(
      mergeRealtimeVehiclePosition(existing, {
        device_id: "truck-1",
        location: {
          type: "Point",
          coordinates: [-46.631, -23.551],
        },
        speed: 42,
        heading: 15,
        ignition: true,
        device_time: "2026-04-07T12:01:00.000Z",
        server_time: "2026-04-07T12:01:00.000Z",
      })
    ).toBe(existing);
  });
});
