"use client";

import { Marker, Popup } from "react-leaflet";
import L from "leaflet";

type VehiclePosition = {
  device_id: string;
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
  ignition: boolean;
  device_time: string;
  server_time: string;
  plate?: string;
};

function getMarkerColor(position: VehiclePosition): string {
  const lastSeen = new Date(position.server_time);
  const minutesAgo = (Date.now() - lastSeen.getTime()) / 1000 / 60;

  if (minutesAgo > 30) return "#ef4444"; // red — no signal
  if (position.ignition && position.speed > 2) return "#22c55e"; // green — moving
  if (position.ignition) return "#eab308"; // yellow — ignition on but stopped
  return "#6b7280"; // gray — ignition off
}

function createVehicleIcon(color: string): L.DivIcon {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="14" fill="${color}" stroke="white" stroke-width="2" opacity="0.9"/>
      <g transform="translate(8, 8)" fill="white">
        <path d="M14 6H2C1.4 6 1 6.4 1 7v8c0 .6.4 1 1 1h1v1.5c0 .3.2.5.5.5h1c.3 0 .5-.2.5-.5V16h8v1.5c0 .3.2.5.5.5h1c.3 0 .5-.2.5-.5V16h1c.6 0 1-.4 1-1V7c0-.6-.4-1-1-1zM4 13.5c-.8 0-1.5-.7-1.5-1.5S3.2 10.5 4 10.5s1.5.7 1.5 1.5-.7 1.5-1.5 1.5zm8 0c-.8 0-1.5-.7-1.5-1.5s.7-1.5 1.5-1.5 1.5.7 1.5 1.5-.7 1.5-1.5 1.5zm2-5H2V8l1.5-1.5h9L14 8v.5z"/>
      </g>
    </svg>
  `;

  return L.divIcon({
    html: svg,
    className: "",
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18],
  });
}

function formatTimestamp(isoString: string): string {
  try {
    return new Date(isoString).toLocaleString("pt-BR");
  } catch {
    return isoString;
  }
}

export function VehicleMarker({ position }: { position: VehiclePosition }) {
  const color = getMarkerColor(position);
  const icon = createVehicleIcon(color);

  return (
    <Marker
      position={[position.latitude, position.longitude]}
      icon={icon}
    >
      <Popup>
        <div style={{ minWidth: 160, fontFamily: "sans-serif", fontSize: 13 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>
            {position.plate ?? position.device_id}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px 8px" }}>
            <span style={{ color: "#6b7280" }}>Velocidade:</span>
            <span>{position.speed.toFixed(0)} km/h</span>
            <span style={{ color: "#6b7280" }}>Ignição:</span>
            <span style={{ color: position.ignition ? "#22c55e" : "#ef4444" }}>
              {position.ignition ? "Ligada" : "Desligada"}
            </span>
            <span style={{ color: "#6b7280" }}>Atualizado:</span>
            <span>{formatTimestamp(position.server_time)}</span>
          </div>
        </div>
      </Popup>
    </Marker>
  );
}
