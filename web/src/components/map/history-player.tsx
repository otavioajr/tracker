"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { getVehicles } from "@/lib/actions/vehicles";
import { getPositionHistory, VehiclePosition } from "@/lib/actions/positions";

const SAO_PAULO: [number, number] = [-23.55, -46.63];

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

const CircleMarker = dynamic(
  () => import("react-leaflet").then((m) => m.CircleMarker),
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

  const mapCenter: [number, number] =
    currentPos
      ? [currentPos.latitude, currentPos.longitude]
      : positions.length > 0
      ? [positions[0].latitude, positions[0].longitude]
      : SAO_PAULO;

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
            key={mapCenter.join(",")}
            center={mapCenter}
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
            {routeCoords.length > 1 && (
              <Polyline positions={routeCoords} color="#3b82f6" weight={3} />
            )}
            {currentPos && (
              <CircleMarker
                center={[currentPos.latitude, currentPos.longitude]}
                radius={8}
                pathOptions={{ color: "#ef4444", fillColor: "#ef4444", fillOpacity: 1 }}
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
                {new Date(currentPos.device_time).toLocaleString("pt-BR")}
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
