import { describe, expect, it } from "vitest";
import { normalizeRealtimeLocation, reconcilePositions, shouldReplaceVehiclePosition } from "./position-data";
import type { VehiclePosition } from "@/components/map/types";

const position: VehiclePosition = { device_id: "a", latitude: 0, longitude: 0, speed: 0, heading: 0, ignition: false, device_time: "2026-09-09T12:00:00Z", server_time: "2026-09-09T12:00:00Z" };
describe("position-data", () => {
  it.each([true, false])("decodifica EWKB nos dois endian: %s", (little) => {
    const buffer = new ArrayBuffer(25); const view = new DataView(buffer);
    view.setUint8(0, little ? 1 : 0); view.setUint32(1, 0x20000001, little); view.setUint32(5, 4326, little);
    view.setFloat64(9, -46.63, little); view.setFloat64(17, -23.55, little);
    const hex = Buffer.from(buffer).toString("hex");
    expect(normalizeRealtimeLocation(hex)?.coordinates).toEqual([-46.63, -23.55]);
    expect(normalizeRealtimeLocation(`\\x${hex}`)?.coordinates).toEqual([-46.63, -23.55]);
    view.setUint32(5, 3857, little);
    expect(normalizeRealtimeLocation(Buffer.from(buffer).toString("hex"))).toBeNull();
  });
  it.each([[NaN, 0], [Infinity, 0], [181, 0], [0, -91], ["0", 0], [0, 0, 1]])("rejeita coordenadas inválidas %j", (...coordinates) => {
    expect(normalizeRealtimeLocation({ type: "Point", coordinates })).toBeNull();
  });
  it("ordena estritamente pela medição e recupera futuro contaminado", () => {
    expect(shouldReplaceVehiclePosition(position, { ...position, server_time: "2026-09-09T13:00:00Z" })).toBe(false);
    expect(shouldReplaceVehiclePosition(position, { ...position, device_time: "2026-09-09T12:02:00Z" })).toBe(true);
    expect(shouldReplaceVehiclePosition(position, { ...position, device_time: "2026-09-09T12:02:01Z" })).toBe(false);
    expect(shouldReplaceVehiclePosition({ ...position, device_time: "2027-01-01T00:00:00Z" }, position)).toBe(true);
    expect(shouldReplaceVehiclePosition(position, { ...position, device_time: "2026-09-09T12:03:00Z", server_time: "2026-09-09T13:00:00Z", received_at: "2026-09-09T12:00:00Z" })).toBe(false);
  });
  it("preserva referências, remove ausentes e atualiza metadados sem regressão", () => {
    const current = [position];
    expect(reconcilePositions(current, [{ ...position }])).toBe(current);
    expect(reconcilePositions(current, [])).toEqual([]);
    expect(reconcilePositions(current, [{ ...position, device_time: "2026-09-09T11:00:00Z", plate: "ABC" }])[0]).toMatchObject({ device_time: position.device_time, plate: "ABC" });
  });
});
