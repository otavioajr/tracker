// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DashboardVehicleBrowser } from "./dashboard-vehicle-browser";
import type { DashboardVehicleFilter } from "@/lib/map/dashboard-map-utils";

const vehicles = [
  {
    device_id: "truck-1",
    displayLabel: "Truck 01",
    status: "moving" as const,
    lastSignalLabel: "agora",
    speedLabel: "42 km/h",
    secondaryLabel: "ABC1D23",
  },
  {
    device_id: "van-2",
    displayLabel: "Van 02",
    status: "stopped" as const,
    lastSignalLabel: "3 min",
    speedLabel: "0 km/h",
    secondaryLabel: "XYZ9K88",
  },
];

describe("DashboardVehicleBrowser", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders search, filters and vehicle rows", () => {
    render(
      <DashboardVehicleBrowser
        vehicles={vehicles}
        selectedDeviceId="truck-1"
        query=""
        statusFilter="all"
        summaryLabel="2 veículos visíveis"
        onQueryChange={vi.fn()}
        onStatusFilterChange={vi.fn()}
        onSelectVehicle={vi.fn()}
      />
    );

    expect(screen.getByPlaceholderText("Buscar veículo")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Todos" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Em movimento" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Parados" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sem sinal" })).toBeTruthy();
    expect(screen.getByText("Truck 01")).toBeTruthy();
    expect(screen.getByText("Van 02")).toBeTruthy();
    expect(screen.getByText("2 veículos visíveis")).toBeTruthy();
  });

  it("forwards search, filter and selection interactions", () => {
    const handleQueryChange = vi.fn();
    const handleStatusFilterChange = vi.fn<
      (filter: DashboardVehicleFilter) => void
    >();
    const handleSelectVehicle = vi.fn();

    render(
      <DashboardVehicleBrowser
        vehicles={vehicles}
        selectedDeviceId={null}
        query=""
        statusFilter="all"
        summaryLabel="2 veículos visíveis"
        onQueryChange={handleQueryChange}
        onStatusFilterChange={handleStatusFilterChange}
        onSelectVehicle={handleSelectVehicle}
      />
    );

    fireEvent.change(screen.getByPlaceholderText("Buscar veículo"), {
      target: { value: "truck" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Parados" }));
    fireEvent.click(screen.getByRole("button", { name: /selecionar Truck 01/i }));

    expect(handleQueryChange).toHaveBeenCalledWith("truck");
    expect(handleStatusFilterChange).toHaveBeenCalledWith("stopped");
    expect(handleSelectVehicle).toHaveBeenCalledWith("truck-1");
  });

  it("renders an empty state when there are no vehicles after filtering", () => {
    render(
      <DashboardVehicleBrowser
        vehicles={[]}
        selectedDeviceId={null}
        query="zzz"
        statusFilter="all"
        summaryLabel="0 veículos visíveis"
        onQueryChange={vi.fn()}
        onStatusFilterChange={vi.fn()}
        onSelectVehicle={vi.fn()}
      />
    );

    expect(screen.getByText("Nenhum veículo encontrado")).toBeTruthy();
    expect(screen.getByText("Ajuste a busca ou troque o filtro para continuar.")).toBeTruthy();
  });
});
