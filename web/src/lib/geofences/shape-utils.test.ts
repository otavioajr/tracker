import { describe, it, expect } from "vitest";
import {
  circleToPolygon,
  validatePolygonCoords,
  validateRadiusMeters,
  polygonToWkt,
  pointToWkt,
  isClosedRing,
} from "./shape-utils";

describe("shape-utils", () => {
  describe("circleToPolygon", () => {
    it("gera anel fechado com 65 pontos por default (64 lados + fechamento)", () => {
      const poly = circleToPolygon({ center: [-46.63, -23.55], radiusM: 500 });
      expect(poly).toHaveLength(65);
      expect(poly[0]).toEqual(poly[64]);
    });

    it("respeita o parâmetro steps", () => {
      const poly = circleToPolygon({ center: [-46.63, -23.55], radiusM: 500, steps: 32 });
      expect(poly).toHaveLength(33);
    });

    it("produz raio aproximado correto em metros (tolerância 5%)", () => {
      const poly = circleToPolygon({ center: [0, 0], radiusM: 1000 });
      const [lng, lat] = poly[0];
      const distanceMeters = Math.sqrt(
        Math.pow(lng * 111320 * Math.cos(0), 2) + Math.pow(lat * 111320, 2)
      );
      expect(distanceMeters).toBeGreaterThan(950);
      expect(distanceMeters).toBeLessThan(1050);
    });
  });

  describe("isClosedRing", () => {
    it("true quando primeiro igual ao último", () => {
      expect(isClosedRing([[0, 0], [1, 0], [1, 1], [0, 0]])).toBe(true);
    });

    it("false quando não fechado", () => {
      expect(isClosedRing([[0, 0], [1, 0], [1, 1]])).toBe(false);
    });
  });

  describe("validatePolygonCoords", () => {
    it("aceita polígono válido fechado", () => {
      expect(
        validatePolygonCoords([[0, 0], [1, 0], [1, 1], [0, 0]])
      ).toEqual({ ok: true });
    });

    it("rejeita menos de 4 pontos (3 distintos + fechamento)", () => {
      expect(
        validatePolygonCoords([[0, 0], [1, 0], [0, 0]])
      ).toEqual({ ok: false, error: "Polígono precisa de pelo menos 3 vértices distintos." });
    });

    it("rejeita polígono não fechado", () => {
      expect(
        validatePolygonCoords([[0, 0], [1, 0], [1, 1], [0, 1]])
      ).toEqual({ ok: false, error: "Polígono precisa estar fechado (primeiro e último ponto iguais)." });
    });

    it("rejeita coordenadas fora do range", () => {
      expect(
        validatePolygonCoords([[200, 0], [201, 0], [201, 1], [200, 0]])
      ).toEqual({ ok: false, error: "Coordenadas fora do intervalo válido." });
    });
  });

  describe("validateRadiusMeters", () => {
    it("aceita raio positivo dentro do limite", () => {
      expect(validateRadiusMeters(500)).toEqual({ ok: true });
    });

    it("rejeita raio zero", () => {
      expect(validateRadiusMeters(0)).toEqual({
        ok: false,
        error: "Raio precisa ser maior que zero.",
      });
    });

    it("rejeita raio negativo", () => {
      expect(validateRadiusMeters(-10)).toEqual({
        ok: false,
        error: "Raio precisa ser maior que zero.",
      });
    });

    it("rejeita raio acima de 100km", () => {
      expect(validateRadiusMeters(100001)).toEqual({
        ok: false,
        error: "Raio máximo é 100000 metros.",
      });
    });
  });

  describe("polygonToWkt", () => {
    it("gera WKT POLYGON válido", () => {
      const wkt = polygonToWkt([[-46.63, -23.55], [-46.62, -23.55], [-46.62, -23.54], [-46.63, -23.55]]);
      expect(wkt).toBe("POLYGON((-46.63 -23.55, -46.62 -23.55, -46.62 -23.54, -46.63 -23.55))");
    });
  });

  describe("pointToWkt", () => {
    it("gera WKT POINT válido", () => {
      expect(pointToWkt([-46.63, -23.55])).toBe("POINT(-46.63 -23.55)");
    });
  });
});
