import { describe, expect, it } from "vitest";

import { isDashboardMapRotationEnabled } from "./map-rotation-feature";

describe("isDashboardMapRotationEnabled", () => {
  it.each([undefined, "", "0", "false", "FALSE", "off", "no"])(
    "returns false for %p",
    (value) => {
      expect(isDashboardMapRotationEnabled(value)).toBe(false);
    }
  );

  it.each(["1", "true", "TRUE", "on", "yes", "YES"])(
    "returns true for %p",
    (value) => {
      expect(isDashboardMapRotationEnabled(value)).toBe(true);
    }
  );
});
