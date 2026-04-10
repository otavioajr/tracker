// @vitest-environment jsdom

import React from "react";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { mockGetLatestPositions, mockCreateClient, mockDashboardMap } = vi.hoisted(
  () => ({
    mockGetLatestPositions: vi.fn(),
    mockCreateClient: vi.fn(),
    mockDashboardMap: vi.fn(),
  })
);
const mockGetUser = vi.fn();

vi.mock("@/lib/actions/positions", () => ({
  getLatestPositions: mockGetLatestPositions,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mockCreateClient,
}));

vi.mock("./dashboard-map", () => ({
  DashboardMap: mockDashboardMap,
}));

import DashboardPage from "./page";

describe("DashboardPage", () => {
  it("passes latest positions and authenticated user id to the dashboard map", async () => {
    const positions = [
      {
        device_id: "truck-1",
        latitude: -23.5,
        longitude: -46.6,
        speed: 42,
        heading: 0,
        ignition: true,
        device_time: "2026-04-04T14:59:00.000Z",
        server_time: "2026-04-04T15:00:00.000Z",
      },
    ];

    mockGetLatestPositions.mockResolvedValueOnce(positions);
    mockGetUser.mockResolvedValueOnce({
      data: {
        user: {
          id: "user-123",
        },
      },
      error: null,
    });
    mockCreateClient.mockResolvedValueOnce({
      auth: {
        getUser: mockGetUser,
      },
    });

    const page = await DashboardPage();
    render(page);

    expect(mockGetLatestPositions).toHaveBeenCalledTimes(1);
    expect(mockCreateClient).toHaveBeenCalledTimes(1);
    expect(mockGetUser).toHaveBeenCalledTimes(1);
    expect(mockDashboardMap).toHaveBeenCalledTimes(1);
    expect(mockDashboardMap.mock.calls[0][0]).toEqual({
      initialPositions: positions,
      userId: "user-123",
    });
  });
});
