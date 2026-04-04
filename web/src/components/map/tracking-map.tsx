"use client";

import "leaflet/dist/leaflet.css";
import dynamic from "next/dynamic";

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
  vehicle_name?: string;
  vehicle_model?: string;
};

const SAO_PAULO: [number, number] = [-23.55, -46.63];

const MapContainer = dynamic(
  () => import("react-leaflet").then((m) => m.MapContainer),
  { ssr: false }
);

const TileLayer = dynamic(
  () => import("react-leaflet").then((m) => m.TileLayer),
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

const VehicleMarkerDynamic = dynamic(
  () => import("./vehicle-marker").then((m) => m.VehicleMarker),
  { ssr: false }
);

const MapControllerDynamic = dynamic(
  () => import("./map-controller").then((m) => m.MapController),
  { ssr: false }
);

type TrackingMapProps = {
  positions: VehiclePosition[];
  className?: string;
  followedDeviceId: string | null;
  onFollow: (deviceId: string) => void;
  onCancelFollow: () => void;
  fitAllTrigger: number;
};

export function TrackingMap({
  positions,
  className,
  followedDeviceId,
  onFollow,
  onCancelFollow,
  fitAllTrigger,
}: TrackingMapProps) {
  const center: [number, number] =
    positions.length > 0
      ? [positions[0].latitude, positions[0].longitude]
      : SAO_PAULO;

  return (
    <MapContainer
      center={center}
      zoom={12}
      style={{ width: "100%", height: "100%", minHeight: 400 }}
      className={className}
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
      <MapControllerDynamic
        followedDeviceId={followedDeviceId}
        positions={positions}
        fitAllTrigger={fitAllTrigger}
        onCancelFollow={onCancelFollow}
      />
      {positions.map((pos) => (
        <VehicleMarkerDynamic
          key={pos.device_id}
          position={pos}
          onFollow={onFollow}
        />
      ))}
    </MapContainer>
  );
}
