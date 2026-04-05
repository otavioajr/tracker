"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { DivIcon } from "leaflet";
import { HistoryMapSummaryStrip } from "@/components/map/history-map-summary-strip";
import { HistoryMissionSidebar } from "@/components/map/history-mission-sidebar";
import { HistoryPlaybackBar } from "@/components/map/history-playback-bar";
import { HistoryQueryToolbar } from "@/components/map/history-query-toolbar";
import { getVehicles } from "@/lib/actions/vehicles";
import { getPositionHistory, VehiclePosition } from "@/lib/actions/positions";
import {
  buildHistoryHighlights,
  buildHistorySummary,
  getPlaybackIntervalMs,
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

  const selectedVehicleLabel =
    vehicles.find((vehicle) => vehicle.id === vehicleId)?.label ?? "";
  const summary = positions.length > 0 ? buildHistorySummary(positions) : null;
  const highlights = positions.length > 0 ? buildHistoryHighlights(positions) : [];
  const currentPosition = positions[currentIndex] ?? null;
  const routeCoords: [number, number][] = positions
    .slice(0, currentIndex + 1)
    .map((position) => [position.latitude, position.longitude]);
  const stopHighlights = highlights.filter((highlight) => highlight.kind === "stop");

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
          label: vehicle.name ? `${vehicle.name} · ${vehicle.plate}` : vehicle.plate,
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
    if (!playing || positions.length === 0) return;

    intervalRef.current = setInterval(() => {
      setCurrentIndex((prev) => {
        if (prev >= positions.length - 1) {
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
  }, [playing, positions.length, playbackSpeed]);

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
      if (data.length === 0) {
        setError("Nenhuma posição encontrada no período");
      } else {
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
    if (positions.length === 0) return;
    if (currentIndex >= positions.length - 1) setCurrentIndex(0);
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
    if (index < 0 || index >= positions.length) return;
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

        <div className="relative min-h-[420px] overflow-hidden rounded-xl border bg-muted/20">
          {selectedVehicleLabel ? (
            <div className="pointer-events-none absolute left-3 top-3 z-[500] rounded-full border border-border/70 bg-background/90 px-3 py-1 text-xs font-medium text-foreground shadow-sm backdrop-blur">
              {selectedVehicleLabel}
            </div>
          ) : null}

          {!mounted ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#f3f4f6",
                height: "100%",
                minHeight: 420,
                color: "#6b7280",
                fontSize: 14,
              }}
            >
              Carregando mapa...
            </div>
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
                key={fitVersion}
                center={
                  currentPosition
                    ? [currentPosition.latitude, currentPosition.longitude]
                    : null
                }
              />

              {routeCoords.length > 1 ? (
                <Polyline positions={routeCoords} color="#3b82f6" weight={3} />
              ) : null}

              {stopHighlights.map((highlight) => (
                <CircleMarkerDynamic
                  key={`${highlight.kind}-${highlight.index}-${highlight.timestamp}`}
                  center={[highlight.latitude, highlight.longitude]}
                  radius={currentIndex === highlight.index ? 8 : 6}
                  pathOptions={{
                    color: "#f59e0b",
                    fillColor: "#f59e0b",
                    fillOpacity: 0.9,
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

        <HistoryMapSummaryStrip summary={summary} loading={loading} />

        <HistoryPlaybackBar
          playing={playing}
          currentIndex={currentIndex}
          totalPoints={positions.length}
          speed={playbackSpeed}
          currentTimestamp={currentPosition?.server_time ?? null}
          onPlay={handlePlay}
          onPause={handlePause}
          onReset={handleReset}
          onSeek={handleSeek}
          onSpeedChange={setPlaybackSpeed}
        />
      </div>

      <HistoryMissionSidebar
        summary={summary}
        highlights={highlights}
        currentPosition={currentPosition}
        loading={loading}
        hasSearched={hasSearched}
        onHighlightSelect={handleHighlightSelect}
      />
    </div>
  );
}
