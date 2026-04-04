"use client";

import { useRef } from "react";
import { Marker, Popup } from "react-leaflet";
import L from "leaflet";
import type { VehiclePosition } from "./types";

function getMarkerColor(position: VehiclePosition): string {
  const lastSeen = new Date(position.server_time);
  const minutesAgo = (Date.now() - lastSeen.getTime()) / 1000 / 60;

  if (minutesAgo > 30) return "#ef4444"; // red — no signal
  if (position.ignition && position.speed > 2) return "#22c55e"; // green — moving
  if (position.ignition) return "#eab308"; // yellow — ignition on but stopped
  return "#6b7280"; // gray — ignition off
}

function createVehicleIcon(color: string, selected: boolean): L.DivIcon {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="38" height="50" viewBox="0 0 38 50">
      ${
        selected
          ? `<circle cx="19" cy="19" r="18" fill="rgba(19, 211, 146, 0.18)" stroke="rgba(19, 211, 146, 0.9)" stroke-width="1.5"/>`
          : ""
      }
      <g transform="translate(3, 3)">
      <polygon points="10,30 22,30 16,42" fill="${color}" opacity="0.9"/>
      <circle cx="16" cy="16" r="14" fill="${color}" stroke="white" stroke-width="2" opacity="0.9"/>
      <g transform="translate(8, 8)" fill="white">
        <path d="M14 6H2C1.4 6 1 6.4 1 7v8c0 .6.4 1 1 1h1v1.5c0 .3.2.5.5.5h1c.3 0 .5-.2.5-.5V16h8v1.5c0 .3.2.5.5.5h1c.3 0 .5-.2.5-.5V16h1c.6 0 1-.4 1-1V7c0-.6-.4-1-1-1zM4 13.5c-.8 0-1.5-.7-1.5-1.5S3.2 10.5 4 10.5s1.5.7 1.5 1.5-.7 1.5-1.5 1.5zm8 0c-.8 0-1.5-.7-1.5-1.5s.7-1.5 1.5-1.5 1.5.7 1.5 1.5-.7 1.5-1.5 1.5zm2-5H2V8l1.5-1.5h9L14 8v.5z"/>
      </g>
      </g>
    </svg>
  `;

  return L.divIcon({
    html: svg,
    className: "",
    iconSize: [38, 50],
    iconAnchor: [19, 45],
    popupAnchor: [0, -34],
  });
}

function formatTimestamp(isoString: string): string {
  try {
    return new Date(isoString).toLocaleString("pt-BR");
  } catch {
    return isoString;
  }
}

export function VehicleMarker({
  position,
  selected = false,
  onSelect,
  onFollow,
}: {
  position: VehiclePosition;
  selected?: boolean;
  onSelect?: (deviceId: string) => void;
  onFollow?: (deviceId: string) => void;
}) {
  const markerRef = useRef<L.Marker>(null);
  const color = getMarkerColor(position);
  const icon = createVehicleIcon(color, selected);

  return (
    <Marker
      ref={markerRef}
      position={[position.latitude, position.longitude]}
      icon={icon}
      eventHandlers={
        onSelect
          ? {
              click: () => onSelect(position.device_id),
            }
          : undefined
      }
    >
      <Popup>
        <div style={{ minWidth: 160, fontFamily: "sans-serif", fontSize: 13 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>
            {position.vehicle_name
              ? `${position.vehicle_name} - ${position.plate ?? position.device_id}`
              : position.plate ?? position.device_id}
          </div>
          {position.vehicle_model && (
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>
              {position.vehicle_model}
            </div>
          )}
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
          {onFollow && (
            <button
              onClick={() => {
                markerRef.current?.closePopup();
                onSelect?.(position.device_id);
                onFollow(position.device_id);
              }}
              style={{
                marginTop: 8,
                width: "100%",
                padding: "7px 0",
                background: "#3b82f6",
                color: "white",
                border: "none",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
              </svg>
              Seguir veículo
            </button>
          )}
        </div>
      </Popup>
    </Marker>
  );
}
