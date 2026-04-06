import { describe, expect, it } from "vitest";

import {
  buildDeviceMetrics,
  formatDeviceLastCommunication,
  getPrimaryVehicle,
} from "./device-presenters";

describe("device-presenters", () => {
  it("builds operational metrics from the device list and pending count", () => {
    const metrics = buildDeviceMetrics(
      [
        {
          active: true,
          vehicles: { id: "vehicle-1", plate: "ABC1D23" },
        },
        {
          active: false,
          vehicles: null,
        },
      ],
      4,
    );

    expect(metrics).toEqual({
      total: 2,
      pending: 4,
      active: 1,
      unassigned: 1,
    });
  });

  it("returns the first related vehicle regardless of array or object shape", () => {
    expect(
      getPrimaryVehicle([{ id: "vehicle-1", plate: "ABC1D23" }]),
    ).toEqual({ id: "vehicle-1", plate: "ABC1D23" });

    expect(
      getPrimaryVehicle({ id: "vehicle-2", plate: "XYZ9K88" }),
    ).toEqual({ id: "vehicle-2", plate: "XYZ9K88" });

    expect(getPrimaryVehicle([])).toBeNull();
    expect(getPrimaryVehicle(null)).toBeNull();
  });

  it("formats relative last communication for fast scanning", () => {
    const now = new Date("2026-04-05T12:00:00.000Z");

    expect(formatDeviceLastCommunication(null, now)).toBe("Nunca");
    expect(
      formatDeviceLastCommunication("2026-04-05T11:59:40.000Z", now),
    ).toBe("Agora");
    expect(
      formatDeviceLastCommunication("2026-04-05T11:42:00.000Z", now),
    ).toBe("há 18 min");
    expect(
      formatDeviceLastCommunication("2026-04-05T09:00:00.000Z", now),
    ).toBe("há 3h");
  });

  it("handles invalid and future communication timestamps safely", () => {
    const now = new Date("2026-04-05T12:00:00.000Z");

    expect(formatDeviceLastCommunication("not-a-date", now)).toBe("Nunca");
    expect(
      formatDeviceLastCommunication("2026-04-05T12:10:00.000Z", now),
    ).toBe("Agora");
  });
});
