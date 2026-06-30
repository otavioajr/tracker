// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AlertBellMenu } from "./alert-bell-menu";

const markAlertRead = vi.hoisted(() => vi.fn());
const markAllAlertsRead = vi.hoisted(() => vi.fn());

vi.mock("@/lib/actions/alerts", () => ({
  markAlertRead,
  markAllAlertsRead,
}));

const alerts = [
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

afterEach(() => {
  cleanup();
  markAlertRead.mockReset();
  markAllAlertsRead.mockReset();
});

function getTrigger(label: string) {
  const trigger = document.querySelector<HTMLButtonElement>(
    `button[data-slot="popover-trigger"][aria-label="${label}"]`
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

describe("AlertBellMenu integration", () => {
  it("clears all unread alerts through the real feed", async () => {
    markAllAlertsRead.mockResolvedValueOnce({ success: true });

    render(<AlertBellMenu initialAlerts={alerts} initialUnreadCount={2} />);

    fireEvent.click(getTrigger("Alertas (2 não lidos)"));

    await waitFor(() => {
      expect(
        within(getPopover()).getByRole("button", {
          name: "Limpar todos os alertas",
        })
      ).toBeTruthy();
    });

    fireEvent.click(
      within(getPopover()).getByRole("button", {
        name: "Limpar todos os alertas",
      })
    );

    await waitFor(() => {
      expect(markAllAlertsRead).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(
        document.querySelector(
          'button[data-slot="popover-trigger"][aria-label="Alertas"]'
        )
      ).toBeTruthy();
    });

    expect(within(getPopover()).getByText("Nenhum novo alerta")).toBeTruthy();
    expect(
      within(getPopover()).queryByRole("button", {
        name: "Marcar alerta como lido",
      })
    ).toBeNull();
  });

  it.each([
    { result: { success: true }, label: "fresh success" },
    {
      result: { success: true, alreadyRead: true },
      label: "idempotent success",
    },
  ])("decrements the real bell badge on $label", async ({ result }) => {
    markAlertRead.mockResolvedValueOnce(result);

    render(<AlertBellMenu initialAlerts={alerts} initialUnreadCount={2} />);

    fireEvent.click(getTrigger("Alertas (2 não lidos)"));

    await waitFor(() => {
      expect(
        within(getPopover()).getByText("Excesso de velocidade detectado")
      ).toBeTruthy();
    });

    fireEvent.click(
      within(getPopover()).getByRole("button", {
        name: "Marcar alerta como lido",
      })
    );

    await waitFor(() => {
      expect(markAlertRead).toHaveBeenCalledWith("alert-1");
    });

    await waitFor(() => {
      expect(
        document.querySelector(
          'button[data-slot="popover-trigger"][aria-label="Alertas (1 não lidos)"]'
        )
      ).toBeTruthy();
    });

    expect(within(getPopover()).getByText("1 não lidos")).toBeTruthy();
  });

  it.each([
    { result: { success: true }, label: "fresh success" },
    {
      result: { success: true, alreadyRead: true },
      label: "idempotent success",
    },
  ])(
    "keeps the bell list synced after close and reopen on $label",
    async ({ result }) => {
      markAlertRead.mockResolvedValueOnce(result);

      render(<AlertBellMenu initialAlerts={alerts} initialUnreadCount={1} />);

      fireEvent.click(getTrigger("Alertas (1 não lidos)"));

      await waitFor(() => {
        expect(
          within(getPopover()).getByRole("button", {
            name: "Marcar alerta como lido",
          })
        ).toBeTruthy();
      });

      fireEvent.click(
        within(getPopover()).getByRole("button", {
          name: "Marcar alerta como lido",
        })
      );

      await waitFor(() => {
        expect(markAlertRead).toHaveBeenCalledWith("alert-1");
      });

      await waitFor(() => {
        expect(
          document.querySelector(
            'button[data-slot="popover-trigger"][aria-label="Alertas"]'
          )
        ).toBeTruthy();
      });

      expect(within(getPopover()).getByText("Nenhum novo alerta")).toBeTruthy();
      expect(
        within(getPopover()).queryByRole("button", {
          name: "Marcar alerta como lido",
        })
      ).toBeNull();

      fireEvent.click(getTrigger("Alertas"));
      await waitFor(() => {
        expect(
          document.querySelector(
            'button[data-slot="popover-trigger"][aria-label="Alertas"][aria-expanded="false"]'
          )
        ).toBeTruthy();
      });

      fireEvent.click(getTrigger("Alertas"));

      await waitFor(() => {
        expect(within(getPopover()).getByText("Nenhum novo alerta")).toBeTruthy();
      });

      expect(
        within(getPopover()).queryByRole("button", {
          name: "Marcar alerta como lido",
        })
      ).toBeNull();
    }
  );
});
