// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ALERT_READ_EVENT, AlertFeed, type AlertFeedAlert } from "./alert-feed";

const markAlertRead = vi.hoisted(() => vi.fn());

vi.mock("@/lib/actions/alerts", () => ({
  markAlertRead,
}));

const alerts: AlertFeedAlert[] = [
  {
    id: "alert-1",
    type: "speed",
    severity: "warning",
    message: "Excesso de velocidade detectado",
    read: false,
    created_at: "2026-04-21T12:34:00.000Z",
    devices: {
      imei: "861234567890123",
      vehicles: { plate: "ABC1D23" },
    },
  },
  {
    id: "alert-2",
    type: "ignition",
    severity: "info",
    message: "Ignição ligada",
    read: true,
    created_at: "2026-04-21T13:00:00.000Z",
    devices: {
      imei: "861234567890124",
      vehicles: { plate: "XYZ9K88" },
    },
  },
];

afterEach(() => {
  cleanup();
  markAlertRead.mockReset();
});

describe("AlertFeed", () => {
  it("uses the default page variant and updates locally on success", async () => {
    markAlertRead.mockResolvedValueOnce({ success: true });
    const onAlertRead = vi.fn();

    render(<AlertFeed alerts={alerts} onAlertRead={onAlertRead} />);

    const markButton = screen.getByRole("button", { name: /marcar alerta como lido/i });
    fireEvent.click(markButton);

    await waitFor(() => expect(markAlertRead).toHaveBeenCalledWith("alert-1"));
    await waitFor(() => expect(onAlertRead).toHaveBeenCalledWith("alert-1"));
    expect(screen.queryByRole("button", { name: /marcar alerta como lido/i })).toBeNull();
  });

  it("dispatches a browser event when a page feed marks an alert as read without a callback", async () => {
    markAlertRead.mockResolvedValueOnce({ success: true });
    const listener = vi.fn();

    window.addEventListener(ALERT_READ_EVENT, listener as EventListener);

    render(<AlertFeed alerts={alerts} variant="page" />);

    fireEvent.click(screen.getByRole("button", { name: /marcar alerta como lido/i }));

    await waitFor(() => expect(markAlertRead).toHaveBeenCalledWith("alert-1"));
    await waitFor(() => expect(listener).toHaveBeenCalledTimes(1));

    const event = listener.mock.calls[0]?.[0] as CustomEvent<{
      id: string;
      countChanged: boolean;
    }>;
    expect(event.detail).toEqual({ id: "alert-1", countChanged: true });
    expect(screen.queryByRole("button", { name: /marcar alerta como lido/i })).toBeNull();

    window.removeEventListener(ALERT_READ_EVENT, listener as EventListener);
  });

  it("syncs another visible feed when one feed marks an alert as read", async () => {
    markAlertRead.mockResolvedValueOnce({ success: true });

    render(
      <>
        <AlertFeed alerts={alerts} variant="page" />
        <AlertFeed alerts={alerts} variant="dropdown" />
      </>
    );

    expect(
      screen.getAllByRole("button", { name: /marcar alerta como lido/i })
    ).toHaveLength(2);

    fireEvent.click(
      screen.getAllByRole("button", { name: /marcar alerta como lido/i })[0]
    );

    await waitFor(() => expect(markAlertRead).toHaveBeenCalledWith("alert-1"));
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /marcar alerta como lido/i })
      ).toBeNull()
    );
  });

  it("keeps the unread alert actionable when the action resolves with an error", async () => {
    markAlertRead.mockResolvedValueOnce({ error: "boom" });
    const onAlertRead = vi.fn();

    render(<AlertFeed alerts={alerts} variant="dropdown" onAlertRead={onAlertRead} />);

    fireEvent.click(screen.getByRole("button", { name: /marcar alerta como lido/i }));

    await waitFor(() => expect(markAlertRead).toHaveBeenCalledWith("alert-1"));
    await waitFor(() => expect(onAlertRead).not.toHaveBeenCalled());
    expect(screen.getByRole("button", { name: /marcar alerta como lido/i })).toBeTruthy();
  });

  it("collapses the local unread state when the action resolves as already read elsewhere without calling the fresh-read callback", async () => {
    markAlertRead.mockResolvedValueOnce({ success: true, alreadyRead: true });
    const onAlertRead = vi.fn();
    const listener = vi.fn();

    window.addEventListener(ALERT_READ_EVENT, listener as EventListener);

    render(<AlertFeed alerts={alerts} variant="dropdown" onAlertRead={onAlertRead} />);

    fireEvent.click(screen.getByRole("button", { name: /marcar alerta como lido/i }));

    await waitFor(() => expect(markAlertRead).toHaveBeenCalledWith("alert-1"));
    await waitFor(() => expect(listener).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onAlertRead).toHaveBeenCalledWith("alert-1"));

    const event = listener.mock.calls[0]?.[0] as CustomEvent<{
      id: string;
      countChanged: boolean;
    }>;
    expect(event.detail).toEqual({ id: "alert-1", countChanged: true });
    expect(screen.queryByRole("button", { name: /marcar alerta como lido/i })).toBeNull();

    window.removeEventListener(ALERT_READ_EVENT, listener as EventListener);
  });

  it("keeps the unread alert actionable when marking read rejects", async () => {
    markAlertRead.mockRejectedValueOnce(new Error("boom"));
    const onAlertRead = vi.fn();

    render(<AlertFeed alerts={alerts} variant="dropdown" onAlertRead={onAlertRead} />);

    fireEvent.click(screen.getByRole("button", { name: /marcar alerta como lido/i }));

    await waitFor(() => expect(markAlertRead).toHaveBeenCalledWith("alert-1"));
    await waitFor(() => expect(onAlertRead).not.toHaveBeenCalled());
    expect(screen.getByRole("button", { name: /marcar alerta como lido/i })).toBeTruthy();
  });

  it("renders the empty state", () => {
    render(<AlertFeed alerts={[]} variant="dropdown" />);

    expect(screen.getByText("Nenhum alerta encontrado.")).toBeTruthy();
  });
});
