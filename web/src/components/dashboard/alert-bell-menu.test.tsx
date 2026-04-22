// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  ALERT_READ_EVENT,
  type AlertFeedAlert,
} from "@/components/alerts/alert-feed";

import { AlertBellMenu } from "./alert-bell-menu";

vi.mock("@/components/alerts/alert-feed", () => ({
  ALERT_READ_EVENT: "tracker:alert-read",
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
  const menus = document.querySelectorAll<HTMLElement>('[role="menu"]');
  const menu = menus.item(menus.length - 1);

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

  it("decrements the badge when another alert feed dispatches a read event", async () => {
    render(<AlertBellMenu initialAlerts={alerts} initialUnreadCount={2} />);

    fireEvent.click(getTrigger("Alertas (2 não lidos)"));

    window.dispatchEvent(
      new CustomEvent(ALERT_READ_EVENT, {
        detail: { id: "alert-99" },
      })
    );

    await waitFor(() => {
      expect(
        document.querySelector(
          'button[data-slot="dropdown-menu-trigger"][aria-label="Alertas (1 não lidos)"]'
        )
      ).toBeTruthy();
    });

    expect(within(getMenu()).getByText("1 não lidos")).toBeTruthy();
  });

  it("resyncs badge and subtitle when the server unread count prop changes", async () => {
    const { rerender } = render(
      <AlertBellMenu initialAlerts={alerts} initialUnreadCount={2} />
    );

    fireEvent.click(getTrigger("Alertas (2 não lidos)"));

    rerender(<AlertBellMenu initialAlerts={alerts} initialUnreadCount={5} />);

    await waitFor(() => {
      expect(
        document.querySelector(
          'button[data-slot="dropdown-menu-trigger"][aria-label="Alertas (5 não lidos)"]'
        )
      ).toBeTruthy();
    });

    expect(within(getMenu()).getByText("5 não lidos")).toBeTruthy();
  });

  it("applies the Leaflet-safe z-index on the shared dropdown positioner", async () => {
    render(<AlertBellMenu initialAlerts={alerts} initialUnreadCount={2} />);

    fireEvent.click(getTrigger("Alertas (2 não lidos)"));

    const menus = await screen.findAllByRole("menu");
    const menu = menus.find((candidate) =>
      candidate.textContent?.includes("2 não lidos")
    );
    const positioner = menu.parentElement;

    expect(menu).toBeTruthy();
    expect(positioner).toBeTruthy();
    expect(positioner?.className).toContain("z-[1100]");
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
