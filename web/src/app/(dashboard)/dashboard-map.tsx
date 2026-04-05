"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { MapPinned, PanelRightClose } from "lucide-react";

import { DashboardFollowBar } from "@/components/map/dashboard-follow-bar";
import {
  DashboardMobileSheet,
  type DashboardMobileSheetState,
} from "@/components/map/dashboard-mobile-sheet";
import { DashboardVehicleBrowser } from "@/components/map/dashboard-vehicle-browser";
import type {
  DashboardVehicleListEntry,
  VehiclePosition,
} from "@/components/map/types";
import { Button } from "@/components/ui/button";
import { useRealtimePositions } from "@/lib/hooks/use-realtime-positions";
import {
  type DashboardVehicleFilter,
  filterDashboardVehicles,
  formatLastSignalRelative,
  getVehicleDisplayLabel,
  getVehicleOperationalStatus,
} from "@/lib/map/dashboard-map-utils";

const TrackingMap = dynamic(
  () => import("@/components/map/tracking-map").then((mod) => mod.TrackingMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center rounded-lg bg-card text-sm text-muted-foreground">
        Carregando mapa...
      </div>
    ),
  }
);

type DashboardMapProps = {
  initialPositions: VehiclePosition[];
};

export function DashboardMap({ initialPositions }: DashboardMapProps) {
  const positions = useRealtimePositions(initialPositions);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [followedDeviceId, setFollowedDeviceId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<DashboardVehicleFilter>("all");
  const [desktopRailOpen, setDesktopRailOpen] = useState(true);
  const [mobileSheetState, setMobileSheetState] =
    useState<DashboardMobileSheetState>("collapsed");
  const [fitAllTrigger, setFitAllTrigger] = useState(0);

  const handleSelectVehicle = useCallback((deviceId: string) => {
    setSelectedDeviceId(deviceId);
    setFollowedDeviceId(deviceId);
    setMobileSheetState("collapsed");
  }, []);

  const handleCancelFollow = useCallback(() => {
    setFollowedDeviceId(null);
  }, []);

  const handleFitAll = useCallback(() => {
    setSelectedDeviceId(null);
    setFollowedDeviceId(null);
    setMobileSheetState("collapsed");
    setFitAllTrigger((prev) => prev + 1);
  }, []);

  const filteredPositions = filterDashboardVehicles(positions, {
    query: searchQuery,
    status: statusFilter,
  });

  const vehicleEntries: DashboardVehicleListEntry[] = filteredPositions.map(
    (position) => ({
      device_id: position.device_id,
      displayLabel: getVehicleDisplayLabel(position),
      secondaryLabel: position.vehicle_name
        ? position.plate || position.device_id
        : position.plate
          ? position.device_id
          : undefined,
      status: getVehicleOperationalStatus(position),
      lastSignalLabel: formatLastSignalRelative(position.server_time),
      speedLabel: `${position.speed.toFixed(0)} km/h`,
    })
  );

  const selectedVehicle = selectedDeviceId
    ? positions.find((position) => position.device_id === selectedDeviceId) ?? null
    : null;

  const followedVehicle = followedDeviceId
    ? positions.find((position) => position.device_id === followedDeviceId) ?? null
    : null;

  const visibleSummaryLabel = `${filteredPositions.length} ${
    filteredPositions.length === 1 ? "veículo visível" : "veículos visíveis"
  }`;

  const mobileTitle = selectedVehicle
    ? getVehicleDisplayLabel(selectedVehicle)
    : `${positions.length} ${positions.length === 1 ? "veículo" : "veículos"}`;

  return (
    <div className="relative h-full w-full overflow-hidden rounded-[28px] border border-white/8 bg-black/10 ring-1 ring-white/6">
      <TrackingMap
        positions={positions}
        className="h-full w-full"
        selectedDeviceId={selectedDeviceId}
        followedDeviceId={followedDeviceId}
        onSelect={handleSelectVehicle}
        onFollow={handleSelectVehicle}
        onCancelFollow={handleCancelFollow}
        fitAllTrigger={fitAllTrigger}
      />

      {followedVehicle ? (
        <div className="absolute top-3 left-1/2 z-[1000] -translate-x-1/2">
          <DashboardFollowBar
            vehicle={followedVehicle}
            status={getVehicleOperationalStatus(followedVehicle)}
            onExitFollow={handleCancelFollow}
          />
        </div>
      ) : null}

      <button
        type="button"
        onClick={handleFitAll}
        className="absolute right-3 bottom-24 z-[1000] flex items-center gap-2 rounded-2xl border border-white/10 bg-background/88 px-4 py-2.5 text-xs font-semibold text-foreground shadow-[0_20px_40px_-24px_rgba(0,0,0,0.75)] backdrop-blur-xl transition-all active:scale-95 lg:bottom-4"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
        </svg>
        Ver todos
      </button>

      <div className="pointer-events-none absolute bottom-24 left-3 z-[1000] lg:bottom-4">
        <div className="rounded-2xl border border-white/10 bg-background/88 px-3 py-2 text-xs font-semibold text-foreground shadow-[0_20px_40px_-24px_rgba(0,0,0,0.75)] backdrop-blur-xl">
          <span className="font-bold text-primary">{positions.length}</span>{" "}
          {positions.length === 1 ? "veículo" : "veículos"}
        </div>
      </div>

      {desktopRailOpen ? (
        <div className="absolute right-3 bottom-20 z-[1000] hidden lg:flex">
          <div className="flex h-[min(68vh,42rem)] max-h-[calc(100%-6rem)] w-[22rem] flex-col overflow-hidden rounded-[28px] border border-white/10 bg-background/88 p-4 text-foreground shadow-[0_24px_48px_-24px_rgba(0,0,0,0.75)] backdrop-blur-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Despacho em tempo real</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Busque, filtre e acompanhe um veículo sem sair do mapa.
                </p>
              </div>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label="Recolher painel do mapa"
                className="shrink-0 border border-white/10 bg-white/5 hover:bg-white/10"
                onClick={() => setDesktopRailOpen(false)}
              >
                <PanelRightClose />
              </Button>
            </div>

            <DashboardVehicleBrowser
              vehicles={vehicleEntries}
              selectedDeviceId={selectedDeviceId}
              query={searchQuery}
              statusFilter={statusFilter}
              summaryLabel={visibleSummaryLabel}
              onQueryChange={setSearchQuery}
              onStatusFilterChange={setStatusFilter}
              onSelectVehicle={handleSelectVehicle}
            />
          </div>
        </div>
      ) : (
        <div className="absolute right-3 bottom-20 z-[1000] hidden lg:flex">
          <Button
            type="button"
            size="icon-lg"
            variant="ghost"
            aria-label="Abrir painel do mapa"
            className="rounded-2xl border border-white/10 bg-background/88 shadow-[0_20px_40px_-24px_rgba(0,0,0,0.75)] backdrop-blur-xl hover:bg-background/95"
            onClick={() => setDesktopRailOpen(true)}
          >
            <MapPinned />
          </Button>
        </div>
      )}

      <DashboardMobileSheet
        state={mobileSheetState}
        title={mobileTitle}
        subtitle={visibleSummaryLabel}
        onStateChange={setMobileSheetState}
      >
        <DashboardVehicleBrowser
          vehicles={vehicleEntries}
          selectedDeviceId={selectedDeviceId}
          query={searchQuery}
          statusFilter={statusFilter}
          summaryLabel={visibleSummaryLabel}
          onQueryChange={setSearchQuery}
          onStatusFilterChange={setStatusFilter}
          onSelectVehicle={handleSelectVehicle}
        />
      </DashboardMobileSheet>
    </div>
  );
}
