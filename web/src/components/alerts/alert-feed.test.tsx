// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AlertFeed } from "./alert-feed";

const markAlertRead = vi.hoisted(() => vi.fn());

vi.mock("@/lib/actions/alerts", () => ({
  markAlertRead,
}));

const alerts = [
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
] as const;

afterEach(() => {
  cleanup();
  markAlertRead.mockReset();
});

describe("AlertFeed", () => {
  it("marks an unread alert as read in dropdown mode and updates locally", async () => {
    markAlertRead.mockResolvedValueOnce(undefined);
    const onAlertRead = vi.fn();

    render(<AlertFeed alerts={alerts as unknown as typeof alerts} variant="dropdown" onAlertRead={onAlertRead} />);

    const markButton = screen.getByRole("button", { name: /marcar alerta como lido/i });
    fireEvent.click(markButton);

    await waitFor(() => expect(markAlertRead).toHaveBeenCalledWith("alert-1"));
    await waitFor(() => expect(onAlertRead).toHaveBeenCalledWith("alert-1"));
    expect(screen.queryByRole("button", { name: /marcar alerta como lido/i })).toBeNull();
  });

  it("keeps the unread alert actionable when marking read fails", async () => {
    markAlertRead.mockRejectedValueOnce(new Error("boom"));
    const onAlertRead = vi.fn();

    render(<AlertFeed alerts={alerts as unknown as typeof alerts} variant="dropdown" onAlertRead={onAlertRead} />);

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
