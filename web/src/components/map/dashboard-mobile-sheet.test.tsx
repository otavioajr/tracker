// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DashboardMobileSheet } from "./dashboard-mobile-sheet";

describe("DashboardMobileSheet", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows browser content only when expanded and uses a single toggle action", () => {
    const onStateChange = vi.fn();
    const childText = "Lista operacional";

    const { rerender } = render(
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
    expect(
      screen.getByRole("button", { name: "Minimizar lista de veículos" })
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Expandir lista de veículos" })
    ).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "Minimizar lista de veículos" })
    );
    expect(onStateChange).toHaveBeenCalledWith("collapsed");

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
    expect(
      screen.getByRole("button", { name: "Expandir lista de veículos" })
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Minimizar lista de veículos" })
    ).toBeNull();
  });
});
