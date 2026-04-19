"use client";

import { ArrowUpRight, LocateFixed, Power } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DASHBOARD_STATUS_META, getVehicleDisplayLabel } from "@/lib/map/dashboard-map-utils";
import { cn } from "@/lib/utils";

import type { VehicleOperationalStatus, VehiclePosition } from "./types";

type DashboardFollowBarProps = {
  vehicle: VehiclePosition;
  status: VehicleOperationalStatus;
  onExitFollow: () => void;
};

export function DashboardFollowBar({
  vehicle,
  status,
  onExitFollow,
}: DashboardFollowBarProps) {
  const statusMeta = DASHBOARD_STATUS_META[status];

  return (
    <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-white/10 bg-background/88 px-2 py-2 text-foreground shadow-[0_20px_40px_-24px_rgba(0,0,0,0.7)] backdrop-blur-xl lg:gap-3 lg:px-3 lg:py-3 lg:min-w-[18rem] lg:max-w-[calc(100vw-2rem)]">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary ring-1 ring-primary/20 lg:size-10 lg:rounded-xl">
        <LocateFixed className="size-3.5 lg:size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground lg:text-[11px] lg:tracking-[0.18em]">
          Seguindo agora
        </p>
        <div className="mt-0.5 flex items-center gap-1.5 lg:mt-1 lg:gap-2">
          <p className="truncate text-xs font-semibold text-foreground lg:text-sm">
            {getVehicleDisplayLabel(vehicle)}
          </p>
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium lg:px-2 lg:text-[11px]",
              statusMeta.colorClassName,
              "bg-white/6"
            )}
          >
            <span className={cn("size-1 rounded-full lg:size-1.5", statusMeta.dotClassName)} />
            {statusMeta.label}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground lg:mt-1 lg:gap-3 lg:text-xs">
          <span className="inline-flex items-center gap-1">
            <ArrowUpRight className="size-2.5 lg:size-3" />
            <span className="font-mono tabular-nums text-foreground">
              {vehicle.speed.toFixed(0)} km/h
            </span>
          </span>
          <span className="inline-flex items-center gap-1">
            <Power className={cn("size-2.5 lg:size-3", vehicle.ignition ? "text-emerald-400" : "text-muted-foreground")} />
            <span className={cn(vehicle.ignition ? "text-emerald-400" : "text-muted-foreground")}>
              {vehicle.ignition ? "Ligada" : "Desligada"}
            </span>
          </span>
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label="Sair do follow"
        className="h-7 shrink-0 border-white/12 bg-white/5 px-2 text-[11px] hover:bg-white/10 lg:h-9 lg:px-3 lg:text-sm"
        onClick={onExitFollow}
      >
        Sair
      </Button>
    </div>
  );
}
