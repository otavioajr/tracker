// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const polylineSpy = vi.fn(() => null);

vi.mock("react-leaflet", () => ({
  Polyline: (props: unknown) => {
    polylineSpy(props);
    return null;
  },
}));

import { VehicleTrailLayer } from "./vehicle-trail-layer";

describe("VehicleTrailLayer", () => {
  it("renders a polyline with the trail coordinates and shared style", () => {
    render(
      <VehicleTrailLayer
        trail={{
          deviceId: "truck-1",
          points: [
            {
              latitude: -23.55,
              longitude: -46.63,
              server_time: "2026-04-07T12:00:00.000Z",
            },
            {
              latitude: -23.551,
              longitude: -46.631,
              server_time: "2026-04-07T12:01:00.000Z",
            },
          ],
        }}
      />
    );

    expect(polylineSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        positions: [
          [-23.55, -46.63],
          [-23.551, -46.631],
        ],
        pathOptions: expect.objectContaining({
          color: "#13d392",
          weight: 4,
          opacity: 0.8,
        }),
      })
    );
  });
});
