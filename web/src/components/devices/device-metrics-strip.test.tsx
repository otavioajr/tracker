// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DeviceMetricsStrip } from "./device-metrics-strip";

describe("DeviceMetricsStrip", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders exactly the three approved operational metrics", () => {
    render(
      <DeviceMetricsStrip
        metrics={{ total: 24, pending: 4, active: 18, unassigned: 6 }}
      />,
    );

    expect(
      screen.getAllByText(/^(Pendentes|Ativos|Sem veículo)$/),
    ).toHaveLength(3);
    expect(screen.getByText("Pendentes")).toBeTruthy();
    expect(screen.getByText("Ativos")).toBeTruthy();
    expect(screen.getByText("Sem veículo")).toBeTruthy();
    expect(screen.queryByText("Total")).toBeNull();
  });
});
