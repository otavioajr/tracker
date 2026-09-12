// @vitest-environment jsdom

import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { subscribe, removeChannel } = vi.hoisted(() => ({
  subscribe: vi.fn(),
  removeChannel: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    channel: () => ({ on: () => ({ subscribe }) }),
    removeChannel,
  }),
}));
vi.mock("@/lib/actions/positions", () => ({ getLatestPositions: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

import {
  mergeRealtimeVehiclePosition,
  normalizeRealtimeLocation,
  useRealtimePositionsState,
} from "./use-realtime-positions";
import type { VehiclePosition } from "@/lib/actions/positions";

// Snapshots atrasados não podem sobrescrever um ponto mais recente após uma renderização.
it("applies replacement snapshots without moving backwards or leaking subscriptions", async () => {
  const first: VehiclePosition = {
    device_id: "truck-1", latitude: -23.55, longitude: -46.63,
    speed: 0, heading: 0, ignition: false,
    device_time: "2026-04-07T12:00:00Z", server_time: "2026-04-07T12:00:01Z",
  };
  const newer = { ...first, latitude: -23.56, device_time: "2026-04-07T12:01:00Z" };
  const { result, rerender, unmount } = renderHook(
    ({ snapshot }) => useRealtimePositionsState(snapshot),
    { initialProps: { snapshot: [first] } }
  );
  rerender({ snapshot: [newer] });
  await waitFor(() => expect(result.current.positions[0]).toEqual(newer));
  rerender({ snapshot: [first] });
  await waitFor(() => expect(result.current.positions[0]).toEqual(newer));
  unmount();
  expect(removeChannel).toHaveBeenCalledTimes(1);
});

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
      received_at: null,
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
      device_time: "2026-04-07T12:05:00.000Z",
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
        server_time: "2026-04-07T12:06:00.000Z",
      })
    ).toBe(existing);
  });
});
