// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

function TrackingMapStub({
  followedDeviceId,
  selectedDeviceId,
  trails,
  onCancelFollow,
  onSelect,
}: {
  followedDeviceId: string | null;
  selectedDeviceId: string | null;
  trails?: {
    deviceId: string;
    points: { latitude: number; longitude: number; server_time: string }[];
  }[];
  onCancelFollow: () => void;
  onSelect?: (deviceId: string) => void;
}) {
  return (
    <div data-testid="tracking-map-stub">
      <span>followed:{followedDeviceId ?? "none"}</span>
      <span>selected:{selectedDeviceId ?? "none"}</span>
      <span>trails:{trails?.map((trail) => trail.deviceId).join(",") || "none"}</span>
      <button type="button" onClick={() => onSelect?.("van-2")}>
        Marker Van 02
      </button>
      <button type="button" onClick={onCancelFollow}>
        Cancel follow
      </button>
    </div>
  );
}

vi.mock("next/dynamic", () => ({
  default: () => TrackingMapStub,
}));

vi.mock("@/lib/hooks/use-realtime-positions", () => ({
  useRealtimePositions: <T,>(positions: T[]) => positions,
}));

import { DashboardMap } from "./dashboard-map";

const positions = [
  {
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
    vehicle_model: "Cargo",
  },
  {
    device_id: "van-2",
    latitude: -23.55,
    longitude: -46.63,
    speed: 0,
    heading: 0,
    ignition: true,
    device_time: "2026-04-04T14:58:00.000Z",
    server_time: "2026-04-04T14:57:00.000Z",
    plate: "XYZ9K88",
    vehicle_name: "Van 02",
    vehicle_model: "Sprinter",
  },
];

describe("DashboardMap", () => {
  afterEach(() => {
    cleanup();
  });

  function getMobileSheet() {
    return document.querySelector("[data-state]") as HTMLElement | null;
  }

  async function clickVehicleFromBrowser(label: string) {
    const matches = await screen.findAllByRole("button", {
      name: new RegExp(`selecionar ${label}`, "i"),
    });

    fireEvent.click(matches[0]);
  }

  it("selects from the list and enters follow mode", async () => {
    render(<DashboardMap initialPositions={positions} />);

    await clickVehicleFromBrowser("Truck 01");

    expect(screen.getByText("Seguindo agora")).toBeTruthy();
    expect(await screen.findByText("followed:truck-1")).toBeTruthy();
    expect(await screen.findByText("selected:truck-1")).toBeTruthy();
    expect(getMobileSheet()?.dataset.state).toBe("collapsed");
  });

  it("keeps the selected vehicle when follow is cancelled and syncs marker selection", async () => {
    render(<DashboardMap initialPositions={positions} />);

    await clickVehicleFromBrowser("Truck 01");
    fireEvent.click(
      await screen.findByRole("button", { name: "Marker Van 02" })
    );

    expect(await screen.findByText("followed:van-2")).toBeTruthy();
    expect(await screen.findByText("selected:van-2")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Cancel follow" }));

    expect(screen.queryByText("Seguindo agora")).toBeNull();
    expect(await screen.findByText("followed:none")).toBeTruthy();
    expect(await screen.findByText("selected:van-2")).toBeTruthy();
  });

  it("starts collapsed on mobile and clears the last selection when fitting all vehicles", async () => {
    render(<DashboardMap initialPositions={positions} />);

    expect(getMobileSheet()?.dataset.state).toBe("collapsed");
    expect(screen.getByText("2 veículos")).toBeTruthy();

    await clickVehicleFromBrowser("Truck 01");

    expect(await screen.findByText("selected:truck-1")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Ver todos" }));

    expect(await screen.findByText("followed:none")).toBeTruthy();
    expect(await screen.findByText("selected:none")).toBeTruthy();
    expect(getMobileSheet()?.dataset.state).toBe("collapsed");
    expect(screen.getByText("2 veículos")).toBeTruthy();
  });

  it("passes active trails to the map and clears only the toggled vehicle", async () => {
    render(<DashboardMap initialPositions={positions} />);

    fireEvent.click(
      (
        await screen.findAllByRole("switch", {
          name: /mostrar rastro do Truck 01/i,
        })
      )[0]
    );

    expect(await screen.findByText("trails:truck-1")).toBeTruthy();

    fireEvent.click(
      (
        await screen.findAllByRole("switch", {
          name: /mostrar rastro do Truck 01/i,
        })
      )[0]
    );

    expect(await screen.findByText("trails:none")).toBeTruthy();
  });
});
