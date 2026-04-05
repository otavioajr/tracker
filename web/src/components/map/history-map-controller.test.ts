import { describe, expect, it, vi } from "vitest";

vi.mock("react-leaflet", () => ({
  useMap: () => null,
}));

import {
  getHistoryCenterAction,
  getHistoryFitAction,
} from "./history-map-controller";

describe("history-map-controller", () => {
  it("resets internal refs when the route is cleared", () => {
    expect(
      getHistoryFitAction({
        center: null,
        bounds: null,
        fitVersion: 3,
        lastFitVersion: 2,
      })
    ).toEqual({ type: "reset" });
  });

  it("fits the full bounds when a new multi-point route is loaded", () => {
    const bounds: [[number, number], [number, number]] = [
      [-23.56, -46.64],
      [-23.54, -46.62],
    ];

    expect(
      getHistoryFitAction({
        center: [-23.55, -46.63],
        bounds,
        fitVersion: 2,
        lastFitVersion: 1,
      })
    ).toEqual({ type: "fit-bounds", bounds });
  });

  it("falls back to the initial zoom when bounds collapse to one point", () => {
    const center: [number, number] = [-23.55, -46.63];
    const bounds: [[number, number], [number, number]] = [center, center];

    expect(
      getHistoryFitAction({
        center,
        bounds,
        fitVersion: 1,
        lastFitVersion: 0,
      })
    ).toEqual({ type: "set-initial-view", center });
  });

  it("keeps recentering playback frames without forcing the initial zoom", () => {
    expect(
      getHistoryCenterAction({
        center: [-23.551, -46.631],
        lastCenteredPoint: "-23.55:-46.63",
      })
    ).toEqual({
      type: "set-current-view",
      center: [-23.551, -46.631],
    });
  });

  it("does not recenter when the playback frame has not changed", () => {
    expect(
      getHistoryCenterAction({
        center: [-23.55, -46.63],
        lastCenteredPoint: "-23.55:-46.63",
      })
    ).toEqual({ type: "none" });
  });
});
