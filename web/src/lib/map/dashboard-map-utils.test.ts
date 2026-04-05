import { afterEach, describe, expect, it, vi } from "vitest";

import {
  filterDashboardVehicles,
  formatLastSignalRelative,
  getVehicleDisplayLabel,
  getVehicleOperationalStatus,
} from "./dashboard-map-utils";

describe("dashboard-map-utils", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("classifies moving, stopped and offline vehicles with current thresholds", () => {
    const now = new Date("2026-04-04T15:00:00.000Z");

    vi.useFakeTimers();
    vi.setSystemTime(now);

    expect(
      getVehicleOperationalStatus({
        ignition: true,
        speed: 38,
        server_time: now.toISOString(),
      })
    ).toBe("moving");

    expect(
      getVehicleOperationalStatus({
        ignition: true,
        speed: 0,
        server_time: now.toISOString(),
      })
    ).toBe("stopped");

    expect(
      getVehicleOperationalStatus({
        ignition: false,
        speed: 0,
        server_time: "2026-04-04T14:20:00.000Z",
      })
    ).toBe("offline");
  });

  it("prefers vehicle name, then plate, then device id for display", () => {
    expect(
      getVehicleDisplayLabel({
        vehicle_name: "Truck 07",
        plate: "ABC1D23",
        device_id: "device-1",
      })
    ).toBe("Truck 07");

    expect(
      getVehicleDisplayLabel({
        plate: "ABC1D23",
        device_id: "device-1",
      })
    ).toBe("ABC1D23");

    expect(
      getVehicleDisplayLabel({
        device_id: "device-1",
      })
    ).toBe("device-1");
  });

  it("formats the last signal as compact relative time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-04T15:00:00.000Z"));

    expect(formatLastSignalRelative("2026-04-04T15:00:00.000Z")).toBe("agora");
    expect(formatLastSignalRelative("2026-04-04T14:57:00.000Z")).toBe("3 min");
    expect(formatLastSignalRelative("2026-04-04T13:35:00.000Z")).toBe("1h 25m");
  });

  it("filters vehicles by query and operational status", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-04T15:00:00.000Z"));

    const positions = [
      {
        device_id: "truck-1",
        vehicle_name: "Truck 01",
        plate: "ABC1D23",
        ignition: true,
        speed: 42,
        server_time: "2026-04-04T14:59:00.000Z",
      },
      {
        device_id: "van-2",
        vehicle_name: "Van 02",
        plate: "XYZ9K88",
        ignition: true,
        speed: 0,
        server_time: "2026-04-04T14:58:00.000Z",
      },
      {
        device_id: "car-3",
        vehicle_name: "Car 03",
        plate: "HJK5L90",
        ignition: false,
        speed: 0,
        server_time: "2026-04-04T13:00:00.000Z",
      },
    ];

    expect(
      filterDashboardVehicles(positions, {
        query: "truck",
        status: "all",
      }).map((position) => position.device_id)
    ).toEqual(["truck-1"]);

    expect(
      filterDashboardVehicles(positions, {
        query: "",
        status: "stopped",
      }).map((position) => position.device_id)
    ).toEqual(["van-2"]);

    expect(
      filterDashboardVehicles(positions, {
        query: "",
        status: "offline",
      }).map((position) => position.device_id)
    ).toEqual(["car-3"]);
  });
});
