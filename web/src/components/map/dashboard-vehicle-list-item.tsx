"use client";

import { Gauge, RadioTower } from "lucide-react";

import { DASHBOARD_STATUS_META } from "@/lib/map/dashboard-map-utils";
import { cn } from "@/lib/utils";

import type { DashboardVehicleListEntry } from "./types";

type DashboardVehicleListItemProps = {
  vehicle: DashboardVehicleListEntry;
  selected: boolean;
  trailActive: boolean;
  onSelect: () => void;
  onToggleTrail: () => void;
};

export function DashboardVehicleListItem({
  vehicle,
  selected,
  trailActive,
  onSelect,
  onToggleTrail,
}: DashboardVehicleListItemProps) {
  const statusMeta = DASHBOARD_STATUS_META[vehicle.status];

  return (
    <div
      data-selected={selected}
      className={cn(
        "flex w-full flex-col overflow-hidden rounded-2xl border text-left transition-all",
        selected
          ? "border-primary/30 bg-primary/10 text-foreground shadow-[0_20px_35px_-28px_rgba(19,211,146,0.6)]"
          : "border-white/8 bg-black/15 text-foreground hover:border-white/14 hover:bg-white/4"
      )}
    >
      <button
        type="button"
        aria-label={`Selecionar ${vehicle.displayLabel}`}
        onClick={onSelect}
        className="group flex w-full flex-col gap-2 px-3 py-3 text-left"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{vehicle.displayLabel}</p>
            {vehicle.secondaryLabel ? (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {vehicle.secondaryLabel}
              </p>
            ) : null}
          </div>
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
              statusMeta.colorClassName,
              "bg-white/6"
            )}
          >
            <span className={cn("size-1.5 rounded-full", statusMeta.dotClassName)} />
            {statusMeta.label}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Gauge className="size-3" />
            <span className="font-mono tabular-nums text-foreground">
              {vehicle.speedLabel}
            </span>
          </span>
          <span className="inline-flex items-center gap-1">
            <RadioTower className="size-3" />
            {vehicle.lastSignalLabel}
          </span>
        </div>
      </button>

      <button
        type="button"
        role="switch"
        aria-checked={trailActive}
        aria-label={`Mostrar rastro do ${vehicle.displayLabel}`}
        onClick={onToggleTrail}
        className="flex w-full items-center justify-between border-t border-white/8 bg-white/4 px-3 py-2 text-left transition-colors hover:bg-white/8"
      >
        <span className="space-y-0.5">
          <span className="block text-xs font-semibold text-foreground">
            Mostrar rastro
          </span>
          <span className="block text-[11px] text-muted-foreground">
            Acumula apenas novas posições enquanto estiver ativo.
          </span>
        </span>
        <span
          aria-hidden="true"
          className={cn(
            "relative h-6 w-10 rounded-full transition-colors",
            trailActive ? "bg-primary" : "bg-white/12"
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 size-5 rounded-full bg-background shadow transition-transform",
              trailActive ? "translate-x-4" : "translate-x-0"
            )}
          />
        </span>
      </button>
    </div>
  );
}
