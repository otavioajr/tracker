"use client";

import type { ReactNode } from "react";
import { ChevronDown, ChevronUp, PanelBottomClose, PanelBottomOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type DashboardMobileSheetState = "collapsed" | "peek" | "expanded";

type DashboardMobileSheetProps = {
  state: DashboardMobileSheetState;
  title: string;
  subtitle: string;
  onStateChange: (state: DashboardMobileSheetState) => void;
  children: ReactNode;
};

const SHEET_HEIGHT: Record<DashboardMobileSheetState, string> = {
  collapsed: "h-[4.75rem]",
  peek: "h-[18rem]",
  expanded: "h-[min(70vh,34rem)]",
};

export function DashboardMobileSheet({
  state,
  title,
  subtitle,
  onStateChange,
  children,
}: DashboardMobileSheetProps) {
  const isExpanded = state === "expanded";
  const shouldShowContent = state !== "collapsed";

  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-3 z-[1010] lg:hidden">
      <div
        data-state={state}
        className={cn(
          "pointer-events-auto overflow-hidden rounded-[28px] border border-white/10 bg-background/92 text-foreground shadow-[0_24px_48px_-24px_rgba(0,0,0,0.75)] backdrop-blur-2xl transition-[height] duration-200 ease-out",
          SHEET_HEIGHT[state]
        )}
      >
        <div className="flex h-full flex-col">
          <div className="px-4 pt-3">
            <button
              type="button"
              aria-label={
                isExpanded ? "Recolher lista de veículos" : "Expandir lista de veículos"
              }
              onClick={() =>
                onStateChange(isExpanded ? "peek" : "expanded")
              }
              className="mx-auto mb-3 flex w-full flex-col items-center gap-3 rounded-2xl"
            >
              <span className="h-1.5 w-12 rounded-full bg-white/14" />
              <span className="sr-only">Alternar painel</span>
            </button>

            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
              </div>
              <div className="flex items-center gap-2">
                {state !== "collapsed" ? (
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    aria-label="Colapsar lista de veículos"
                    className="border border-white/10 bg-white/5 hover:bg-white/10"
                    onClick={() => onStateChange("collapsed")}
                  >
                    <PanelBottomClose />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    aria-label="Mostrar resumo da lista de veículos"
                    className="border border-white/10 bg-white/5 hover:bg-white/10"
                    onClick={() => onStateChange("peek")}
                  >
                    <PanelBottomOpen />
                  </Button>
                )}
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label={
                    isExpanded ? "Diminuir lista de veículos" : "Expandir lista de veículos"
                  }
                  className="border border-white/10 bg-white/5 hover:bg-white/10"
                  onClick={() => onStateChange(isExpanded ? "peek" : "expanded")}
                >
                  {isExpanded ? <ChevronDown /> : <ChevronUp />}
                </Button>
              </div>
            </div>
          </div>

          {shouldShowContent ? (
            <div
              className={cn(
                "relative min-h-0 flex-1 px-4 pt-4",
                isExpanded ? "pb-4" : "overflow-hidden pb-0"
              )}
            >
              {children}
              {state === "peek" ? (
                <div className="pointer-events-none absolute inset-x-4 bottom-0 h-16 bg-gradient-to-t from-background via-background/95 to-transparent" />
              ) : null}
            </div>
          ) : (
            <div className="px-4 pb-4 pt-3">
              <div className="rounded-2xl border border-white/8 bg-black/15 px-3 py-3 text-sm text-muted-foreground">
                {state === "collapsed"
                  ? "Toque para abrir a lista de veículos."
                  : "Arraste ou toque para expandir a lista e buscar rapidamente."}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
