// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AlertFeedAlert } from "@/components/alerts/alert-feed";

const { getUnreadAlertCount, getAlerts, alertBellMenuMock } = vi.hoisted(() => ({
  getUnreadAlertCount: vi.fn(),
  getAlerts: vi.fn(),
  alertBellMenuMock: vi.fn(),
}));

vi.mock("@/lib/actions/alerts", () => ({
  getUnreadAlertCount,
  getAlerts,
}));

vi.mock("./alert-bell-menu", () => ({
  AlertBellMenu: alertBellMenuMock,
}));

import { AlertBell } from "./alert-bell";

describe("AlertBell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes unread count and recent alerts to the client menu", async () => {
    const alerts: AlertFeedAlert[] = [
      {
        id: "alert-1",
        type: "Velocidade",
        severity: "warning",
        message: "Excesso de velocidade detectado",
        read: false,
        created_at: "2026-04-22T10:00:00.000Z",
        devices: {
          imei: "123456789012345",
          vehicles: { plate: "ABC1D23" },
        },
      },
    ];

    getUnreadAlertCount.mockResolvedValue(3);
    getAlerts.mockResolvedValue(alerts);
    alertBellMenuMock.mockReturnValue(null);

    const tree = await AlertBell();
    render(tree);

    expect(getUnreadAlertCount).toHaveBeenCalledTimes(1);
    expect(getAlerts).toHaveBeenCalledWith(10);
    expect(alertBellMenuMock).toHaveBeenCalledWith(
      {
        initialUnreadCount: 3,
        initialAlerts: alerts,
        hasLoadError: false,
      },
      undefined
    );
  });

  it("falls back to empty alerts and error state when recent alerts fail", async () => {
    getUnreadAlertCount.mockResolvedValue(2);
    getAlerts.mockRejectedValue(new Error("boom"));
    alertBellMenuMock.mockReturnValue(null);

    const tree = await AlertBell();
    render(tree);

    expect(alertBellMenuMock).toHaveBeenCalledWith(
      {
        initialUnreadCount: 2,
        initialAlerts: [],
        hasLoadError: true,
      },
      undefined
    );
  });
});
