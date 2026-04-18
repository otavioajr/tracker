"use client";

import "leaflet/leaflet.css";
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { DivIcon } from "leaflet";
import { HistoryMissionSidebar } from "@/components/map/history-mission-sidebar";
import { HistoryPlaybackBar } from "@/components/map/history-playback-bar";
import { HistoryQueryToolbar } from "@/components/map/history-query-toolbar";
import { HistorySelectedPointCard } from "@/components/map/history-selected-point-card";
import { getVehicles } from "@/lib/actions/vehicles";
import { getPositionHistory, VehiclePosition } from "@/lib/actions/positions";
import {
  buildHistoryHighlights,
  buildPlaybackTrailCoords,
  buildRouteCoords,
  buildHistorySummary,
  getHistorySearchState,
  getPlaybackIntervalMs,
  orderHistoryPositions,
  type PlaybackSpeedPreset,
} from "@/lib/history/history-player-utils";

const SAO_PAULO: [number, number] = [-23.55, -46.63];

let cachedHistoryIcon: DivIcon | null = null;
let historyIconPromise: Promise<DivIcon> | null = null;

async function loadHistoryIcon(): Promise<DivIcon> {
  if (cachedHistoryIcon) return cachedHistoryIcon;
  if (historyIconPromise) return historyIconPromise;

  historyIconPromise = import("leaflet").then((L) => {
    const color = "#22c55e";
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="44" viewBox="0 0 32 44">
        <polygon points="10,30 22,30 16,42" fill="${color}" opacity="0.9"/>
        <circle cx="16" cy="16" r="14" fill="${color}" stroke="white" stroke-width="2" opacity="0.9"/>
        <g transform="translate(8, 8)" fill="white">
          <path d="M14 6H2C1.4 6 1 6.4 1 7v8c0 .6.4 1 1 1h1v1.5c0 .3.2.5.5.5h1c.3 0 .5-.2.5-.5V16h8v1.5c0 .3.2.5.5.5h1c.3 0 .5-.2.5-.5V16h1c.6 0 1-.4 1-1V7c0-.6-.4-1-1-1zM4 13.5c-.8 0-1.5-.7-1.5-1.5S3.2 10.5 4 10.5s1.5.7 1.5 1.5-.7 1.5-1.5 1.5zm8 0c-.8 0-1.5-.7-1.5-1.5s.7-1.5 1.5-1.5 1.5.7 1.5 1.5-.7 1.5-1.5 1.5zm2-5H2V8l1.5-1.5h9L14 8v.5z"/>
        </g>
      </svg>
    `;

    cachedHistoryIcon = L.divIcon({
      html: svg,
      className: "",
      iconSize: [32, 44],
      iconAnchor: [16, 42],
      popupAnchor: [0, -34],
    });
    return cachedHistoryIcon;
  });

  return historyIconPromise;
}

const MapContainer = dynamic(
  () => import("react-leaflet").then((m) => m.MapContainer),
  { ssr: false }
);

const TileLayer = dynamic(
  () => import("react-leaflet").then((m) => m.TileLayer),
  { ssr: false }
);

const Polyline = dynamic(
  () => import("react-leaflet").then((m) => m.Polyline),
  { ssr: false }
);

const CircleMarkerDynamic = dynamic(
  () => import("react-leaflet").then((m) => m.CircleMarker),
  { ssr: false }
);

const MarkerDynamic = dynamic(
  () => import("react-leaflet").then((m) => m.Marker),
  { ssr: false }
);

const LayersControl = dynamic(
  () => import("react-leaflet").then((m) => m.LayersControl),
  { ssr: false }
);

const LayersControlBaseLayer = dynamic(
  () => import("react-leaflet").then((m) => {
    const LC = m.LayersControl;
    return { default: LC.BaseLayer };
  }),
  { ssr: false }
);

const HistoryMapControllerDynamic = dynamic(
  () => import("./history-map-controller").then((m) => m.HistoryMapController),
  { ssr: false }
);

type Vehicle = {
  id: string;
  plate: string;
  name: string | null;
};

type VehicleOption = {
  id: string;
  label: string;
};

type RouteBounds = [[number, number], [number, number]];

export function HistoryPlayer() {
  const [mounted, setMounted] = useState(false);
  const [historyIcon, setHistoryIcon] = useState<DivIcon | null>(null);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [vehicleId, setVehicleId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [positions, setPositions] = useState<VehiclePosition[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeedPreset>("1x");
  const [fitVersion, setFitVersion] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const routeData = useMemo(() => {
    const orderedPositions = orderHistoryPositions(positions);
    const summary =
      orderedPositions.length > 0 ? buildHistorySummary(orderedPositions) : null;
    const highlights =
      orderedPositions.length > 0 ? buildHistoryHighlights(orderedPositions) : [];
    const routeCoords = buildRouteCoords(orderedPositions);
    const routeBounds = buildRouteBounds(routeCoords);
    const milestoneHighlights = highlights.filter(
      (highlight) => highlight.kind === "milestone"
    );

    return {
      orderedPositions,
      summary,
      highlights,
      routeCoords,
      routeBounds,
      stopHighlights: highlights.filter((highlight) => highlight.kind === "stop"),
      startHighlight: milestoneHighlights[0] ?? null,
      endHighlight:
        milestoneHighlights.length > 1
          ? milestoneHighlights[milestoneHighlights.length - 1]
          : null,
    };
  }, [positions]);

  const {
    orderedPositions,
    summary,
    highlights,
    routeCoords,
    routeBounds,
    stopHighlights,
    startHighlight,
    endHighlight,
  } = routeData;
  const selectedVehicleLabel =
    vehicles.find((vehicle) => vehicle.id === vehicleId)?.label ?? "";
  const currentPosition = orderedPositions[currentIndex] ?? null;
  const playbackTrailCoords = useMemo(
    () => buildPlaybackTrailCoords(orderedPositions, currentIndex),
    [orderedPositions, currentIndex]
  );
  const hasResults = orderedPositions.length > 0;
  const { beforeSearch, noResults, searchFailed } = getHistorySearchState({
    hasSearched,
    loading,
    hasResults,
    error,
  });

  useEffect(() => {
    let isActive = true;
    setMounted(true);

    loadHistoryIcon()
      .then((icon) => {
        if (isActive) {
          setHistoryIcon(icon);
        }
      })
      .catch(() => {
        if (isActive) {
          setError("Erro ao carregar mapa");
        }
      });

    getVehicles()
      .then((data) => {
        if (!isActive) return;

        const vehicleOptions = ((data as Vehicle[]) ?? []).map((vehicle) => ({
          id: vehicle.id,
          label: vehicle.name ? `${vehicle.name} - ${vehicle.plate}` : vehicle.plate,
        }));

        setVehicles(vehicleOptions);
        if (vehicleOptions.length > 0) {
          setVehicleId((currentVehicleId) => currentVehicleId || vehicleOptions[0].id);
        }
      })
      .catch(() => {
        if (isActive) {
          setError("Erro ao carregar veículos");
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!playing || orderedPositions.length === 0) return;

    intervalRef.current = setInterval(() => {
      setCurrentIndex((prev) => {
        if (prev >= orderedPositions.length - 1) {
          setPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, getPlaybackIntervalMs(playbackSpeed));

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [orderedPositions.length, playing, playbackSpeed]);

  async function handleSearch() {
    if (!vehicleId || !startDate || !endDate) {
      setError("Preencha todos os campos");
      return;
    }
    setError("");
    setLoading(true);
    setPlaying(false);
    setCurrentIndex(0);

    try {
      setHasSearched(true);
      // datetime-local returns "2026-03-18T10:00" without timezone
      // Convert to ISO with local timezone offset for correct UTC comparison
      const start = new Date(startDate).toISOString();
      const end = new Date(endDate).toISOString();
      const data = await getPositionHistory(vehicleId, start, end);
      setPositions(data);
      if (data.length > 0) {
        setFitVersion((currentVersion) => currentVersion + 1);
      }
    } catch {
      setPositions([]);
      setError("Erro ao buscar histórico");
    } finally {
      setLoading(false);
    }
  }

  function handlePlay() {
    if (orderedPositions.length === 0) return;
    if (currentIndex >= orderedPositions.length - 1) setCurrentIndex(0);
    setPlaying(true);
  }

  function handlePause() {
    setPlaying(false);
  }

  function handleReset() {
    setPlaying(false);
    setCurrentIndex(0);
  }

  function handleSeek(index: number) {
    setPlaying(false);
    setCurrentIndex(index);
  }

  function handleHighlightSelect(index: number) {
    if (index < 0 || index >= orderedPositions.length) return;
    setPlaying(false);
    setCurrentIndex(index);
  }

  return (
    <div className="grid min-h-[calc(100dvh-14rem)] gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex min-h-0 flex-col gap-4">
        <HistoryQueryToolbar
          vehicleId={vehicleId}
          vehicles={vehicles}
          startDate={startDate}
          endDate={endDate}
          loading={loading}
          error={error}
          onVehicleChange={setVehicleId}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          onSearch={handleSearch}
        />

        <HistoryPlaybackBar
          playing={playing}
          currentIndex={currentIndex}
          totalPoints={orderedPositions.length}
          speed={playbackSpeed}
          currentTimestamp={currentPosition?.server_time ?? null}
          onPlay={handlePlay}
          onPause={handlePause}
          onReset={handleReset}
          onSeek={handleSeek}
          onSpeedChange={setPlaybackSpeed}
        />

        <div className="relative min-h-[420px] overflow-hidden rounded-xl border bg-muted/20">
          {selectedVehicleLabel ? (
            <div className="pointer-events-none absolute left-3 top-3 z-[500] rounded-full border border-border/70 bg-background/90 px-3 py-1 text-xs font-medium text-foreground shadow-sm backdrop-blur">
              {selectedVehicleLabel}
            </div>
          ) : null}

          {!mounted ? (
            <MapShellLoadingState label="Preparando mapa..." />
          ) : loading ? (
            <MapShellLoadingState label="Carregando rota..." />
          ) : !hasResults ? (
            <MapShellEmptyState
              title={
                beforeSearch
                  ? "Pronto para carregar a missão"
                  : noResults
                    ? "Nenhuma rota encontrada"
                    : searchFailed
                      ? "A rota não pôde ser carregada"
                      : "Pronto para uma nova consulta"
              }
              description={
                beforeSearch
                  ? "Escolha um veículo e um intervalo para visualizar o trajeto completo no mapa."
                  : noResults
                    ? "Ajuste o período consultado para buscar outro trecho com telemetria."
                    : searchFailed
                      ? "Revise os filtros e tente novamente. O detalhe do erro fica disponível na barra de consulta."
                      : "Use a barra de consulta para carregar outro trecho no mapa."
              }
            />
          ) : (
            <MapContainer
              center={currentPosition ? [currentPosition.latitude, currentPosition.longitude] : SAO_PAULO}
              zoom={14}
              style={{ width: "100%", height: "100%", minHeight: 420 }}
            >
              <LayersControl position="topright">
                <LayersControlBaseLayer checked name="Ruas">
                  <TileLayer
                    attribution='&copy; <a href="https://carto.com/">CARTO</a>'
                    url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                  />
                </LayersControlBaseLayer>
                <LayersControlBaseLayer name="Detalhado">
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                </LayersControlBaseLayer>
                <LayersControlBaseLayer name="Satelite">
                  <TileLayer
                    attribution="&copy; Esri"
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                  />
                </LayersControlBaseLayer>
                <LayersControlBaseLayer name="Escuro">
                  <TileLayer
                    attribution='&copy; <a href="https://carto.com/">CARTO</a>'
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                  />
                </LayersControlBaseLayer>
              </LayersControl>

              <HistoryMapControllerDynamic
                center={
                  currentPosition
                    ? [currentPosition.latitude, currentPosition.longitude]
                    : null
                }
                bounds={routeBounds}
                fitVersion={fitVersion}
              />

              {routeCoords.length > 1 ? (
                <Polyline positions={routeCoords} color="#94a3b8" weight={4} opacity={0.5} />
              ) : null}

              {playbackTrailCoords.length > 1 ? (
                <Polyline
                  positions={playbackTrailCoords}
                  color="#3b82f6"
                  weight={4}
                  opacity={0.95}
                />
              ) : null}

              {startHighlight ? (
                <CircleMarkerDynamic
                  center={[startHighlight.latitude, startHighlight.longitude]}
                  radius={currentIndex === startHighlight.index ? 8 : 6}
                  pathOptions={{
                    color: "#15803d",
                    fillColor: "#22c55e",
                    fillOpacity: 0.9,
                    weight: 2,
                  }}
                  eventHandlers={{
                    click: () => handleHighlightSelect(startHighlight.index),
                  }}
                />
              ) : null}

              {endHighlight ? (
                <CircleMarkerDynamic
                  center={[endHighlight.latitude, endHighlight.longitude]}
                  radius={currentIndex === endHighlight.index ? 8 : 6}
                  pathOptions={{
                    color: "#b91c1c",
                    fillColor: "#f87171",
                    fillOpacity: 0.9,
                    weight: 2,
                  }}
                  eventHandlers={{
                    click: () => handleHighlightSelect(endHighlight.index),
                  }}
                />
              ) : null}

              {stopHighlights.map((highlight) => (
                <CircleMarkerDynamic
                  key={`${highlight.kind}-${highlight.index}-${highlight.timestamp}`}
                  center={[highlight.latitude, highlight.longitude]}
                  radius={currentIndex === highlight.index ? 8 : 6}
                  pathOptions={{
                    color: "#f59e0b",
                    fillColor: "#fbbf24",
                    fillOpacity: 0.85,
                    weight: 2,
                  }}
                  eventHandlers={{
                    click: () => handleHighlightSelect(highlight.index),
                  }}
                />
              ))}

              {currentPosition && historyIcon ? (
                <MarkerDynamic
                  position={[currentPosition.latitude, currentPosition.longitude]}
                  icon={historyIcon}
                />
              ) : null}
            </MapContainer>
          )}
        </div>

        <HistorySelectedPointCard
          currentPosition={currentPosition}
          loading={loading}
          hasSearched={hasSearched}
          searchFailed={searchFailed}
        />
      </div>

      <HistoryMissionSidebar
        summary={summary}
        highlights={highlights}
        loading={loading}
        hasSearched={hasSearched}
        searchFailed={searchFailed}
        onHighlightSelect={handleHighlightSelect}
      />
    </div>
  );
}

function MapShellLoadingState({ label }: { label: string }) {
  return (
    <div className="flex min-h-[420px] flex-col justify-center gap-4 bg-muted/25 px-5 py-6">
      <div className="space-y-3">
        <div className="h-4 w-32 animate-pulse rounded-full bg-muted" />
        <div className="h-8 w-56 animate-pulse rounded-full bg-muted/80" />
      </div>
      <div className="grid gap-3 md:grid-cols-[minmax(0,1.5fr)_minmax(0,0.9fr)]">
        <div className="h-56 animate-pulse rounded-2xl border border-border/60 bg-background/80" />
        <div className="space-y-3">
          <div className="h-24 animate-pulse rounded-2xl border border-border/60 bg-background/80" />
          <div className="h-24 animate-pulse rounded-2xl border border-border/60 bg-background/70" />
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

function MapShellEmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-[420px] items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.12),transparent_34%),linear-gradient(180deg,rgba(148,163,184,0.08),rgba(148,163,184,0.02))] px-5 py-6">
      <div className="max-w-md rounded-2xl border border-dashed border-border/70 bg-background/78 p-6 shadow-sm backdrop-blur">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Mission map
        </p>
        <h3 className="mt-3 text-xl font-semibold tracking-tight text-foreground">
          {title}
        </h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function buildRouteBounds(routeCoords: [number, number][]): RouteBounds | null {
  if (routeCoords.length === 0) {
    return null;
  }

  let minLatitude = routeCoords[0][0];
  let maxLatitude = routeCoords[0][0];
  let minLongitude = routeCoords[0][1];
  let maxLongitude = routeCoords[0][1];

  for (const [latitude, longitude] of routeCoords) {
    minLatitude = Math.min(minLatitude, latitude);
    maxLatitude = Math.max(maxLatitude, latitude);
    minLongitude = Math.min(minLongitude, longitude);
    maxLongitude = Math.max(maxLongitude, longitude);
  }

  return [
    [minLatitude, minLongitude],
    [maxLatitude, maxLongitude],
  ];
}
