// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { HistorySelectedPointCard } from "./history-selected-point-card";

describe("HistorySelectedPointCard", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the selected point telemetry below the map", () => {
    render(
      <HistorySelectedPointCard
        currentPosition={{
          device_id: "device-1",
          latitude: -23.55,
          longitude: -46.63,
          heading: 180,
          speed: 42,
          ignition: true,
          server_time: "2026-04-05T10:00:00.000Z",
        }}
        loading={false}
        hasSearched={true}
        searchFailed={false}
      />
    );

    expect(screen.getByText("Ponto selecionado")).toBeTruthy();
    expect(screen.getByText("42 km/h")).toBeTruthy();
    expect(screen.getByText("Ligada")).toBeTruthy();
  });
});
