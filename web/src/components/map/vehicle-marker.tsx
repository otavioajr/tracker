"use client";

import { Marker } from "react-leaflet";
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

export function VehicleMarker({
  position,
  selected = false,
  onSelect,
}: {
  position: VehiclePosition;
  selected?: boolean;
  onSelect?: (deviceId: string) => void;
  onFollow?: (deviceId: string) => void;
}) {
  const color = getMarkerColor(position);
  const icon = createVehicleIcon(color, selected);

  return (
    <Marker
      position={[position.latitude, position.longitude]}
      icon={icon}
      eventHandlers={
        onSelect
          ? {
              click: () => onSelect(position.device_id),
            }
          : undefined
      }
    />
  );
}
