// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  dismissPendingDevice,
  linkPendingDevice,
  createDeviceFromPending,
  createDeviceAndAssignVehicleFromPending,
  createDeviceAndVehicleFromPending,
} = vi.hoisted(() => ({
  dismissPendingDevice: vi.fn(),
  linkPendingDevice: vi.fn(),
  createDeviceFromPending: vi.fn(),
  createDeviceAndAssignVehicleFromPending: vi.fn(),
  createDeviceAndVehicleFromPending: vi.fn(),
}));

vi.mock("@/lib/actions/pending-devices", () => ({
  dismissPendingDevice,
  linkPendingDevice,
  createDeviceFromPending,
  createDeviceAndAssignVehicleFromPending,
  createDeviceAndVehicleFromPending,
}));

import { PendingDevicesTable } from "./pending-devices-table";

function renderTable({
  devices = [],
  vehicles = [],
}: {
  devices?: Array<{
    id: string;
    imei: string;
    model: string | null;
    serial_number: string | null;
  }>;
  vehicles?: Array<{
    id: string;
    name: string | null;
    plate: string;
  }>;
} = {}) {
  return render(
    <PendingDevicesTable
      pending={[
        {
          id: "pending-1",
          serial: "SN-AX92031",
          protocol: "suntech",
          ip_address: "177.44.10.2",
          first_seen_at: "2026-04-05T10:00:00.000Z",
          last_seen_at: "2026-04-05T10:12:00.000Z",
          message_count: 12,
        },
      ]}
      devices={devices}
      vehicles={vehicles}
    />,
  );
}

