// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DeviceMetricsStrip } from "./device-metrics-strip";

describe("DeviceMetricsStrip", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the three approved operational metrics", () => {
    render(
      <DeviceMetricsStrip
        metrics={{ total: 24, pending: 4, active: 18, unassigned: 6 }}
      />,
    );

    expect(screen.getByText("Pendentes")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.getByText("Ativos")).toBeTruthy();
    expect(screen.getByText("18")).toBeTruthy();
    expect(screen.getByText("Sem veículo")).toBeTruthy();
    expect(screen.getByText("6")).toBeTruthy();
  });
});
