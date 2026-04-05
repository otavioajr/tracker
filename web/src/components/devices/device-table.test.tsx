// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./device-dialog", () => ({
  DeviceDialog: () => <button type="button">Novo Dispositivo</button>,
}));

vi.mock("@/lib/actions/devices", () => ({
  deleteDevice: vi.fn(),
}));

import { DeviceTable } from "./device-table";

describe("DeviceTable", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a guided empty state when there are no devices", () => {
    render(<DeviceTable devices={[]} />);

    expect(screen.getByText("Inventário principal")).toBeTruthy();
    expect(screen.getByText("Nenhum dispositivo cadastrado")).toBeTruthy();
    expect(screen.getByText("Novo Dispositivo")).toBeTruthy();
  });

  it("renders the most important fields first for scanning", () => {
    render(
      <DeviceTable
        devices={[
          {
            id: "device-1",
            imei: "861234567890123",
            protocol: "suntech",
            model: "ST300",
            active: true,
            last_communication_at: "2026-04-05T11:58:00.000Z",
            vehicles: { id: "vehicle-1", plate: "ABC1D23" },
          },
        ]}
      />,
    );

    expect(screen.getAllByText("861234567890123").length).toBeGreaterThan(0);
    expect(screen.getAllByText("ABC1D23").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Ativo").length).toBeGreaterThan(0);
  });
});