describe("PendingDevicesTable", () => {
  beforeEach(() => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    linkPendingDevice.mockResolvedValue({ success: true });
    createDeviceFromPending.mockResolvedValue({ success: true });
    createDeviceAndAssignVehicleFromPending.mockResolvedValue({ success: true });
    createDeviceAndVehicleFromPending.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("does not render the panel when there are no pending devices", () => {
    const { container } = render(
      <PendingDevicesTable pending={[]} devices={[]} vehicles={[]} />,
    );

    expect(container.firstChild).toBeNull();
  });

  it("renders an operational pending panel with the main link CTA", () => {
    renderTable({
      devices: [
        {
          id: "device-1",
          imei: "861234567890123",
          model: "ST300",
          serial_number: null,
        },
      ],
    });

    expect(screen.getByText("Ação prioritária")).toBeTruthy();
    expect(screen.getByText("SN-AX92031")).toBeTruthy();
    expect(screen.getByRole("button", { name: /vincular/i })).toBeTruthy();
  });

  it("opens the dialog and links an eligible existing device", async () => {
    renderTable({
      devices: [
        {
          id: "device-1",
          imei: "861234567890123",
          model: "ST300",
          serial_number: null,
        },
        {
          id: "device-2",
          imei: "869999999999999",
          model: "ST310",
          serial_number: "SN-ALREADY-BOUND",
        },
      ],
    });

    fireEvent.click(screen.getByRole("button", { name: /vincular/i }));

    expect(screen.getByText(/vincular serial sn-ax92031/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /usar dispositivo existente/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /861234567890123/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /869999999999999/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /861234567890123/i }));

    await waitFor(() => {
      expect(linkPendingDevice).toHaveBeenCalledWith("pending-1", "device-1");
    });
  });

  it("creates a new available device from the pending serial", async () => {
    renderTable();

    fireEvent.click(screen.getByRole("button", { name: /vincular/i }));
    fireEvent.click(screen.getByRole("button", { name: /novo dispositivo/i }));

    fireEvent.change(screen.getByLabelText("IMEI"), {
      target: { value: "861234567890123" },
    });
    fireEvent.change(screen.getByLabelText("Modelo"), {
      target: { value: "ST300" },
    });

    fireEvent.submit(screen.getByRole("button", { name: /criar dispositivo/i }).closest("form")!);

    await waitFor(() => {
      expect(createDeviceFromPending).toHaveBeenCalledTimes(1);
    });

    expect(createDeviceFromPending).toHaveBeenCalledWith(
      "pending-1",
      expect.any(FormData),
    );

    const formData = createDeviceFromPending.mock.calls[0]?.[1] as FormData;
    expect(formData.get("imei")).toBe("861234567890123");
    expect(formData.get("model")).toBe("ST300");
  });

  it("creates a device and assigns it to an existing vehicle", async () => {
    renderTable({
      vehicles: [
        {
          id: "vehicle-1",
          name: "Truck 01",
          plate: "ABC1D23",
        },
      ],
    });

    fireEvent.click(screen.getByRole("button", { name: /vincular/i }));
    fireEvent.click(screen.getByRole("button", { name: /vincular a carro existente/i }));

    fireEvent.change(screen.getByLabelText("IMEI"), {
      target: { value: "861234567890123" },
    });
    fireEvent.change(screen.getByLabelText("Modelo"), {
      target: { value: "ST310" },
    });
    fireEvent.change(screen.getByLabelText("Veículo"), {
      target: { value: "vehicle-1" },
    });

    fireEvent.submit(screen.getByRole("button", { name: /vincular ao veículo/i }).closest("form")!);

    await waitFor(() => {
      expect(createDeviceAndAssignVehicleFromPending).toHaveBeenCalledTimes(1);
    });

    expect(createDeviceAndAssignVehicleFromPending).toHaveBeenCalledWith(
      "pending-1",
      "vehicle-1",
      expect.any(FormData),
    );
  });

  it("shows an empty state when there are no vehicles available", () => {
    renderTable();

    fireEvent.click(screen.getByRole("button", { name: /vincular/i }));
    fireEvent.click(screen.getByRole("button", { name: /vincular a carro existente/i }));

    expect(
      screen.getByText("Nenhum veículo disponível para receber este dispositivo."),
    ).toBeTruthy();
  });

  it("creates a device and a new vehicle in the same flow", async () => {
    renderTable();

    fireEvent.click(screen.getByRole("button", { name: /vincular/i }));
    fireEvent.click(screen.getByRole("button", { name: /cadastrar novo carro/i }));

    fireEvent.change(screen.getByLabelText("IMEI"), {
      target: { value: "861234567890123" },
    });
    fireEvent.change(screen.getByLabelText("Modelo"), {
      target: { value: "ST340" },
    });
    fireEvent.change(screen.getByLabelText("Placa"), {
      target: { value: "BRA2E19" },
    });
    fireEvent.change(screen.getByLabelText("Nome / Apelido"), {
      target: { value: "Fiorino" },
    });
    fireEvent.change(screen.getByLabelText("Modelo do veículo"), {
      target: { value: "Fiorino Endurance" },
    });

    fireEvent.submit(screen.getByRole("button", { name: /criar veículo e vincular/i }).closest("form")!);

    await waitFor(() => {
      expect(createDeviceAndVehicleFromPending).toHaveBeenCalledTimes(1);
    });

    expect(createDeviceAndVehicleFromPending).toHaveBeenCalledWith(
      "pending-1",
      expect.any(FormData),
    );

    const formData = createDeviceAndVehicleFromPending.mock.calls[0]?.[1] as FormData;
    expect(formData.get("imei")).toBe("861234567890123");
    expect(formData.get("model")).toBe("ST340");
    expect(formData.get("plate")).toBe("BRA2E19");
    expect(formData.get("name")).toBe("Fiorino");
    expect(formData.get("vehicle_model")).toBe("Fiorino Endurance");
  });

  it("disables the active mode submit while creation is in progress", async () => {
    let resolveCreate: (() => void) | undefined;
    createDeviceFromPending.mockImplementation(
      () =>
        new Promise<{ success: true }>((resolve) => {
          resolveCreate = () => resolve({ success: true });
        }),
    );

    renderTable();

    fireEvent.click(screen.getByRole("button", { name: /vincular/i }));
    fireEvent.click(screen.getByRole("button", { name: /novo dispositivo/i }));
    fireEvent.change(screen.getByLabelText("IMEI"), {
      target: { value: "861234567890123" },
    });

    const submitButton = screen.getByRole("button", { name: /criar dispositivo/i });
    fireEvent.submit(submitButton.closest("form")!);

    await waitFor(() => {
      expect(submitButton.hasAttribute("disabled")).toBe(true);
    });

    resolveCreate?.();
  });

  it("keeps dismiss available as a lower-emphasis action", () => {
    renderTable();

    fireEvent.click(screen.getByRole("button", { name: /ignorar pendência/i }));

    expect(dismissPendingDevice).toHaveBeenCalledWith("pending-1");
  });
});
