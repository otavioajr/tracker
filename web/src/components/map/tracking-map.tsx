"use client";

import "leaflet/leaflet.css";
import { useRef } from "react";
import dynamic from "next/dynamic";
import type { DashboardVehicleTrail, VehiclePosition } from "./types";
import {
  DEFAULT_MAP_BASE_LAYER,
  type MapBaseLayer,
} from "@/lib/map/map-base-layer";
import type { GeofenceRow } from "@/lib/geofences/types";

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

const MapRotationControllerDynamic = dynamic(
  () =>
    import("./map-rotation-controller").then((m) => m.MapRotationController),
  { ssr: false }
);

const VehicleTrailLayerDynamic = dynamic(
  () => import("./vehicle-trail-layer").then((m) => m.VehicleTrailLayer),
  { ssr: false }
);

const BaseLayerListenerDynamic = dynamic(
  () => import("./base-layer-listener").then((m) => m.BaseLayerListener),
  { ssr: false }
);

const GeofenceLayerDynamic = dynamic(
  () => import("@/components/geofences/geofence-layer").then((m) => m.GeofenceLayer),
  { ssr: false }
);

export type TrackingMapProps = {
  positions: VehiclePosition[];
  trails: DashboardVehicleTrail[];
  className?: string;
  selectedDeviceId: string | null;
  followedDeviceId: string | null;
  onSelect: (deviceId: string) => void;
  onFollow: (deviceId: string) => void;
  onCancelFollow: () => void;
  fitAllTrigger: number;
  rotationEnabled: boolean;
  onBearingChange: (bearing: number) => void;
  resetRotationTrigger: number;
  initialBaseLayer?: MapBaseLayer;
  onBaseLayerChange?: (baseLayer: MapBaseLayer) => void;
  geofences: GeofenceRow[];
  showGeofences: boolean;
  onShowGeofencesChange: (visible: boolean) => void;
};

export function TrackingMap({
  positions,
  trails,
  className,
  selectedDeviceId,
  followedDeviceId,
  onSelect,
  onFollow,
  onCancelFollow,
  fitAllTrigger,
  rotationEnabled,
  onBearingChange,
  resetRotationTrigger,
  initialBaseLayer = DEFAULT_MAP_BASE_LAYER,
  onBaseLayerChange,
  geofences,
  showGeofences,
  onShowGeofencesChange,
}: TrackingMapProps) {
  const activeBaseLayer: MapBaseLayer = initialBaseLayer;
  const handleBaseLayerChange = (name: string) => {
    if (!onBaseLayerChange) return;
    if (name === "Ruas" || name === "Detalhado" || name === "Satelite" || name === "Escuro") {
      onBaseLayerChange(name);
    }
  };
  const center: [number, number] =
    positions.length > 0
      ? [positions[0].latitude, positions[0].longitude]
      : SAO_PAULO;

  const rotationInteractionRef = useRef({ isRotating: false });

  return (
    <div className="relative" style={{ width: "100%", height: "100%", minHeight: 400 }}>
      <MapContainer
        center={center}
        zoom={12}
        style={{ width: "100%", height: "100%", minHeight: 400 }}
        className={className}
        {...({ rotate: rotationEnabled } as Record<string, unknown>)}
      >
      <LayersControl position="topright">
        <LayersControlBaseLayer checked={activeBaseLayer === "Ruas"} name="Ruas">
          <TileLayer
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          />
        </LayersControlBaseLayer>
        <LayersControlBaseLayer checked={activeBaseLayer === "Detalhado"} name="Detalhado">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        </LayersControlBaseLayer>
        <LayersControlBaseLayer checked={activeBaseLayer === "Satelite"} name="Satelite">
          <TileLayer
            attribution='&copy; Esri'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          />
        </LayersControlBaseLayer>
        <LayersControlBaseLayer checked={activeBaseLayer === "Escuro"} name="Escuro">
          <TileLayer
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
        </LayersControlBaseLayer>
      </LayersControl>
      <BaseLayerListenerDynamic onChange={handleBaseLayerChange} />
      {showGeofences && <GeofenceLayerDynamic geofences={geofences} />}
      <MapControllerDynamic
        followedDeviceId={followedDeviceId}
        positions={positions}
        fitAllTrigger={fitAllTrigger}
        onCancelFollow={onCancelFollow}
        interactionStateRef={rotationInteractionRef}
      />
      <MapRotationControllerDynamic
        enabled={rotationEnabled}
        resetRotationTrigger={resetRotationTrigger}
        interactionStateRef={rotationInteractionRef}
        onBearingChange={onBearingChange}
      />
      {trails.map((trail) => (
        <VehicleTrailLayerDynamic key={trail.deviceId} trail={trail} />
      ))}
      {positions.map((pos) => (
        <VehicleMarkerDynamic
          key={pos.device_id}
          position={pos}
          selected={pos.device_id === selectedDeviceId}
          onSelect={onSelect}
          onFollow={onFollow}
        />
      ))}
      </MapContainer>
      <label
        className="absolute right-3 top-[210px] z-[500] flex items-center gap-1.5 rounded-md border border-border bg-background/95 px-2 py-1.5 text-xs font-medium shadow-md cursor-pointer hover:bg-muted"
        title="Mostrar geocercas no mapa"
      >
        <input
          type="checkbox"
          checked={showGeofences}
          onChange={(e) => onShowGeofencesChange(e.target.checked)}
          className="h-3.5 w-3.5 cursor-pointer"
        />
        Geocercas
      </label>
    </div>
  );
}
