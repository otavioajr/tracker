export type UiPreferencesStorageKeyArgs = {
  scope: string;
  userId: string;
  version: string;
};

export type ReadStoredUiPreferencesArgs<TFallback> = {
  storageKey: string;
  fallback: TFallback;
  normalize: (value: unknown) => TFallback;
};

export type WriteStoredUiPreferencesArgs<TValue> = {
  storageKey: string;
  value: TValue;
};

const UI_PREFERENCES_PREFIX = "tracker:ui-preferences";

function getUiPreferencesStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

export function buildUiPreferencesStorageKey({
  scope,
  userId,
  version,
}: UiPreferencesStorageKeyArgs): string {
  return `${UI_PREFERENCES_PREFIX}:${version}:${scope}:${userId}`;
}

export function readStoredUiPreferences<TFallback>({
  storageKey,
  fallback,
  normalize,
}: ReadStoredUiPreferencesArgs<TFallback>): TFallback {
  const storage = getUiPreferencesStorage();
  if (!storage) {
    return fallback;
  }

  let rawValue: string | null;
  try {
    rawValue = storage.getItem(storageKey);
  } catch {
    return fallback;
  }

  if (!rawValue) {
    return fallback;
  }

  try {
    return normalize(JSON.parse(rawValue) as unknown);
  } catch {
    return fallback;
  }
}

export function writeStoredUiPreferences<TValue>({
  storageKey,
  value,
}: WriteStoredUiPreferencesArgs<TValue>): void {
  const storage = getUiPreferencesStorage();
  if (!storage) {
    return;
  }

  let serializedValue: string | undefined;
  try {
    serializedValue = JSON.stringify(value);
  } catch {
    return;
  }

  if (serializedValue === undefined) {
    return;
  }

  try {
    storage.setItem(storageKey, serializedValue);
  } catch {
    // Ignore storage write failures in non-critical UI preference persistence.
  }
}
