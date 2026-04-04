// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DashboardMobileSheet } from "./dashboard-mobile-sheet";

describe("DashboardMobileSheet", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows browser content in peek and expanded states, and hides it when collapsed", () => {
    const onStateChange = vi.fn();
    const childText = "Lista operacional";

    const { rerender } = render(
      <DashboardMobileSheet
        state="peek"
        title="2 veículos"
        subtitle="2 veículos visíveis"
        onStateChange={onStateChange}
      >
        <div>{childText}</div>
      </DashboardMobileSheet>
    );

    expect(screen.getByText(childText)).toBeTruthy();

    rerender(
      <DashboardMobileSheet
        state="expanded"
        title="2 veículos"
        subtitle="2 veículos visíveis"
        onStateChange={onStateChange}
      >
        <div>{childText}</div>
      </DashboardMobileSheet>
    );

    expect(screen.getByText(childText)).toBeTruthy();

    rerender(
      <DashboardMobileSheet
        state="collapsed"
        title="2 veículos"
        subtitle="2 veículos visíveis"
        onStateChange={onStateChange}
      >
        <div>{childText}</div>
      </DashboardMobileSheet>
    );

    expect(screen.queryByText(childText)).toBeNull();
    expect(screen.getByText("Toque para abrir a lista de veículos.")).toBeTruthy();
  });
});
