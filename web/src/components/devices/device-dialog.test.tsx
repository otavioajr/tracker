// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { createDevice, updateDevice } = vi.hoisted(() => ({
  createDevice: vi.fn(),
  updateDevice: vi.fn(),
}));

vi.mock("@/lib/actions/devices", () => ({
  createDevice,
  updateDevice,
}));

import { DeviceDialog } from "./device-dialog";

describe("DeviceDialog", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows descriptive copy for create mode", async () => {
    render(<DeviceDialog />);

    fireEvent.click(screen.getByRole("button", { name: /novo dispositivo/i }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeTruthy();
    expect(
      screen.getByText(/cadastre o imei e o modelo para liberar o provisionamento/i)
    ).toBeTruthy();
  });

  it("keeps imei locked in edit mode", async () => {
    render(
      <DeviceDialog
        device={{
          id: "device-1",
          imei: "861234567890123",
          protocol: "suntech",
          model: "ST300",
          active: true,
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /editar dispositivo/i }));

    const imeiInput = screen.getByDisplayValue("861234567890123");
    expect(imeiInput.getAttribute("disabled")).not.toBeNull();
  });

  it("renders action errors inside an alert region", async () => {
    createDevice.mockResolvedValue({ error: "IMEI já cadastrado" });

    render(<DeviceDialog />);
    fireEvent.click(screen.getByRole("button", { name: /novo dispositivo/i }));
    fireEvent.submit(screen.getByRole("button", { name: /criar dispositivo/i }).closest("form")!);

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(await screen.findByText("IMEI já cadastrado")).toBeTruthy();
  });
});
