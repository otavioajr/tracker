// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { AlertFeedAlert } from "@/components/alerts/alert-feed";

import { AlertBellMenu } from "./alert-bell-menu";

vi.mock("@/components/alerts/alert-feed", () => ({
  AlertFeed: AlertFeedMock,
}));

function AlertFeedMock({
  alerts,
  onAlertRead,
}: {
  alerts: AlertFeedAlert[];
  variant?: "page" | "dropdown";
  onAlertRead?: (id: string) => void;
}) {
  return (
    <div>
      {alerts.map((alert) => (
        <div key={alert.id}>
          <p>{alert.message}</p>
          {!alert.read ? (
            <button
              type="button"
              aria-label="Marcar alerta como lido"
              onClick={() => onAlertRead?.(alert.id)}
            >
              Marcar alerta como lido
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

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

function getTrigger(label: string) {
  const trigger = document.querySelector<HTMLButtonElement>(
    `button[data-slot="dropdown-menu-trigger"][aria-label="${label}"][aria-expanded="false"]`
  );

  expect(trigger).toBeTruthy();
  return trigger as HTMLButtonElement;
}

function getMenu() {
  const menu = document.querySelector<HTMLElement>('[role="menu"]');
  expect(menu).toBeTruthy();
  return menu as HTMLElement;
}

describe("AlertBellMenu", () => {
  it("opens the dropdown and shows recent alerts", async () => {
    render(<AlertBellMenu initialAlerts={alerts} initialUnreadCount={2} />);

    fireEvent.click(getTrigger("Alertas (2 não lidos)"));

    expect(await screen.findByText("Alertas")).toBeTruthy();
    expect(screen.getByText("2 não lidos")).toBeTruthy();
    expect(screen.getByText("Excesso de velocidade detectado")).toBeTruthy();

    const link = within(getMenu()).getByRole("link", {
      name: "Ver todos",
    });
    expect(link.getAttribute("href")).toBe("/alerts");
  });

  it("decrements the badge when one unread alert is marked as read", async () => {
    render(<AlertBellMenu initialAlerts={alerts} initialUnreadCount={2} />);

    fireEvent.click(getTrigger("Alertas (2 não lidos)"));

    await waitFor(() => {
      expect(within(getMenu()).getByText("Excesso de velocidade detectado")).toBeTruthy();
    });

    fireEvent.click(
      within(getMenu()).getByRole("button", {
        name: "Marcar alerta como lido",
      })
    );

    await waitFor(() => {
      expect(
        document.querySelector(
          'button[data-slot="dropdown-menu-trigger"][aria-label="Alertas (1 não lidos)"]'
        )
      ).toBeTruthy();
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

    fireEvent.click(getTrigger("Alertas"));

    expect(await screen.findByText("Não foi possível carregar os alertas.")).toBeTruthy();

    const link = within(getMenu()).getByRole("link", {
      name: "Ver todos",
    });
    expect(link.getAttribute("href")).toBe("/alerts");
  });
});
