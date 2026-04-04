"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { getVehicles } from "@/lib/actions/vehicles";
import { getPositionHistory, VehiclePosition } from "@/lib/actions/positions";

const SAO_PAULO: [number, number] = [-23.55, -46.63];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _historyIcon: any = null;

function createHistoryIcon() {
  if (_historyIcon) return _historyIcon;
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy require: top-level leaflet import breaks SSR
  const L = require("leaflet") as typeof import("leaflet").default;
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

  _historyIcon = L.divIcon({
    html: svg,
    className: "",
    iconSize: [32, 44],
    iconAnchor: [16, 42],
    popupAnchor: [0, -34],
  });
  return _historyIcon;
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
};

export function HistoryPlayer() {
  const [mounted, setMounted] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [positions, setPositions] = useState<VehiclePosition[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setMounted(true);
    getVehicles()
      .then((data) => {
        setVehicles((data as Vehicle[]) ?? []);
        if (data && data.length > 0) setVehicleId(data[0].id);
      })
      .catch(() => setError("Erro ao carregar veiculos"));
  }, []);

  useEffect(() => {
    if (playing) {
      intervalRef.current = setInterval(() => {
        setCurrentIndex((prev) => {
          if (prev >= positions.length - 1) {
            setPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 200);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [playing, positions.length]);

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
      // datetime-local returns "2026-03-18T10:00" without timezone
      // Convert to ISO with local timezone offset for correct UTC comparison
      const start = new Date(startDate).toISOString();
      const end = new Date(endDate).toISOString();
      const data = await getPositionHistory(vehicleId, start, end);
      setPositions(data);
      if (data.length === 0) setError("Nenhuma posicao encontrada no periodo");
    } catch {
      setError("Erro ao buscar historico");
    } finally {
      setLoading(false);
    }
  }

  function handlePlay() {
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

  const currentPos = positions[currentIndex] ?? null;

  const routeCoords: [number, number][] = positions
    .slice(0, currentIndex + 1)
    .map((p) => [p.latitude, p.longitude]);

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-muted-foreground">
            Veiculo
          </label>
          <select
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.plate}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-muted-foreground">
            Inicio
          </label>
          <input
            type="datetime-local"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-muted-foreground">
            Fim
          </label>
          <input
            type="datetime-local"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <button
          onClick={handleSearch}
          disabled={loading}
          className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium shadow-sm hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? "Buscando..." : "Buscar"}
        </button>
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {/* Map */}
      <div className="flex-1 min-h-[400px] rounded-lg overflow-hidden border">
        {!mounted ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#f3f4f6",
              height: "100%",
              minHeight: 400,
              color: "#6b7280",
              fontSize: 14,
            }}
          >
            Carregando mapa...
          </div>
        ) : (
          <MapContainer
            center={SAO_PAULO}
            zoom={14}
            style={{ width: "100%", height: "100%", minHeight: 400 }}
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
                  attribution='&copy; Esri'
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
              center={currentPos ? [currentPos.latitude, currentPos.longitude] : null}
            />
            {routeCoords.length > 1 && (
              <Polyline positions={routeCoords} color="#3b82f6" weight={3} />
            )}
            {currentPos && (
              <MarkerDynamic
                position={[currentPos.latitude, currentPos.longitude]}
                icon={createHistoryIcon()}
              />
            )}
          </MapContainer>
        )}
      </div>

      {/* Playback controls */}
      {positions.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={handlePlay}
              disabled={playing || positions.length === 0}
              className="h-8 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              Play
            </button>
            <button
              onClick={handlePause}
              disabled={!playing}
              className="h-8 px-4 rounded-md border border-input bg-background text-sm font-medium hover:bg-accent disabled:opacity-50"
            >
              Pause
            </button>
            <button
              onClick={handleReset}
              className="h-8 px-4 rounded-md border border-input bg-background text-sm font-medium hover:bg-accent"
            >
              Reset
            </button>
            <span className="text-sm text-muted-foreground ml-2">
              {currentIndex + 1} / {positions.length}
            </span>
          </div>

          {currentPos && (
            <div className="flex gap-6 text-sm text-muted-foreground bg-muted/40 rounded-md px-4 py-2">
              <span>
                <span className="font-medium text-foreground">Hora:</span>{" "}
                {new Date(currentPos.server_time).toLocaleString("pt-BR")}
              </span>
              <span>
                <span className="font-medium text-foreground">Velocidade:</span>{" "}
                {currentPos.speed} km/h
              </span>
              <span>
                <span className="font-medium text-foreground">Ignicao:</span>{" "}
                {currentPos.ignition ? "Ligada" : "Desligada"}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
