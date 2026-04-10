// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions/devices", () => ({
  getDevices: vi.fn(),
}));

vi.mock("@/lib/actions/pending-devices", () => ({
  getPendingDevices: vi.fn(),
}));

vi.mock("@/lib/actions/vehicles", () => ({
  getVehicles: vi.fn(),
}));

vi.mock("@/components/devices/device-dialog", () => ({
  DeviceDialog: () => <button type="button">Novo dispositivo</button>,
}));

vi.mock("@/components/devices/pending-devices-table", () => ({
  PendingDevicesTable: ({
    pending,
    devices,
    vehicles,
  }: {
    pending: unknown[];
    devices: unknown[];
    vehicles: unknown[];
  }) => (
    <div data-testid="pending-devices-table">
      pending:{pending.length} devices:{devices.length} vehicles:{vehicles.length}
    </div>
  ),
}));

vi.mock("@/components/devices/device-table", () => ({
  DeviceTable: ({ devices }: { devices: unknown[] }) => (
    <div data-testid="device-table">devices:{devices.length}</div>
  ),
}));

import DevicesPage from "./page";
import { getDevices } from "@/lib/actions/devices";
import { getPendingDevices } from "@/lib/actions/pending-devices";
import { getVehicles } from "@/lib/actions/vehicles";

const mockedGetDevices = vi.mocked(getDevices);
const mockedGetPendingDevices = vi.mocked(getPendingDevices);
const mockedGetVehicles = vi.mocked(getVehicles);

describe("DevicesPage", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("uses fetched devices and pending items to render the metrics strip", async () => {
    mockedGetDevices.mockResolvedValue([
      {
        id: "device-1",
        imei: "111",
        model: "A",
        serial_number: "SN-1",
        active: true,
        vehicles: [{ id: "vehicle-1", plate: "ABC1D23" }],
      },
      {
        id: "device-2",
        imei: "222",
        model: "B",
        serial_number: "SN-2",
        active: false,
        vehicles: null,
      },
    ]);
    mockedGetPendingDevices.mockResolvedValue([
      { id: "pending-1" },
      { id: "pending-2" },
      { id: "pending-3" },
    ]);
    mockedGetVehicles.mockResolvedValue([
      {
        id: "vehicle-1",
        name: "Truck 01",
        plate: "ABC1D23",
        device_id: null,
      },
      {
        id: "vehicle-2",
        name: "Truck 02",
        plate: "XYZ9K87",
        device_id: "device-2",
      },
    ]);

    const page = await DevicesPage();
    render(page);

    expect(screen.getByText("Pendentes")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("Ativos")).toBeTruthy();
    expect(screen.getByText("Sem veículo")).toBeTruthy();
    expect(screen.getAllByText("1")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Novo dispositivo" })).toBeTruthy();
    expect(screen.getByTestId("pending-devices-table").textContent).toBe(
      "pending:3 devices:2 vehicles:1",
    );
    expect(screen.getByTestId("device-table").textContent).toBe("devices:2");
  });
});
