import { describe, expect, it } from "vitest";

import {
  normalizeRealtimeLocation,
  reconcilePositions,
  shouldReplaceVehiclePosition,
} from "./position-data";
import type { VehiclePosition } from "@/components/map/types";

function position(overrides: Partial<VehiclePosition> = {}): VehiclePosition {
  return {
    device_id: "truck-1",
    latitude: -23.55,
    longitude: -46.63,
    speed: 10,
    heading: 0,
    ignition: true,
    device_time: "2026-09-11T12:00:00.000Z",
    server_time: "2026-09-11T12:00:01.000Z",
    ...overrides,
  };
}

describe("position-data", () => {
  it("accepts GeoJSON and EWKB points", () => {
    expect(
      normalizeRealtimeLocation({ type: "Point", coordinates: [-46.63, -23.55] })
    ).toEqual({ type: "Point", coordinates: [-46.63, -23.55] });

    const bytes = new Uint8Array(25);
    const view = new DataView(bytes.buffer);
    bytes[0] = 1;
    view.setUint32(1, 0x20000001, true);
    view.setUint32(5, 4326, true);
    view.setFloat64(9, -46.63, true);
    view.setFloat64(17, -23.55, true);
    expect(normalizeRealtimeLocation(Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(""))).toEqual({
      type: "Point",
      coordinates: [-46.63, -23.55],
    });
  });

  it("replaces only on a strictly newer device_time and recovers future contamination", () => {
    const now = Date.parse("2026-09-11T12:00:00.000Z");
    const current = position({ device_time: "2026-09-11T12:00:00.000Z" });
    expect(
      shouldReplaceVehiclePosition(
        current,
        position({ device_time: "2026-09-11T11:59:00.000Z" }),
        now
      )
    ).toBe(false);
    expect(
      shouldReplaceVehiclePosition(
        current,
        position({ device_time: "2026-09-11T12:00:30.000Z" }),
        now
      )
    ).toBe(true);
    expect(
      shouldReplaceVehiclePosition(
        position({ device_time: "2026-09-11T15:00:00.000Z" }),
        position({ device_time: "2026-09-11T12:00:01.000Z" }),
        now
      )
    ).toBe(true);
  });

  it("keeps object references when incoming data is older", () => {
    const current = [position()];
    const next = reconcilePositions(
      current,
      [position({ device_time: "2026-09-11T11:00:00.000Z", speed: 99 })],
      Date.parse("2026-09-11T12:00:00.000Z")
    );
    expect(next[0]).toBe(current[0]);
  });
});
