// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react-leaflet", () => ({
  Marker: ({ title, children }: { title: string; children: React.ReactNode }) => <div title={title}>{children}</div>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock("leaflet", () => ({ default: { divIcon: vi.fn(() => ({})) } }));

import { VehicleMarker } from "./vehicle-marker";

afterEach(cleanup);

describe("VehicleMarker freshness", () => {
  it("updates textual status from the shared clock without a position event", () => {
    const position = { device_id: "truck-1", latitude: -23.5, longitude: -46.6, speed: 42, heading: 0, ignition: true, device_time: "2026-04-04T15:00:00Z", server_time: "2026-04-04T15:05:00Z" };
    const { rerender } = render(<VehicleMarker position={position} now={Date.parse("2026-04-04T15:05:00Z")} />);
    expect(screen.getByText(/Em movimento/)).toBeTruthy();
    // A gravação recente não renova a idade de uma medição antiga.
    rerender(<VehicleMarker position={position} now={Date.parse("2026-04-04T15:05:15Z")} />);
    expect(screen.getByText(/Posição desatualizada/)).toBeTruthy();
    expect(screen.getByTitle(/Última posição há 5 min/)).toBeTruthy();
    expect(screen.queryByText(/Sem sinal/)).toBeNull();
  });
});
