import { describe, expect, it } from "vitest";
import {
  buildHistoryHighlights,
  buildPlaybackTrailCoords,
  buildRouteCoords,
  buildHistorySummary,
  formatHistoryTimestamp,
  getHistorySearchState,
  getPlaybackIntervalMs,
  orderHistoryPositions,
} from "./history-player-utils";

const positions = [
  {
    device_id: "device-1",
    latitude: -23.55,
    longitude: -46.63,
    heading: 0,
    speed: 0,
    ignition: true,
    server_time: "2026-04-05T10:00:00.000Z",
  },
  {
    device_id: "device-1",
    latitude: -23.551,
    longitude: -46.631,
    heading: 90,
    speed: 42,
    ignition: true,
    server_time: "2026-04-05T10:05:00.000Z",
  },
  {
    device_id: "device-1",
    latitude: -23.551,
    longitude: -46.631,
    heading: 90,
    speed: 0,
    ignition: false,
    server_time: "2026-04-05T10:15:00.000Z",
  },
];

const routeWithStop = [
  {
    device_id: "device-2",
    latitude: -23.55,
    longitude: -46.63,
    heading: 0,
    speed: 18,
    ignition: true,
    server_time: "2026-04-05T10:00:00.000Z",
  },
  {
    device_id: "device-2",
    latitude: -23.551,
    longitude: -46.631,
    heading: 0,
    speed: 0,
    ignition: true,
    server_time: "2026-04-05T10:05:00.000Z",
  },
  {
    device_id: "device-2",
    latitude: -23.551,
    longitude: -46.631,
    heading: 0,
    speed: 0,
    ignition: false,
    server_time: "2026-04-05T10:11:00.000Z",
  },
  {
    device_id: "device-2",
    latitude: -23.552,
    longitude: -46.632,
    heading: 45,
    speed: 25,
    ignition: true,
    server_time: "2026-04-05T10:18:00.000Z",
  },
];

const sparseStopRoute = [
  {
    device_id: "device-3",
    latitude: -23.55,
    longitude: -46.63,
    heading: 0,
    speed: 35,
    ignition: true,
    server_time: "2026-04-05T10:00:00.000Z",
  },
  {
    device_id: "device-3",
    latitude: -23.551,
    longitude: -46.631,
    heading: 0,
    speed: 0,
    ignition: true,
    server_time: "2026-04-05T10:05:00.000Z",
  },
  {
    device_id: "device-3",
    latitude: -23.5512,
    longitude: -46.6312,
    heading: 0,
    speed: 0,
    ignition: true,
    server_time: "2026-04-05T10:09:00.000Z",
  },
  {
    device_id: "device-3",
    latitude: -23.552,
    longitude: -46.632,
    heading: 90,
    speed: 28,
    ignition: true,
    server_time: "2026-04-05T10:20:00.000Z",
  },
];

const stopBandJitterRoute = [
  {
    device_id: "device-4",
    latitude: -23.55,
    longitude: -46.63,
    heading: 0,
    speed: 0,
    ignition: false,
    server_time: "2026-04-05T10:00:00.000Z",
  },
  {
    device_id: "device-4",
    latitude: -23.5502,
    longitude: -46.6302,
    heading: 0,
    speed: 1,
    ignition: false,
    server_time: "2026-04-05T10:05:00.000Z",
  },
  {
    device_id: "device-4",
    latitude: -23.551,
    longitude: -46.631,
    heading: 45,
    speed: 26,
    ignition: true,
    server_time: "2026-04-05T10:10:00.000Z",
  },
] as const;

const unsortedRouteWithStop = [
  routeWithStop[3],
  routeWithStop[1],
  routeWithStop[0],
  routeWithStop[2],
] as const;

