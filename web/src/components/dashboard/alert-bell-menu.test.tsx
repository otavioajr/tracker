// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { AlertBellMenu } from "./alert-bell-menu";
import type { AlertFeedAlert } from "@/components/alerts/alert-feed";
import { markAlertRead } from "@/lib/actions/alerts";

vi.mock("@/lib/actions/alerts", () => ({
  markAlertRead: vi.fn(),
}));

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

describe("AlertBellMenu", () => {
  beforeEach(() => {
    vi.mocked(markAlertRead).mockReset();
  });

  it("opens the dropdown and shows recent alerts", async () => {
    render(<AlertBellMenu initialAlerts={alerts} initialUnreadCount={2} />);

    fireEvent.click(screen.getByRole("button", { name: /alertas \(2 não lidos\)/i }));

    expect(await screen.findByText("Alertas")).toBeTruthy();
    expect(screen.getByText("2 não lidos")).toBeTruthy();
    expect(screen.getByText("Excesso de velocidade detectado")).toBeTruthy();

    const link = screen.getByRole("link", { name: "Ver todos" });
    expect(link.getAttribute("href")).toBe("/alerts");
  });

  it("decrements the badge when one unread alert is marked as read", async () => {
    vi.mocked(markAlertRead).mockResolvedValue(undefined);

    render(<AlertBellMenu initialAlerts={alerts} initialUnreadCount={2} />);

    fireEvent.click(screen.getAllByRole("button", { name: /alertas \(2 não lidos\)/i })[1]);
    fireEvent.click((await screen.findAllByRole("button", { name: "Marcar alerta como lido" }))[0]);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /alertas \(1 não lidos\)/i })).toBeTruthy();
    });
  });

  it("shows the load error state without breaking the footer link", async () => {
    render(
      <AlertBellMenu
        initialAlerts={[]}
        initialUnreadCount={0}
        hasLoadError
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Alertas" }));

    expect(await screen.findByText("Não foi possível carregar os alertas.")).toBeTruthy();

    const link = screen.getAllByRole("link", { name: "Ver todos" })[0];
    expect(link.getAttribute("href")).toBe("/alerts");
  });
});
