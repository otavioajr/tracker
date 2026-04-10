import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildUiPreferencesStorageKey,
  readStoredUiPreferences,
  writeStoredUiPreferences,
} from "./ui-preferences";

function createLocalStorageMock() {
  const store = new Map<string, string>();

  return {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

describe("ui-preferences", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds the UI preferences storage key", () => {
    expect(
      buildUiPreferencesStorageKey({
        scope: "dashboard-map",
        userId: "user-123",
        version: "v1",
      })
    ).toBe("tracker:ui-preferences:v1:dashboard-map:user-123");
  });

  it("returns the fallback for empty storage and invalid JSON", () => {
    const localStorage = createLocalStorageMock();

    vi.stubGlobal("window", { localStorage });

    expect(
      readStoredUiPreferences({
        storageKey: "tracker:ui-preferences:v1:dashboard-map:user-123",
        fallback: { zoom: 12 },
        normalize: (value) => value,
      })
    ).toEqual({ zoom: 12 });

    localStorage.setItem(
      "tracker:ui-preferences:v1:dashboard-map:user-123",
      "{not-json"
    );

    expect(
      readStoredUiPreferences({
        storageKey: "tracker:ui-preferences:v1:dashboard-map:user-123",
        fallback: { zoom: 12 },
        normalize: (value) => value,
      })
    ).toEqual({ zoom: 12 });
  });

  it("returns the fallback when localStorage access or getItem throws", () => {
    vi.stubGlobal("window", {
      get localStorage() {
        throw new Error("storage unavailable");
      },
    });

    expect(
      readStoredUiPreferences({
        storageKey: "tracker:ui-preferences:v1:dashboard-map:user-123",
        fallback: { zoom: 12 },
        normalize: (value) => value,
      })
    ).toEqual({ zoom: 12 });

    const throwingStorage = {
      getItem() {
        throw new Error("getItem failed");
      },
    };

    vi.stubGlobal("window", { localStorage: throwingStorage });

    expect(
      readStoredUiPreferences({
        storageKey: "tracker:ui-preferences:v1:dashboard-map:user-123",
        fallback: { zoom: 12 },
        normalize: (value) => value,
      })
    ).toEqual({ zoom: 12 });
  });

  it("writes values that are then read back through normalize", () => {
    const localStorage = createLocalStorageMock();

    vi.stubGlobal("window", { localStorage });

    writeStoredUiPreferences({
      storageKey: "tracker:ui-preferences:v1:dashboard-map:user-123",
      value: {
        density: "comfortable",
        followVehicle: true,
      },
    });

    expect(
      localStorage.getItem("tracker:ui-preferences:v1:dashboard-map:user-123")
    ).toBe(
      JSON.stringify({
        density: "comfortable",
        followVehicle: true,
      })
    );

    expect(
      readStoredUiPreferences({
        storageKey: "tracker:ui-preferences:v1:dashboard-map:user-123",
        fallback: {
          density: "compact",
          followVehicle: false,
        },
        normalize: (value) => ({
          density:
            typeof value === "object" &&
            value !== null &&
            "density" in value &&
            value.density === "comfortable"
              ? "comfortable"
              : "compact",
          followVehicle:
            typeof value === "object" &&
            value !== null &&
            "followVehicle" in value
              ? Boolean(value.followVehicle)
              : false,
        }),
      })
    ).toEqual({
      density: "comfortable",
      followVehicle: true,
    });
  });

  it("does not throw when stringify or setItem fails", () => {
    const throwingSetItemStorage = {
      setItem() {
        throw new Error("setItem failed");
      },
    };

    vi.stubGlobal("window", { localStorage: throwingSetItemStorage });

    expect(() => {
      writeStoredUiPreferences({
        storageKey: "tracker:ui-preferences:v1:dashboard-map:user-123",
        value: { circular: true },
      });
    }).not.toThrow();

    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    expect(() => {
      writeStoredUiPreferences({
        storageKey: "tracker:ui-preferences:v1:dashboard-map:user-123",
        value: cyclic,
      });
    }).not.toThrow();
  });
});
