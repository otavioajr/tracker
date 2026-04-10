import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DASHBOARD_MAP_UI_PREFERENCES_DEFAULTS,
  getDashboardMapUiPreferencesStorageKey,
  readDashboardMapUiPreferences,
  normalizeDashboardMapUiPreferences,
} from "./dashboard-map-preferences";

describe("dashboard-map-preferences", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds the dashboard map storage key", () => {
    expect(getDashboardMapUiPreferencesStorageKey("user-321")).toBe(
      "tracker:ui-preferences:v1:dashboard-map:user-321"
    );
  });

  it("returns defaults for null input", () => {
    expect(normalizeDashboardMapUiPreferences(null)).toEqual(
      DASHBOARD_MAP_UI_PREFERENCES_DEFAULTS
    );
  });

  it("falls back to defaults for invalid values", () => {
    expect(
      normalizeDashboardMapUiPreferences({
        searchQuery: 123,
        statusFilter: "flying",
        desktopRailOpen: "yes",
        activeTrailDeviceIds: "device-1",
      })
    ).toEqual({
      ...DASHBOARD_MAP_UI_PREFERENCES_DEFAULTS,
    });
  });

  it("keeps valid values and normalizes active trail ids", () => {
    expect(
      normalizeDashboardMapUiPreferences({
        searchQuery: "truck",
        statusFilter: "moving",
        desktopRailOpen: true,
        activeTrailDeviceIds: ["device-1", "device-2", "device-1", 3, null],
      })
    ).toEqual({
      searchQuery: "truck",
      statusFilter: "moving",
      desktopRailOpen: true,
      activeTrailDeviceIds: ["device-1", "device-2"],
    });
  });

  it("returns fresh defaults for later normalizations and fallback reads", () => {
    const first = normalizeDashboardMapUiPreferences(null);
    first.searchQuery = "mutated";
    first.activeTrailDeviceIds.push("device-1");

    vi.stubGlobal("window", {
      localStorage: {
        getItem() {
          return null;
        },
        setItem() {},
        removeItem() {},
        clear() {},
      },
    });

    expect(normalizeDashboardMapUiPreferences(null)).toEqual(
      DASHBOARD_MAP_UI_PREFERENCES_DEFAULTS
    );
    expect(readDashboardMapUiPreferences("user-321")).toEqual(
      DASHBOARD_MAP_UI_PREFERENCES_DEFAULTS
    );
  });
});
