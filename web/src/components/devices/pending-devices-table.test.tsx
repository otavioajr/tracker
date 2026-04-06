// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { dismissPendingDevice, linkPendingDevice } = vi.hoisted(() => ({
  dismissPendingDevice: vi.fn(),
  linkPendingDevice: vi.fn(),
}));

vi.mock("@/lib/actions/pending-devices", () => ({
  dismissPendingDevice,
  linkPendingDevice,
}));

import { PendingDevicesTable } from "./pending-devices-table";

describe("PendingDevicesTable", () => {
  beforeEach(() => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    linkPendingDevice.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("does not render the panel when there are no pending devices", () => {
    const { container } = render(
      <PendingDevicesTable pending={[]} devices={[]} />
    );

    expect(container.firstChild).toBeNull();
  });

  it("renders an operational pending panel with the main link CTA", () => {
    render(
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
        devices={[
          {
            id: "device-1",
            imei: "861234567890123",
            model: "ST300",
            serial_number: null,
          },
        ]}
      />
    );

    expect(screen.getByText("Ação prioritária")).toBeTruthy();
    expect(screen.getByText("SN-AX92031")).toBeTruthy();
    expect(screen.getByRole("button", { name: /vincular/i })).toBeTruthy();
  });

  it("opens the dialog and links an eligible candidate", () => {
    render(
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
        devices={[
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
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /vincular/i }));

    expect(screen.getByText(/vincular serial sn-ax92031/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /861234567890123/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /869999999999999/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /861234567890123/i }));

    expect(linkPendingDevice).toHaveBeenCalledWith("pending-1", "device-1");
  });

  it("disables candidate buttons while linking is in progress", () => {
    let resolveLink: (() => void) | undefined;
    linkPendingDevice.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveLink = resolve;
        }),
    );

    render(
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
        devices={[
          {
            id: "device-1",
            imei: "861234567890123",
            model: "ST300",
            serial_number: null,
          },
        ]}
      />
    );

    const trigger = screen.getByRole("button", { name: /vincular/i });
    fireEvent.click(trigger);

    const candidate = screen.getByRole("button", { name: /861234567890123/i });
    fireEvent.click(candidate);

    expect(candidate.hasAttribute("disabled")).toBe(true);
    expect(trigger.hasAttribute("disabled")).toBe(true);

    resolveLink?.();
  });

  it("shows the empty state when there are no eligible candidates", () => {
    render(
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
        devices={[
          {
            id: "device-1",
            imei: "861234567890123",
            model: "ST300",
            serial_number: "SN-ALREADY-BOUND",
          },
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /vincular/i }));

    expect(
      screen.getByText("Todos os dispositivos cadastrados já possuem serial vinculado."),
    ).toBeTruthy();
  });

  it("keeps dismiss available as a lower-emphasis action", () => {
    render(
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
        devices={[]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /ignorar pendência/i }));

    expect(dismissPendingDevice).toHaveBeenCalledWith("pending-1");
  });
});
