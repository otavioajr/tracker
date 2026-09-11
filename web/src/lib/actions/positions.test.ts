import { beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: fromMock }),
}));

import { getLatestPositions } from "./positions";

describe("getLatestPositions", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it("reads latest_positions and keeps vehicle metadata", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "devices") {
        return {
          select: () => ({
            eq: async () => ({
              data: [
                {
                  id: "d1",
                  imei: "1",
                  vehicles: { name: "Truck 01", plate: "ABC1D23", brand: "VW", model: "Cargo" },
                },
              ],
              error: null,
            }),
          }),
        };
      }
      return {
        select: () => ({
          in: async () => ({
            data: [
              {
                device_id: "d1",
                vehicle_id: "v1",
                location: { type: "Point", coordinates: [-46.63, -23.55] },
                speed: 42,
                heading: 10,
                ignition: true,
                device_time: "2026-09-11T12:00:00.000Z",
                server_time: "2026-09-11T12:00:01.000Z",
                received_at: "2026-09-11T12:00:01.000Z",
              },
            ],
            error: null,
          }),
        }),
      };
    });

    await expect(getLatestPositions()).resolves.toEqual([
      {
        device_id: "d1",
        vehicle_id: "v1",
        latitude: -23.55,
        longitude: -46.63,
        speed: 42,
        heading: 10,
        ignition: true,
        device_time: "2026-09-11T12:00:00.000Z",
        server_time: "2026-09-11T12:00:01.000Z",
        received_at: "2026-09-11T12:00:01.000Z",
        plate: "ABC1D23",
        vehicle_name: "Truck 01",
        vehicle_model: "VW Cargo",
      },
    ]);
  });

  it("fails visibly when latest_positions cannot be read", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "devices") {
        return {
          select: () => ({
            eq: async () => ({ data: [{ id: "d1", imei: "1", vehicles: null }], error: null }),
          }),
        };
      }
      return {
        select: () => ({
          in: async () => ({ data: null, error: { message: "permission denied" } }),
        }),
      };
    });

    await expect(getLatestPositions()).rejects.toThrow("permission denied");
  });
});
