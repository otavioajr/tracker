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
