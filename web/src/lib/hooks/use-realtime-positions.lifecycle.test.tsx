// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VehiclePosition } from "@/components/map/types";
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), remove: vi.fn(), status: undefined as unknown as (status: string) => void, event: undefined as unknown as (payload: object) => void }));
vi.mock("@/lib/actions/positions", () => ({ getLatestPositions: mocks.fetch }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ removeChannel: mocks.remove, channel: () => {
  const channel = { on: (_type: string, _filter: object, callback: typeof mocks.event) => { mocks.event = callback; return channel; }, subscribe: (callback: typeof mocks.status) => { mocks.status = callback; return channel; } }; return channel;
} }) }));
import { useRealtimePositionsState } from "./use-realtime-positions";
const position: VehiclePosition = { device_id: "a", latitude: 0, longitude: 0, speed: 0, heading: 0, ignition: false, device_time: "2026-09-09T12:00:00Z", server_time: "2026-09-09T12:00:00Z" };
const initial = [position];
const flush = async () => { await act(async () => { await Promise.resolve(); }); };
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks();
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  mocks.fetch.mockResolvedValue([{ ...position }]);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
describe("ciclo de recuperação das posições", () => {
  it("assina, sincroniza, preserva referência e limpa timers/canal", async () => {
    const { result, unmount } = renderHook(() => useRealtimePositionsState(initial));
    expect(result.current.connectionStatus).toBe("connecting");
    act(() => mocks.status("SUBSCRIBED")); await flush();
    expect(result.current.connectionStatus).toBe("live");
    const previous = result.current.positions;
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(mocks.fetch).toHaveBeenCalledTimes(2); expect(result.current.positions).toBe(previous);
    unmount(); await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(mocks.remove).toHaveBeenCalledTimes(1); expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });
  it("suspende offline/oculto e recupera online, visible, foco e reconexão", async () => {
    const { result } = renderHook(() => useRealtimePositionsState(initial));
    Object.defineProperty(navigator, "onLine", { value: false });
    act(() => window.dispatchEvent(new Event("offline")));
    expect(result.current.connectionStatus).toBe("offline");
    await act(async () => { await vi.advanceTimersByTimeAsync(90_000); }); expect(mocks.fetch).not.toHaveBeenCalled();
    Object.defineProperty(navigator, "onLine", { value: true });
    act(() => window.dispatchEvent(new Event("online"))); await flush();
    Object.defineProperty(document, "visibilityState", { value: "hidden" });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    const calls = mocks.fetch.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(90_000); }); expect(mocks.fetch).toHaveBeenCalledTimes(calls);
    Object.defineProperty(document, "visibilityState", { value: "visible" });
    act(() => document.dispatchEvent(new Event("visibilitychange"))); await flush();
    act(() => window.dispatchEvent(new Event("focus"))); await flush();
    act(() => mocks.status("CHANNEL_ERROR")); expect(result.current.connectionStatus).toBe("recovering");
    act(() => mocks.status("SUBSCRIBED")); await flush(); expect(result.current.connectionStatus).toBe("live");
    expect(mocks.fetch).toHaveBeenCalledTimes(calls + 3);
  });
  it("aplica backoff de 30/60/120 segundos e volta a 30 após sucesso", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.fetch.mockRejectedValue(new Error("offline"));
    renderHook(() => useRealtimePositionsState(initial));
    act(() => mocks.status("SUBSCRIBED")); await flush();
    for (const [delay, calls] of [[30_000, 2], [60_000, 3], [120_000, 4]]) {
      await act(async () => { await vi.advanceTimersByTimeAsync(delay - 1); }); expect(mocks.fetch).toHaveBeenCalledTimes(calls - 1);
      await act(async () => { await vi.advanceTimersByTimeAsync(1); }); expect(mocks.fetch).toHaveBeenCalledTimes(calls);
    }
    mocks.fetch.mockResolvedValue(initial);
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); await vi.advanceTimersByTimeAsync(30_000); });
    expect(mocks.fetch).toHaveBeenCalledTimes(6);
  });
  it("ignora conclusão após desmontagem e eventos antigos/iguais", async () => {
    let resolve!: (positions: VehiclePosition[]) => void;
    mocks.fetch.mockImplementationOnce(() => new Promise<VehiclePosition[]>((done) => { resolve = done; }));
    const { result, unmount } = renderHook(() => useRealtimePositionsState(initial));
    const previous = result.current.positions;
    act(() => mocks.event({ eventType: "UPDATE", new: { ...position, speed: 90, server_time: "2026-09-09T13:00:00Z", location: { type: "Point", coordinates: [1, 1] } } }));
    expect(result.current.positions).toBe(previous);
    act(() => mocks.status("SUBSCRIBED"));
    unmount(); await act(async () => resolve([]));
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(mocks.fetch).toHaveBeenCalledTimes(1); expect(mocks.remove).toHaveBeenCalledTimes(1);
  });
  it("serializa resync, rejeita resposta obsoleta, ignora desconhecidos e reconcilia DELETE", async () => {
    let resolve!: (positions: VehiclePosition[]) => void;
    mocks.fetch.mockImplementationOnce(() => new Promise<VehiclePosition[]>((done) => { resolve = done; }));
    const { result } = renderHook(() => useRealtimePositionsState(initial));
    act(() => mocks.status("SUBSCRIBED"));
    act(() => window.dispatchEvent(new Event("focus")));
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    act(() => mocks.event({ eventType: "UPDATE", new: { ...position, device_id: "unknown", location: { type: "Point", coordinates: [1, 1] } } }));
    await act(async () => resolve([])); await flush();
    expect(mocks.fetch).toHaveBeenCalledTimes(2); expect(result.current.positions).toEqual(initial);
    mocks.fetch.mockResolvedValue([]);
    act(() => mocks.event({ eventType: "DELETE", old: { device_id: "a" } })); await flush();
    expect(result.current.positions).toEqual([]);
  });
});
