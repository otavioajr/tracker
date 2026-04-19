"use client";

import { ArrowUpRight, LocateFixed } from "lucide-react";

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
    <div className="pointer-events-auto flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-background/88 px-3 py-3 text-foreground shadow-[0_20px_40px_-24px_rgba(0,0,0,0.7)] backdrop-blur-xl lg:w-auto lg:min-w-[18rem] lg:max-w-[calc(100vw-2rem)]">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary ring-1 ring-primary/20">
        <LocateFixed className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Seguindo agora
        </p>
        <div className="mt-1 flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-foreground">
            {getVehicleDisplayLabel(vehicle)}
          </p>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
              statusMeta.colorClassName,
              "bg-white/6"
            )}
          >
            <span className={cn("size-1.5 rounded-full", statusMeta.dotClassName)} />
            {statusMeta.label}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <ArrowUpRight className="size-3" />
          <span className="font-mono tabular-nums text-foreground">
            {vehicle.speed.toFixed(0)} km/h
          </span>
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label="Sair do follow"
        className="shrink-0 border-white/12 bg-white/5 hover:bg-white/10"
        onClick={onExitFollow}
      >
        Sair
      </Button>
    </div>
  );
}
