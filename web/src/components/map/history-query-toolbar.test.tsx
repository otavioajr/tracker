// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HistoryQueryToolbar } from "./history-query-toolbar";

describe("HistoryQueryToolbar", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the selected vehicle label as nome - placa", () => {
    render(
      <HistoryQueryToolbar
        vehicleId="vehicle-1"
        vehicles={[
          { id: "vehicle-1", label: "Caminhao 12 - ABC1D23" },
          { id: "vehicle-2", label: "XYZ9K88" },
        ]}
        startDate="2026-04-05T08:00"
        endDate="2026-04-05T09:00"
        loading={false}
        onVehicleChange={vi.fn()}
        onStartDateChange={vi.fn()}
        onEndDateChange={vi.fn()}
        onSearch={vi.fn()}
      />
    );

    expect(screen.getByRole("combobox").textContent).toContain(
      "Caminhao 12 - ABC1D23"
    );
  });
});
