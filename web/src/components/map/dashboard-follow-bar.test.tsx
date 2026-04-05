// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DashboardFollowBar } from "./dashboard-follow-bar";

describe("DashboardFollowBar", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the followed vehicle summary and exit action", () => {
    const handleExitFollow = vi.fn();

    render(
      <DashboardFollowBar
        vehicle={{
          device_id: "truck-1",
          latitude: -23.5,
          longitude: -46.6,
          speed: 42,
          heading: 0,
          ignition: true,
          device_time: "2026-04-04T14:59:00.000Z",
          server_time: "2026-04-04T15:00:00.000Z",
          plate: "ABC1D23",
          vehicle_name: "Truck 01",
        }}
        status="moving"
        onExitFollow={handleExitFollow}
      />
    );

    expect(screen.getByText("Seguindo agora")).toBeTruthy();
    expect(screen.getByText("Truck 01")).toBeTruthy();
    expect(screen.getByText("42 km/h")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Sair do follow" }));

    expect(handleExitFollow).toHaveBeenCalledTimes(1);
  });
});
