// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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
              onClick={() => {
                onAlertRead?.(alert.id);
                window.dispatchEvent(
                  new CustomEvent(ALERT_READ_EVENT, {
                    detail: { id: alert.id, newlyRead: true },
                  })
                );
              }}
            >
              Marcar alerta como lido
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function buildAlerts(): AlertFeedAlert[] {
  return [
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
}

afterEach(() => {
  cleanup();
});

function getTrigger(label: string) {
  const trigger = document.querySelector<HTMLButtonElement>(
    `button[data-slot="popover-trigger"][aria-label="${label}"][aria-expanded="false"]`
  );

  expect(trigger).toBeTruthy();
  return trigger as HTMLButtonElement;
}

function getPopover() {
  const popovers = document.querySelectorAll<HTMLElement>(
    '[data-slot="popover-content"]'
  );
  const popover = popovers.item(popovers.length - 1);

  expect(popover).toBeTruthy();
  return popover as HTMLElement;
}

describe("AlertBellMenu", () => {
  it("opens the dropdown and shows recent alerts", async () => {
    const alerts = buildAlerts();

    render(<AlertBellMenu initialAlerts={alerts} initialUnreadCount={2} />);

    fireEvent.click(getTrigger("Alertas (2 não lidos)"));

    expect(await screen.findByText("Alertas")).toBeTruthy();
    expect(screen.getByText("2 não lidos")).toBeTruthy();
    expect(screen.getByText("Excesso de velocidade detectado")).toBeTruthy();

    const link = within(getPopover()).getByRole("link", {
      name: "Ver todos",
    });
    expect(link.getAttribute("href")).toBe("/alerts");
  });

  it("decrements the badge when one unread alert is marked as read", async () => {
    const alerts = buildAlerts();

    render(<AlertBellMenu initialAlerts={alerts} initialUnreadCount={2} />);

    fireEvent.click(getTrigger("Alertas (2 não lidos)"));

    await waitFor(() => {
      expect(within(getPopover()).getByText("Excesso de velocidade detectado")).toBeTruthy();
    });

    fireEvent.click(
      within(getPopover()).getByRole("button", {
        name: "Marcar alerta como lido",
      })
    );

    await waitFor(() => {
      expect(
        document.querySelector(
          'button[data-slot="popover-trigger"][aria-label="Alertas (1 não lidos)"]'
        )
      ).toBeTruthy();
    });
  });

  it("decrements the badge when another alert feed dispatches a read event", async () => {
    const alerts = buildAlerts();

    render(<AlertBellMenu initialAlerts={alerts} initialUnreadCount={2} />);

    fireEvent.click(getTrigger("Alertas (2 não lidos)"));

    window.dispatchEvent(
      new CustomEvent(ALERT_READ_EVENT, {
        detail: { id: "alert-99", newlyRead: true },
      })
    );

    await waitFor(() => {
      expect(
        document.querySelector(
          'button[data-slot="popover-trigger"][aria-label="Alertas (1 não lidos)"]'
        )
      ).toBeTruthy();
    });

    expect(within(getPopover()).getByText("1 não lidos")).toBeTruthy();
  });

  it("does not decrement the badge twice for repeated same-id read events", async () => {
    const alerts = buildAlerts();

    render(<AlertBellMenu initialAlerts={alerts} initialUnreadCount={2} />);

    fireEvent.click(getTrigger("Alertas (2 não lidos)"));

    window.dispatchEvent(
      new CustomEvent(ALERT_READ_EVENT, {
        detail: { id: "alert-1", newlyRead: true },
      })
    );
    window.dispatchEvent(
      new CustomEvent(ALERT_READ_EVENT, {
        detail: { id: "alert-1", newlyRead: true },
      })
    );

    await waitFor(() => {
      expect(
        document.querySelector(
          'button[data-slot="popover-trigger"][aria-label="Alertas (1 não lidos)"]'
        )
      ).toBeTruthy();
    });

    expect(within(getPopover()).getByText("1 não lidos")).toBeTruthy();
  });

  it("resets the dedupe set when the server snapshot resyncs", async () => {
    const alerts = buildAlerts();
    const refreshedAlerts = buildAlerts();
    const { rerender } = render(
      <AlertBellMenu initialAlerts={alerts} initialUnreadCount={2} />
    );

    fireEvent.click(getTrigger("Alertas (2 não lidos)"));

    window.dispatchEvent(
      new CustomEvent(ALERT_READ_EVENT, {
        detail: { id: "alert-1", newlyRead: true },
      })
    );

    await waitFor(() => {
      expect(
        document.querySelector(
          'button[data-slot="popover-trigger"][aria-label="Alertas (1 não lidos)"]'
        )
      ).toBeTruthy();
    });

    rerender(
      <AlertBellMenu initialAlerts={refreshedAlerts} initialUnreadCount={2} />
    );

    await waitFor(() => {
      expect(
        document.querySelector(
          'button[data-slot="popover-trigger"][aria-label="Alertas (2 não lidos)"]'
        )
      ).toBeTruthy();
    });

    window.dispatchEvent(
      new CustomEvent(ALERT_READ_EVENT, {
        detail: { id: "alert-1", newlyRead: true },
      })
    );

    await waitFor(() => {
      expect(
        document.querySelector(
          'button[data-slot="popover-trigger"][aria-label="Alertas (1 não lidos)"]'
        )
      ).toBeTruthy();
    });
  });

  it("resyncs badge and subtitle when the server unread count prop changes", async () => {
    const alerts = buildAlerts();

    const { rerender } = render(
      <AlertBellMenu initialAlerts={alerts} initialUnreadCount={2} />
    );

    fireEvent.click(getTrigger("Alertas (2 não lidos)"));

    rerender(<AlertBellMenu initialAlerts={alerts} initialUnreadCount={5} />);

    await waitFor(() => {
      expect(
        document.querySelector(
          'button[data-slot="popover-trigger"][aria-label="Alertas (5 não lidos)"]'
        )
      ).toBeTruthy();
    });

    expect(within(getPopover()).getByText("5 não lidos")).toBeTruthy();
  });

  it("decrements the badge for already-read reconciliation events", async () => {
    const alerts = buildAlerts();

    render(<AlertBellMenu initialAlerts={alerts} initialUnreadCount={2} />);

    fireEvent.click(getTrigger("Alertas (2 não lidos)"));

    window.dispatchEvent(
      new CustomEvent(ALERT_READ_EVENT, {
        detail: { id: "alert-1", newlyRead: true },
      })
    );

    await waitFor(() => {
      expect(within(getPopover()).getByText("1 não lidos")).toBeTruthy();
    });

    expect(
      document.querySelector(
        'button[data-slot="popover-trigger"][aria-label="Alertas (1 não lidos)"]'
      )
    ).toBeTruthy();
  });

  it("applies the Leaflet-safe z-index on the shared popover positioner", async () => {
    const alerts = buildAlerts();

    render(<AlertBellMenu initialAlerts={alerts} initialUnreadCount={2} />);

    fireEvent.click(getTrigger("Alertas (2 não lidos)"));

    await screen.findByText("2 não lidos");

    const popovers = document.querySelectorAll<HTMLElement>(
      '[data-slot="popover-content"]'
    );
    const popover = Array.from(popovers).find((candidate) =>
      candidate.textContent?.includes("2 não lidos")
    );
    const positioner = popover?.parentElement;

    expect(popover).toBeTruthy();
    expect(positioner).toBeTruthy();
    expect(positioner?.className).toContain("z-[1100]");
  });

  it("shows the load error state without breaking the footer link", async () => {
    const alerts: AlertFeedAlert[] = [];

    render(
      <AlertBellMenu
        initialAlerts={alerts}
        initialUnreadCount={0}
        hasLoadError
      />
    );

    fireEvent.click(getTrigger("Alertas"));

    expect(await screen.findByText("Não foi possível carregar os alertas.")).toBeTruthy();

    const link = within(getPopover()).getByRole("link", {
      name: "Ver todos",
    });
    expect(link.getAttribute("href")).toBe("/alerts");
  });
});
