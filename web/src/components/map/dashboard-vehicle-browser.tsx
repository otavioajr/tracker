"use client";

import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DashboardVehicleFilter } from "@/lib/map/dashboard-map-utils";
import { cn } from "@/lib/utils";

import { DashboardVehicleListItem } from "./dashboard-vehicle-list-item";
import type { DashboardVehicleListEntry } from "./types";

const FILTER_OPTIONS: { label: string; value: DashboardVehicleFilter }[] = [
  { label: "Todos", value: "all" },
  { label: "Em movimento", value: "moving" },
  { label: "Parados", value: "stopped" },
  { label: "Sem sinal", value: "offline" },
];

type DashboardVehicleBrowserProps = {
  vehicles: DashboardVehicleListEntry[];
  selectedDeviceId: string | null;
  query: string;
  statusFilter: DashboardVehicleFilter;
  summaryLabel: string;
  activeTrailDeviceIds: Set<string>;
  onQueryChange: (value: string) => void;
  onStatusFilterChange: (filter: DashboardVehicleFilter) => void;
  onSelectVehicle: (deviceId: string) => void;
  onToggleVehicleTrail: (deviceId: string) => void;
};

export function DashboardVehicleBrowser({
  vehicles,
  selectedDeviceId,
  query,
  statusFilter,
  summaryLabel,
  activeTrailDeviceIds,
  onQueryChange,
  onStatusFilterChange,
  onSelectVehicle,
  onToggleVehicleTrail,
}: DashboardVehicleBrowserProps) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Buscar veículo"
            className="h-10 rounded-xl border-white/10 bg-white/6 pl-9 text-sm shadow-none placeholder:text-muted-foreground/80"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {FILTER_OPTIONS.map((filterOption) => {
            const active = filterOption.value === statusFilter;

            return (
              <Button
                key={filterOption.value}
                type="button"
                size="xs"
                variant={active ? "secondary" : "ghost"}
                className={cn(
                  "rounded-full border border-transparent px-3 text-xs",
                  active
                    ? "bg-white/12 text-foreground"
                    : "text-muted-foreground hover:bg-white/6 hover:text-foreground"
                )}
                onClick={() => onStatusFilterChange(filterOption.value)}
              >
                {filterOption.label}
              </Button>
            );
          })}
        </div>

        <div className="flex items-center justify-between px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          <span>Monitoramento</span>
          <span>{summaryLabel}</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {vehicles.length === 0 ? (
          <div className="flex h-full min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/10 px-6 text-center">
            <p className="text-sm font-semibold text-foreground">
              Nenhum veículo encontrado
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Ajuste a busca ou troque o filtro para continuar.
            </p>
          </div>
        ) : (
          <div className="space-y-2 pr-1">
            {vehicles.map((vehicle) => (
              <DashboardVehicleListItem
                key={vehicle.device_id}
                vehicle={vehicle}
                selected={vehicle.device_id === selectedDeviceId}
                trailActive={activeTrailDeviceIds.has(vehicle.device_id)}
                onSelect={() => onSelectVehicle(vehicle.device_id)}
                onToggleTrail={() => onToggleVehicleTrail(vehicle.device_id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
