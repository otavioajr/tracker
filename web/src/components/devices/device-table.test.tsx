// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const deleteDeviceMock = vi.fn();

vi.mock("./device-dialog", () => ({
  DeviceDialog: () => <button type="button">Novo Dispositivo</button>,
}));

vi.mock("@/lib/actions/devices", () => ({
  deleteDevice: (...args: unknown[]) => deleteDeviceMock(...args),
}));

import { DeviceTable } from "./device-table";

describe("DeviceTable", () => {
  beforeEach(() => {
    deleteDeviceMock.mockReset();
    vi.stubGlobal("confirm", vi.fn(() => true));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders a guided empty state when there are no devices", () => {
    render(<DeviceTable devices={[]} />);

    expect(screen.getByText("Inventário principal")).toBeTruthy();
    expect(screen.getByText("Nenhum dispositivo cadastrado")).toBeTruthy();
    expect(screen.getByText("Novo Dispositivo")).toBeTruthy();
  });

  it("prioritizes IMEI, vínculo and status before secondary metadata on desktop", () => {
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

    const headers = screen.getAllByRole("columnheader").map((header) => header.textContent?.trim());
    const imeiIndex = headers.indexOf("IMEI");
    const vinculoIndex = headers.indexOf("Vínculo");
    const statusIndex = headers.indexOf("Status");
    const protocoloIndex = headers.indexOf("Protocolo");

    expect(imeiIndex).toBeGreaterThanOrEqual(0);
    expect(vinculoIndex).toBeGreaterThan(imeiIndex);
    expect(statusIndex).toBeGreaterThan(vinculoIndex);
    expect(statusIndex).toBeLessThan(protocoloIndex);

    expect(screen.getAllByText("861234567890123").length).toBeGreaterThan(0);
    expect(screen.getAllByText("ABC1D23").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Ativo").length).toBeGreaterThan(0);
  });

  it("renders fallbacks for missing vehicle and last communication", () => {
    render(
      <DeviceTable
        devices={[
          {
            id: "device-1",
            imei: "861234567890123",
            protocol: "suntech",
            model: null,
            active: false,
            last_communication_at: null,
            vehicles: null,
          },
        ]}
      />,
    );

    expect(screen.getAllByText("Sem veículo").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Nunca").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Inativo").length).toBeGreaterThan(0);
  });

  it("deletes the device with the correct id and exposes an accessible delete action", async () => {
    deleteDeviceMock.mockResolvedValue({ success: true });

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

    const deleteButtons = screen.getAllByRole("button", { name: "Excluir dispositivo 861234567890123" });
    expect(deleteButtons.length).toBeGreaterThan(0);

    fireEvent.click(deleteButtons[0]!);

    await waitFor(() => {
      expect(deleteDeviceMock).toHaveBeenCalledWith("device-1");
    });
  });

  it("shows visible feedback when deletion fails and re-enables the action", async () => {
    deleteDeviceMock.mockResolvedValue({ error: "Falha ao excluir" });

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

    const deleteButton = screen.getAllByRole("button", { name: "Excluir dispositivo 861234567890123" })[0];
    fireEvent.click(deleteButton);

    expect(deleteButton.hasAttribute("disabled")).toBe(true);

    await waitFor(() => {
      expect(screen.getByText("Falha ao excluir")).toBeTruthy();
    });

    await waitFor(() => {
      expect(deleteButton.hasAttribute("disabled")).toBe(false);
    });

    const desktopTable = screen.getByRole("table");
    expect(within(desktopTable).getByText("Ativo")).toBeTruthy();
  });
});