describe("history-player-utils", () => {
  it("builds the trip summary", () => {
    const summary = buildHistorySummary(positions);

    expect(summary.totalPoints).toBe(3);
    expect(summary.maxSpeedKmh).toBe(42);
    expect(summary.totalDurationMinutes).toBe(15);
    expect(summary.movingMinutes).toBe(10);
    expect(summary.stoppedMinutes).toBe(5);
    expect(summary.totalDistanceKm).toBeCloseTo(0.1508466474, 6);
  });

  it("extracts stop highlights from stationary frames", () => {
    const highlights = buildHistoryHighlights(routeWithStop);

    expect(highlights).toEqual([
      {
        kind: "milestone",
        index: 0,
        label: "Start",
        timestamp: "2026-04-05T10:00:00.000Z",
        latitude: -23.55,
        longitude: -46.63,
      },
      {
        kind: "stop",
        index: 1,
        label: "Stop 1",
        timestamp: "2026-04-05T10:05:00.000Z",
        latitude: -23.551,
        longitude: -46.631,
      },
      {
        kind: "milestone",
        index: 3,
        label: "End",
        timestamp: "2026-04-05T10:18:00.000Z",
        latitude: -23.552,
        longitude: -46.632,
      },
    ]);
  });

  it("counts sparse stops until the moving resume frame closes the window", () => {
    const highlights = buildHistoryHighlights(sparseStopRoute);

    expect(highlights).toContainEqual({
      kind: "stop",
      index: 1,
      label: "Stop 1",
      timestamp: "2026-04-05T10:05:00.000Z",
      latitude: -23.551,
      longitude: -46.631,
    });
  });

  it("does not add stop-band jitter to total trip distance", () => {
    const summary = buildHistorySummary(stopBandJitterRoute);

    expect(summary.totalPoints).toBe(3);
    expect(summary.stoppedMinutes).toBe(10);
    expect(summary.movingMinutes).toBe(0);
    expect(summary.totalDistanceKm).toBeCloseTo(0.120677276, 6);
  });

  it("preserves original highlight indexes even when input order is unsorted", () => {
    const highlights = buildHistoryHighlights(unsortedRouteWithStop);

    expect(highlights).toEqual([
      {
        kind: "milestone",
        index: 2,
        label: "Start",
        timestamp: "2026-04-05T10:00:00.000Z",
        latitude: -23.55,
        longitude: -46.63,
      },
      {
        kind: "stop",
        index: 1,
        label: "Stop 1",
        timestamp: "2026-04-05T10:05:00.000Z",
        latitude: -23.551,
        longitude: -46.631,
      },
      {
        kind: "milestone",
        index: 0,
        label: "End",
        timestamp: "2026-04-05T10:18:00.000Z",
        latitude: -23.552,
        longitude: -46.632,
      },
    ]);
  });

  it("separates the full route from the current playback trail", () => {
    expect(buildRouteCoords(routeWithStop)).toEqual([
      [-23.55, -46.63],
      [-23.551, -46.631],
      [-23.551, -46.631],
      [-23.552, -46.632],
    ]);

    expect(buildPlaybackTrailCoords(routeWithStop, 0)).toEqual([[-23.55, -46.63]]);
    expect(buildPlaybackTrailCoords(routeWithStop, 2)).toEqual([
      [-23.55, -46.63],
      [-23.551, -46.631],
      [-23.551, -46.631],
    ]);
  });

  it("normalizes unsorted history once for route, playback, and highlight navigation", () => {
    const orderedPositions = orderHistoryPositions(unsortedRouteWithStop);

    expect(orderedPositions.map((position) => position.server_time)).toEqual([
      "2026-04-05T10:00:00.000Z",
      "2026-04-05T10:05:00.000Z",
      "2026-04-05T10:11:00.000Z",
      "2026-04-05T10:18:00.000Z",
    ]);

    expect(buildRouteCoords(orderedPositions)).toEqual([
      [-23.55, -46.63],
      [-23.551, -46.631],
      [-23.551, -46.631],
      [-23.552, -46.632],
    ]);

    expect(buildPlaybackTrailCoords(orderedPositions, 2)).toEqual([
      [-23.55, -46.63],
      [-23.551, -46.631],
      [-23.551, -46.631],
    ]);

    expect(buildHistoryHighlights(orderedPositions)).toEqual([
      {
        kind: "milestone",
        index: 0,
        label: "Start",
        timestamp: "2026-04-05T10:00:00.000Z",
        latitude: -23.55,
        longitude: -46.63,
      },
      {
        kind: "stop",
        index: 1,
        label: "Stop 1",
        timestamp: "2026-04-05T10:05:00.000Z",
        latitude: -23.551,
        longitude: -46.631,
      },
      {
        kind: "milestone",
        index: 3,
        label: "End",
        timestamp: "2026-04-05T10:18:00.000Z",
        latitude: -23.552,
        longitude: -46.632,
      },
    ]);
  });

  it("maps all playback speed presets to fixed intervals", () => {
    expect({
      "1x": getPlaybackIntervalMs("1x"),
      "2x": getPlaybackIntervalMs("2x"),
      "4x": getPlaybackIntervalMs("4x"),
      "8x": getPlaybackIntervalMs("8x"),
    }).toEqual({
      "1x": 800,
      "2x": 400,
      "4x": 200,
      "8x": 100,
    });
  });

  it("returns safe empty-state values", () => {
    expect(buildHistorySummary([])).toEqual({
      totalPoints: 0,
      totalDistanceKm: 0,
      maxSpeedKmh: 0,
      movingMinutes: 0,
      stoppedMinutes: 0,
      totalDurationMinutes: 0,
    });
    expect(buildHistoryHighlights([])).toEqual([]);
  });

  it("distinguishes failed searches from empty successful results", () => {
    expect(
      getHistorySearchState({
        hasSearched: true,
        loading: false,
        hasResults: false,
        error: "Erro ao buscar histórico",
      })
    ).toEqual({
      beforeSearch: false,
      noResults: false,
      searchFailed: true,
    });

    expect(
      getHistorySearchState({
        hasSearched: true,
        loading: false,
        hasResults: false,
        error: "",
      })
    ).toEqual({
      beforeSearch: false,
      noResults: true,
      searchFailed: false,
    });
  });

  it("formats timestamps in pt-BR with a stable local output", () => {
    expect(formatHistoryTimestamp("2026-04-05T10:00:00.000Z")).toBe(
      "05/04/2026, 07:00"
    );
  });
});
