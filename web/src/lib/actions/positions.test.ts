import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: mocks.from }) }));
import { getLatestPositions } from "./positions";
const row = { device_id: "a", vehicle_id: "old", location: "0101000020E610000000000000000000000000000000000000", speed: 10, heading: 0, ignition: true, device_time: "2026-09-09T12:00:00Z", server_time: "2026-09-09T12:00:00Z", received_at: null };
function query(data: unknown, error: { message: string } | null = null) {
  const chain = { select: vi.fn(() => chain), eq: vi.fn(() => chain), order: vi.fn(() => chain), in: vi.fn(() => chain), range: vi.fn(async () => ({ data, error })) }; return chain;
}
beforeEach(() => vi.resetAllMocks());
describe("getLatestPositions", () => {
  it("consulta snapshot autorizado em lote e usa associação/metadados atuais", async () => {
    const devices = query([{ id: "a", vehicles: [{ id: "new", name: "Carro", plate: "ABC", brand: "Fiat", model: "Uno" }] }]);
    const latest = query([row]); mocks.from.mockReturnValueOnce(devices).mockReturnValueOnce(latest);
    expect(await getLatestPositions()).toEqual([expect.objectContaining({ device_id: "a", vehicle_id: "new", vehicle_name: "Carro", vehicle_model: "Fiat Uno", longitude: 0, received_at: null })]);
    expect(devices.eq).toHaveBeenCalledWith("active", true); expect(latest.in).toHaveBeenCalledWith("device_id", ["a"]);
    expect(mocks.from.mock.calls.map(([table]) => table)).toEqual(["devices", "latest_positions"]);
  });
  it("pagina dispositivos além do tamanho do lote", async () => {
    mocks.from.mockReturnValueOnce(query(Array.from({ length: 200 }, (_, i) => ({ id: String(i), vehicles: [] }))))
      .mockReturnValueOnce(query([])).mockReturnValueOnce(query([{ id: "a", vehicles: null }])).mockReturnValueOnce(query([row]));
    expect(await getLatestPositions()).toHaveLength(1); expect(mocks.from).toHaveBeenCalledTimes(4);
  });
  it("propaga erros em vez de devolver fotografia parcial", async () => {
    mocks.from.mockReturnValueOnce(query([{ id: "a", vehicles: null }])).mockReturnValueOnce(query(null, { message: "snapshot failed" }));
    await expect(getLatestPositions()).rejects.toThrow("snapshot failed");
  });
  it("não descarta silenciosamente localização inválida", async () => {
    mocks.from.mockReturnValueOnce(query([{ id: "a", vehicles: null }])).mockReturnValueOnce(query([{ ...row, location: "broken" }]));
    await expect(getLatestPositions()).rejects.toThrow("Posição inválida");
  });
});
