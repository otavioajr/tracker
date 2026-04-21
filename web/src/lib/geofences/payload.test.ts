import { describe, it, expect } from "vitest";
import { buildGeofenceInsertPayload, normalizeMetaInput } from "./payload";

describe("buildGeofenceInsertPayload", () => {
  const tenantId = "00000000-0000-0000-0000-000000000001";

  it("polygon: grava area e deixa center/radius null", () => {
    const payload = buildGeofenceInsertPayload({
      tenantId,
      input: {
        name: "Garagem",
        type: "inclusion",
        active: true,
        shape: {
          kind: "polygon",
          coordinates: [
            [-46.63, -23.55],
            [-46.62, -23.55],
            [-46.62, -23.54],
            [-46.63, -23.55],
          ],
        },
      },
    });
    expect(payload).toEqual({
      tenant_id: tenantId,
      name: "Garagem",
      type: "inclusion",
      active: true,
      shape_type: "polygon",
      area: "POLYGON((-46.63 -23.55, -46.62 -23.55, -46.62 -23.54, -46.63 -23.55))",
      center: null,
      radius_m: null,
    });
  });

  it("rectangle: mesma estrutura com shape_type='rectangle'", () => {
    const payload = buildGeofenceInsertPayload({
      tenantId,
      input: {
        name: "Pátio",
        type: "exclusion",
        active: false,
        shape: {
          kind: "rectangle",
          coordinates: [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0],
          ],
        },
      },
    });
    expect(payload.shape_type).toBe("rectangle");
    expect(payload.area).toBe("POLYGON((0 0, 1 0, 1 1, 0 1, 0 0))");
    expect(payload.center).toBeNull();
    expect(payload.radius_m).toBeNull();
  });

  it("circle: grava area (polígono), center WKT e radius_m", () => {
    const payload = buildGeofenceInsertPayload({
      tenantId,
      input: {
        name: "Raio 1km",
        type: "inclusion",
        active: true,
        shape: {
          kind: "circle",
          center: [-46.63, -23.55],
          radiusM: 1000,
          polygon: [
            [-46.62, -23.55],
            [-46.63, -23.54],
            [-46.64, -23.55],
            [-46.63, -23.56],
            [-46.62, -23.55],
          ],
        },
      },
    });
    expect(payload.shape_type).toBe("circle");
    expect(payload.center).toBe("POINT(-46.63 -23.55)");
    expect(payload.radius_m).toBe(1000);
    expect(payload.area.startsWith("POLYGON((")).toBe(true);
  });

  it("normalizeMetaInput: trim name e aceita apenas campos suportados", () => {
    expect(normalizeMetaInput({ name: "  A  ", type: "inclusion", active: true })).toEqual({
      name: "A",
      type: "inclusion",
      active: true,
    });
  });

  it("rejeita nome vazio", () => {
    expect(() =>
      buildGeofenceInsertPayload({
        tenantId,
        input: {
          name: "   ",
          type: "inclusion",
          active: true,
          shape: { kind: "polygon", coordinates: [[0, 0], [1, 0], [1, 1], [0, 0]] },
        },
      })
    ).toThrow(/Nome/);
  });

  it("rejeita nome >100 chars", () => {
    const longName = "a".repeat(101);
    expect(() =>
      buildGeofenceInsertPayload({
        tenantId,
        input: {
          name: longName,
          type: "inclusion",
          active: true,
          shape: { kind: "polygon", coordinates: [[0, 0], [1, 0], [1, 1], [0, 0]] },
        },
      })
    ).toThrow(/100/);
  });
});
