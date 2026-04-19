import {
  buildUiPreferencesStorageKey,
  readStoredUiPreferences,
  writeStoredUiPreferences,
} from "../ui-preferences";
import {
  DEFAULT_MAP_BASE_LAYER,
  type MapBaseLayer,
  normalizeMapBaseLayer,
} from "./map-base-layer";

export type HistoryMapUiPreferences = {
  baseLayer: MapBaseLayer;
};

const HISTORY_MAP_UI_PREFERENCES_SCOPE = "history-map";
const HISTORY_MAP_UI_PREFERENCES_VERSION = "v1";
const HISTORY_MAP_UI_PREFERENCES_SHARED_USER_ID = "shared";

export const HISTORY_MAP_UI_PREFERENCES_DEFAULTS: HistoryMapUiPreferences = {
  baseLayer: DEFAULT_MAP_BASE_LAYER,
};

function createHistoryMapUiPreferencesDefaults(): HistoryMapUiPreferences {
  return { baseLayer: DEFAULT_MAP_BASE_LAYER };
}

export function normalizeHistoryMapUiPreferences(
  value: unknown
): HistoryMapUiPreferences {
  if (value === null || typeof value !== "object") {
    return createHistoryMapUiPreferencesDefaults();
  }

  const nextValue = value as Partial<
    Record<keyof HistoryMapUiPreferences, unknown>
  >;

  return {
    baseLayer: normalizeMapBaseLayer(nextValue.baseLayer),
  };
}

export function getHistoryMapUiPreferencesStorageKey(): string {
  return buildUiPreferencesStorageKey({
    scope: HISTORY_MAP_UI_PREFERENCES_SCOPE,
    userId: HISTORY_MAP_UI_PREFERENCES_SHARED_USER_ID,
    version: HISTORY_MAP_UI_PREFERENCES_VERSION,
  });
}

export function readHistoryMapUiPreferences(): HistoryMapUiPreferences {
  return readStoredUiPreferences({
    storageKey: getHistoryMapUiPreferencesStorageKey(),
    fallback: createHistoryMapUiPreferencesDefaults(),
    normalize: normalizeHistoryMapUiPreferences,
  });
}

export function writeHistoryMapUiPreferences(
  value: HistoryMapUiPreferences
): void {
  writeStoredUiPreferences({
    storageKey: getHistoryMapUiPreferencesStorageKey(),
    value,
  });
}
