// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HistoryMissionSidebar } from "./history-mission-sidebar";

describe("HistoryMissionSidebar", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders summary and highlights without the selected point section", () => {
    render(
      <HistoryMissionSidebar
        summary={{
          totalPoints: 3,
          totalDistanceKm: 12.4,
          maxSpeedKmh: 74,
          movingMinutes: 18,
          stoppedMinutes: 4,
          totalDurationMinutes: 22,
        }}
        highlights={[
          {
            kind: "milestone",
            index: 0,
            label: "Start",
            timestamp: "2026-04-05T10:00:00.000Z",
            latitude: -23.55,
            longitude: -46.63,
          },
        ]}
        currentPosition={null}
        loading={false}
        hasSearched={true}
        searchFailed={false}
        onHighlightSelect={vi.fn()}
      />
    );

    expect(screen.getByText("Resumo da viagem")).toBeTruthy();
    expect(screen.getByText("Paradas e destaques")).toBeTruthy();
    expect(screen.queryByText("Ponto selecionado")).toBeNull();
  });
});
