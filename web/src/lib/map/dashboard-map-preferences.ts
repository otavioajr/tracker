import type { DashboardVehicleFilter } from "./dashboard-map-utils";
import {
  DEFAULT_MAP_BASE_LAYER,
  type MapBaseLayer,
  normalizeMapBaseLayer,
} from "./map-base-layer";

import {
  buildUiPreferencesStorageKey,
  readStoredUiPreferences,
  writeStoredUiPreferences,
} from "../ui-preferences";

export type DashboardMapUiPreferences = {
  searchQuery: string;
  statusFilter: DashboardVehicleFilter;
  desktopRailOpen: boolean;
  activeTrailDeviceIds: string[];
  baseLayer: MapBaseLayer;
};

const DASHBOARD_MAP_UI_PREFERENCES_SCOPE = "dashboard-map";
const DASHBOARD_MAP_UI_PREFERENCES_VERSION = "v1";

export const DASHBOARD_MAP_UI_PREFERENCES_DEFAULTS: DashboardMapUiPreferences = {
  searchQuery: "",
  statusFilter: "all",
  desktopRailOpen: true,
  activeTrailDeviceIds: [],
  baseLayer: DEFAULT_MAP_BASE_LAYER,
};

function createDashboardMapUiPreferencesDefaults(): DashboardMapUiPreferences {
  return {
    searchQuery: "",
    statusFilter: "all",
    desktopRailOpen: true,
    activeTrailDeviceIds: [],
    baseLayer: DEFAULT_MAP_BASE_LAYER,
  };
}

function isDashboardVehicleFilter(
  value: unknown
): value is DashboardVehicleFilter {
  return (
    value === "all" ||
    value === "moving" ||
    value === "stopped" ||
    value === "offline"
  );
}

function normalizeTrailDeviceIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const nextDeviceIds: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (typeof item !== "string" || seen.has(item)) {
      continue;
    }

    seen.add(item);
    nextDeviceIds.push(item);
  }

  return nextDeviceIds;
}

export function normalizeDashboardMapUiPreferences(
  value: unknown
): DashboardMapUiPreferences {
  if (value === null || typeof value !== "object") {
    return createDashboardMapUiPreferencesDefaults();
  }

  const nextValue = value as Partial<Record<keyof DashboardMapUiPreferences, unknown>>;

  return {
    searchQuery:
      typeof nextValue.searchQuery === "string"
        ? nextValue.searchQuery
        : "",
    statusFilter: isDashboardVehicleFilter(nextValue.statusFilter)
      ? nextValue.statusFilter
      : "all",
    desktopRailOpen:
      typeof nextValue.desktopRailOpen === "boolean"
        ? nextValue.desktopRailOpen
        : true,
    activeTrailDeviceIds: normalizeTrailDeviceIds(nextValue.activeTrailDeviceIds),
    baseLayer: normalizeMapBaseLayer(nextValue.baseLayer),
  };
}

export function getDashboardMapUiPreferencesStorageKey(userId: string): string {
  return buildUiPreferencesStorageKey({
    scope: DASHBOARD_MAP_UI_PREFERENCES_SCOPE,
    userId,
    version: DASHBOARD_MAP_UI_PREFERENCES_VERSION,
  });
}

export function readDashboardMapUiPreferences(
  userId: string
): DashboardMapUiPreferences {
  return readStoredUiPreferences({
    storageKey: getDashboardMapUiPreferencesStorageKey(userId),
    fallback: createDashboardMapUiPreferencesDefaults(),
    normalize: normalizeDashboardMapUiPreferences,
  });
}

export function writeDashboardMapUiPreferences(
  userId: string,
  value: DashboardMapUiPreferences
): void {
  writeStoredUiPreferences({
    storageKey: getDashboardMapUiPreferencesStorageKey(userId),
    value,
  });
}
