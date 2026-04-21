// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getDashboardMapUiPreferencesStorageKey } from "@/lib/map/dashboard-map-preferences";

const { mockUseRealtimePositions } = vi.hoisted(() => ({
  mockUseRealtimePositions: vi.fn(),
}));

function TrackingMapStub({
  followedDeviceId,
  selectedDeviceId,
  trails,
  onCancelFollow,
  onSelect,
  onBearingChange,
  resetRotationTrigger,
  rotationEnabled,
}: {
  followedDeviceId: string | null;
  selectedDeviceId: string | null;
  trails?: {
    deviceId: string;
    points: { latitude: number; longitude: number; server_time: string }[];
  }[];
  onCancelFollow: () => void;
  onSelect?: (deviceId: string) => void;
  onBearingChange?: (bearing: number) => void;
  resetRotationTrigger?: number;
  rotationEnabled?: boolean;
}) {
  return (
    <div data-testid="tracking-map-stub">
      <span>followed:{followedDeviceId ?? "none"}</span>
      <span>selected:{selectedDeviceId ?? "none"}</span>
      <span>rotation-enabled:{rotationEnabled ? "yes" : "no"}</span>
      <span>reset-rotation:{resetRotationTrigger ?? 0}</span>
      <span>trails:{trails?.map((trail) => trail.deviceId).join(",") || "none"}</span>
      <span>
        trail-points:
        {trails?.map((trail) => `${trail.deviceId}:${trail.points.length}`).join(",") ||
          "none"}
      </span>
      <button type="button" onClick={() => onSelect?.("van-2")}>
        Marker Van 02
      </button>
      <button type="button" onClick={() => onBearingChange?.(90)}>
        Report bearing 90
      </button>
      <button type="button" onClick={() => onBearingChange?.(0)}>
        Report bearing 0
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
  useRealtimePositions: (positions: unknown[]) => mockUseRealtimePositions(positions),
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

const newerPositions = [
  {
    ...positions[0],
    latitude: -23.5008,
    longitude: -46.6008,
    server_time: "2026-04-04T15:06:00.000Z",
  },
  positions[1],
];

const USER_ID = "user-1";
const STORAGE_KEY = getDashboardMapUiPreferencesStorageKey(USER_ID);

function createLocalStorageMock() {
  const store = new Map<string, string>();

  return {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

describe("DashboardMap", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-04-04T15:05:00.000Z"));
    Object.defineProperty(window, "localStorage", {
      value: createLocalStorageMock(),
      configurable: true,
      writable: true,
    });
    mockUseRealtimePositions.mockImplementation((incoming: typeof positions) =>
      incoming.map((position) => ({ ...position }))
    );
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.useRealTimers();
    mockUseRealtimePositions.mockReset();
    vi.unstubAllGlobals();
  });

  function renderDashboardMap(initialPositions = positions) {
    return render(
      <DashboardMap
        initialPositions={initialPositions}
        initialGeofences={[]}
        userId={USER_ID}
      />
    );
  }

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
    renderDashboardMap();

    await clickVehicleFromBrowser("Truck 01");

    expect(screen.getByText("Seguindo agora")).toBeTruthy();
    expect(await screen.findByText("followed:truck-1")).toBeTruthy();
    expect(await screen.findByText("selected:truck-1")).toBeTruthy();
    expect(getMobileSheet()?.dataset.state).toBe("collapsed");
  });

  it("keeps the selected vehicle when follow is cancelled and syncs marker selection", async () => {
    renderDashboardMap();

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
    renderDashboardMap();

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
    renderDashboardMap();

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

  it("hydrates saved preferences while keeping the mobile sheet collapsed and trail points ephemeral", async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        searchQuery: "truck",
        statusFilter: "moving",
        desktopRailOpen: false,
        activeTrailDeviceIds: ["truck-1"],
      })
    );

    const view = renderDashboardMap();

    expect(getMobileSheet()?.dataset.state).toBe("collapsed");
    expect(await screen.findByRole("button", { name: "Abrir painel do mapa" })).toBeTruthy();
    expect(await screen.findByText("trails:truck-1")).toBeTruthy();
    expect(await screen.findByText("trail-points:truck-1:0")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: /Expandir lista de veículos/i })
    );

    const searchInput = (await screen.findByPlaceholderText(
      "Buscar veículo"
    )) as HTMLInputElement;

    expect(searchInput.value).toBe("truck");
    expect(screen.queryByRole("button", { name: /Selecionar Van 02/i })).toBeNull();

    fireEvent.change(searchInput, { target: { value: "" } });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Selecionar Truck 01/i })).toBeTruthy();
      expect(screen.queryByRole("button", { name: /Selecionar Van 02/i })).toBeNull();
      expect(screen.getByText("trail-points:truck-1:0")).toBeTruthy();
    });

    view.rerender(
      <DashboardMap
        initialPositions={positions}
        initialGeofences={[]}
        userId={USER_ID}
      />
    );

    expect(await screen.findByText("trail-points:truck-1:0")).toBeTruthy();

    view.rerender(
      <DashboardMap
        initialPositions={newerPositions}
        initialGeofences={[]}
        userId={USER_ID}
      />
    );

    expect(await screen.findByText("trail-points:truck-1:1")).toBeTruthy();
  });

  it("persists search, filter, desktop rail state, and active trails under the user storage key", async () => {
    renderDashboardMap();

    fireEvent.click(
      (
        await screen.findAllByRole("switch", {
          name: /mostrar rastro do Truck 01/i,
        })
      )[0]
    );
    fireEvent.change(screen.getByPlaceholderText("Buscar veículo"), {
      target: { value: "truck" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Em movimento" }));
    fireEvent.click(screen.getByRole("button", { name: "Recolher painel do mapa" }));

    await waitFor(() => {
      expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null")).toEqual({
        searchQuery: "truck",
        statusFilter: "moving",
        desktopRailOpen: false,
        activeTrailDeviceIds: ["truck-1"],
        baseLayer: "Ruas",
        showGeofences: true,
      });
    });
  });

  it("keeps rotation disabled when the feature flag is off", async () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLE_MAP_ROTATION", "0");
    renderDashboardMap();
    expect(await screen.findByText("rotation-enabled:no")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /resetar norte/i })).toBeNull();
  });

  it("shows the reset-to-north button only after the map reports a non-zero bearing", async () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLE_MAP_ROTATION", "1");
    renderDashboardMap();

    expect(await screen.findByText("rotation-enabled:yes")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /resetar norte/i })).toBeNull();

    fireEvent.click(await screen.findByRole("button", { name: "Report bearing 90" }));
    expect(await screen.findByRole("button", { name: /resetar norte/i })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /resetar norte/i }));
    expect(await screen.findByText("reset-rotation:1")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Report bearing 0" }));
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /resetar norte/i })).toBeNull();
    });
  });
});
