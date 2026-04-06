// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("submits create mode and closes after success", async () => {
    createDevice.mockResolvedValue({ success: true });

    render(<DeviceDialog />);

    fireEvent.click(screen.getByRole("button", { name: /novo dispositivo/i }));

    fireEvent.change(screen.getByLabelText("IMEI"), {
      target: { value: "861234567890123" },
    });
    fireEvent.change(screen.getByLabelText("Modelo"), {
      target: { value: "ST300" },
    });

    fireEvent.submit(screen.getByRole("button", { name: /criar dispositivo/i }).closest("form")!);

    await waitFor(() => {
      expect(createDevice).toHaveBeenCalledTimes(1);
    });

    const formData = createDevice.mock.calls[0]?.[0] as FormData;
    expect(formData.get("imei")).toBe("861234567890123");
    expect(formData.get("model")).toBe("ST300");

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("submits edit mode with imei preserved in form data", async () => {
    updateDevice.mockResolvedValue({ success: true });

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
    expect(imeiInput.getAttribute("readonly")).not.toBeNull();

    fireEvent.change(screen.getByLabelText("Modelo"), {
      target: { value: "ST310" },
    });

    fireEvent.submit(screen.getByRole("button", { name: /salvar alterações/i }).closest("form")!);

    await waitFor(() => {
      expect(updateDevice).toHaveBeenCalledTimes(1);
    });

    expect(updateDevice).toHaveBeenCalledWith(
      "device-1",
      expect.any(FormData),
    );

    const formData = updateDevice.mock.calls[0]?.[1] as FormData;
    expect(formData.get("imei")).toBe("861234567890123");
    expect(formData.get("model")).toBe("ST310");
  });

  it("keeps the dialog open and renders an alert when submit fails", async () => {
    createDevice.mockResolvedValue({ error: "IMEI já cadastrado" });

    render(<DeviceDialog />);
    fireEvent.click(screen.getByRole("button", { name: /novo dispositivo/i }));
    fireEvent.change(screen.getByLabelText("IMEI"), {
      target: { value: "861234567890123" },
    });
    fireEvent.change(screen.getByLabelText("Modelo"), {
      target: { value: "ST300" },
    });
    fireEvent.submit(screen.getByRole("button", { name: /criar dispositivo/i }).closest("form")!);

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(await screen.findByText("IMEI já cadastrado")).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
