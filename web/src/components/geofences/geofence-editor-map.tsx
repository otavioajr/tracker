"use client";

import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";

import { useEffect } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "@geoman-io/leaflet-geoman-free";

import {
  circleToPolygon,
  isClosedRing,
} from "@/lib/geofences/shape-utils";
import type { LngLat, ShapeInput, GeofenceShape } from "@/lib/geofences/types";

type InitialShape =
  | { shape_type: "polygon" | "rectangle"; coordinates: LngLat[] }
  | { shape_type: "circle"; center: LngLat; radiusM: number };

type Props = {
  mode: "create" | "edit-shape";
  initialShape?: InitialShape;
  center: [number, number];
  zoom?: number;
  onShapeChange: (shape: ShapeInput | null) => void;
};

export function GeofenceEditorMap({
  mode,
  initialShape,
  center,
  zoom = 13,
  onShapeChange,
}: Props) {
  return (
    <MapContainer
      center={center}
      zoom={zoom}
      style={{ width: "100%", height: "100%", minHeight: 400 }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <GeomanController
        mode={mode}
        initialShape={initialShape}
        onShapeChange={onShapeChange}
      />
    </MapContainer>
  );
}

function GeomanController({
  mode,
  initialShape,
  onShapeChange,
}: {
  mode: "create" | "edit-shape";
  initialShape?: InitialShape;
  onShapeChange: (shape: ShapeInput | null) => void;
}) {
  const map = useMap();

  useEffect(() => {
    const pm = (map as L.Map & { pm: any }).pm;
    if (!pm) return;

    pm.setLang("pt_br" as never);

    if (mode === "create") {
      pm.addControls({
        position: "topleft",
        drawMarker: false,
        drawCircleMarker: false,
        drawPolyline: false,
        drawText: false,
        cutPolygon: false,
        rotateMode: false,
        dragMode: false,
        drawPolygon: true,
        drawRectangle: true,
        drawCircle: true,
        editMode: false,
        removalMode: true,
      });
    } else {
      pm.addControls({
        position: "topleft",
        drawMarker: false,
        drawCircleMarker: false,
        drawPolyline: false,
        drawText: false,
        drawPolygon: false,
        drawRectangle: false,
        drawCircle: false,
        cutPolygon: false,
        rotateMode: false,
        dragMode: true,
        editMode: true,
        removalMode: false,
      });
    }

    const drawnLayerRef: { current: L.Layer | null } = { current: null };

    const pushShape = (layer: L.Layer, shapeType: GeofenceShape) => {
      if (shapeType === "circle" && layer instanceof L.Circle) {
        const ll = layer.getLatLng();
        const radiusM = layer.getRadius();
        const center: LngLat = [ll.lng, ll.lat];
        const polygon = circleToPolygon({ center, radiusM });
        onShapeChange({ kind: "circle", center, radiusM, polygon });
        return;
      }
      if (layer instanceof L.Polygon) {
        const raw = layer.getLatLngs();
        const ring = Array.isArray(raw[0]) ? (raw[0] as L.LatLng[]) : (raw as L.LatLng[]);
        const coords: LngLat[] = ring.map((ll) => [ll.lng, ll.lat]);
        if (!isClosedRing(coords)) coords.push(coords[0]);
        onShapeChange({ kind: shapeType === "rectangle" ? "rectangle" : "polygon", coordinates: coords });
      }
    };

    if (mode === "edit-shape" && initialShape) {
      let layer: L.Layer;
      if (initialShape.shape_type === "circle") {
        const latlng = L.latLng(initialShape.center[1], initialShape.center[0]);
        layer = L.circle(latlng, { radius: initialShape.radiusM }).addTo(map);
      } else {
        const latlngs = initialShape.coordinates.map(([lng, lat]) => L.latLng(lat, lng));
        layer = L.polygon(latlngs).addTo(map);
      }
      drawnLayerRef.current = layer;
      (layer as L.Layer & { pm: any }).pm.enable({ allowSelfIntersection: false });

      map.fitBounds((layer as L.Polygon | L.Circle).getBounds(), { padding: [40, 40] });

      pushShape(layer, initialShape.shape_type);
    }

    const onCreate = (e: any) => {
      if (drawnLayerRef.current) {
        map.removeLayer(drawnLayerRef.current);
      }
      drawnLayerRef.current = e.layer as L.Layer;
      const shapeType: GeofenceShape =
        e.shape === "Circle" ? "circle" : e.shape === "Rectangle" ? "rectangle" : "polygon";
      pushShape(e.layer, shapeType);
    };

    const onEdit = (e: any) => {
      const layer = e.layer ?? e.target;
      if (!layer) return;
      const shapeType: GeofenceShape =
        layer instanceof L.Circle
          ? "circle"
          : layer.pm?._shape === "Rectangle"
            ? "rectangle"
            : "polygon";
      pushShape(layer, shapeType);
    };

    const onRemove = () => {
      drawnLayerRef.current = null;
      onShapeChange(null);
    };

    map.on("pm:create", onCreate);
    map.on("pm:edit", onEdit);
    map.on("pm:remove", onRemove);

    return () => {
      map.off("pm:create", onCreate);
      map.off("pm:edit", onEdit);
      map.off("pm:remove", onRemove);
      pm.removeControls();
      if (drawnLayerRef.current) {
        map.removeLayer(drawnLayerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, mode]);

  return null;
}
