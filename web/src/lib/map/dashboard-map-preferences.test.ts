import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DASHBOARD_MAP_UI_PREFERENCES_DEFAULTS,
  getDashboardMapUiPreferencesStorageKey,
  readDashboardMapUiPreferences,
  normalizeDashboardMapUiPreferences,
} from "./dashboard-map-preferences";

// Impede que futuras integrações voltem a omitir a chave pública nas duas camadas.
describe("CARTO authentication", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("encodes the build-time key for both styles and keeps attribution", async () => {
    vi.stubEnv("NEXT_PUBLIC_CARTO_API_KEY", " test+key&value ");
    vi.resetModules();
    const { CARTO_TILE_URLS, CARTO_ATTRIBUTION } = await import("./map-base-layer");
    for (const [style, url] of Object.entries(CARTO_TILE_URLS)) {
      expect(url).toBe(`https://{s}.basemaps.cartocdn.com/rastertiles/${style}_all/{z}/{x}/{y}{r}.png?key=test%2Bkey%26value`);
    }
    expect(CARTO_ATTRIBUTION).toContain("openstreetmap.org/copyright");
    expect(CARTO_ATTRIBUTION).toContain("carto.com/attributions");
  });
});

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
      baseLayer: "Ruas",
      showGeofences: true,
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

  describe("showGeofences preference", () => {
    it("default true quando ausente", () => {
      const result = normalizeDashboardMapUiPreferences({});
      expect(result.showGeofences).toBe(true);
    });

    it("preserva false explícito", () => {
      const result = normalizeDashboardMapUiPreferences({ showGeofences: false });
      expect(result.showGeofences).toBe(false);
    });

    it("ignora valor não booleano", () => {
      const result = normalizeDashboardMapUiPreferences({ showGeofences: "yes" });
      expect(result.showGeofences).toBe(true);
    });
  });
});
