# Follow Mode & Fit All — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add follow-vehicle mode and fit-all-vehicles button to the real-time tracking map.

**Architecture:** A new `MapController` component (child of `MapContainer`, uses `useMap()`) handles all viewport manipulation. State lives in `DashboardMap` and flows down through props. `VehicleMarker` popup gets a "Seguir" button.

**Tech Stack:** React 19, react-leaflet 5, Leaflet, Next.js 16 (dynamic imports for SSR safety)

**Spec:** `docs/superpowers/specs/2026-03-28-follow-mode-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `web/src/components/map/map-controller.tsx` | Viewport control: follow, drag-cancel, fit-all |
| Modify | `web/src/components/map/vehicle-marker.tsx` | Add `onFollow` prop + "Seguir veículo" button in popup |
| Modify | `web/src/components/map/tracking-map.tsx` | Wire new props, render MapController, pass onFollow |
| Modify | `web/src/app/(dashboard)/dashboard-map.tsx` | State owner, overlay UI (badge, hint, button) |

---

### Task 1: Create MapController

**Files:**
- Create: `web/src/components/map/map-controller.tsx`

- [ ] **Step 1: Create the MapController component**

```tsx
// web/src/components/map/map-controller.tsx
"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
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
  vehicle_name?: string;
  vehicle_model?: string;
};

type MapControllerProps = {
  followedDeviceId: string | null;
  positions: VehiclePosition[];
  fitAllTrigger: number;
  onCancelFollow: () => void;
};

const FOLLOW_ZOOM = 16;
const FITALL_PADDING: L.PointTuple = [50, 50];

export function MapController({
  followedDeviceId,
  positions,
  fitAllTrigger,
  onCancelFollow,
}: MapControllerProps) {
  const map = useMap();
  const prevFollowedId = useRef<string | null>(null);
  const onCancelFollowRef = useRef(onCancelFollow);
  onCancelFollowRef.current = onCancelFollow;

  // Drag cancels follow
  useEffect(() => {
    const handler = () => onCancelFollowRef.current();
    map.on("dragstart", handler);
    return () => {
      map.off("dragstart", handler);
    };
  }, [map]);

  // Follow mode: recenter on position updates
  useEffect(() => {
    if (!followedDeviceId) {
      prevFollowedId.current = null;
      return;
    }

    const pos = positions.find((p) => p.device_id === followedDeviceId);
    if (!pos) return;

    const isNewFollow = prevFollowedId.current !== followedDeviceId;
    const zoom = isNewFollow ? FOLLOW_ZOOM : map.getZoom();

    map.setView([pos.latitude, pos.longitude], zoom, { animate: true });
    prevFollowedId.current = followedDeviceId;
  }, [followedDeviceId, positions, map]);

  // Fit all vehicles
  useEffect(() => {
    if (fitAllTrigger === 0) return;
    if (positions.length === 0) return;

    if (positions.length === 1) {
      map.setView(
        [positions[0].latitude, positions[0].longitude],
        14,
        { animate: true }
      );
      return;
    }

    const bounds = L.latLngBounds(
      positions.map((p) => [p.latitude, p.longitude] as L.LatLngTuple)
    );
    map.fitBounds(bounds, { padding: FITALL_PADDING, animate: true });
  }, [fitAllTrigger, map, positions]);

  return null;
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd web && npx tsc --noEmit src/components/map/map-controller.tsx 2>&1 | head -20`

Note: This may show import errors since it's not wired up yet — that's fine. The important thing is no syntax errors in the file itself.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/map/map-controller.tsx
git commit -m "feat: add MapController component for viewport control"
```

---

### Task 2: Add "Seguir veículo" button to VehicleMarker popup

**Files:**
- Modify: `web/src/components/map/vehicle-marker.tsx`

- [ ] **Step 1: Add onFollow prop and ref to the component**

Change the component signature and add a `useRef` for the marker. Add `useRef` to the import from react:

```tsx
import { useRef } from "react";
```

Change the export:

```tsx
export function VehicleMarker({
  position,
  onFollow,
}: {
  position: VehiclePosition;
  onFollow?: (deviceId: string) => void;
}) {
  const markerRef = useRef<L.Marker>(null);
  const color = getMarkerColor(position);
  const icon = createVehicleIcon(color);

  return (
    <Marker
      ref={markerRef}
      position={[position.latitude, position.longitude]}
      icon={icon}
    >
```

- [ ] **Step 2: Add "Seguir veículo" button at the bottom of the Popup**

After the closing `</div>` of the grid (the one with `gridTemplateColumns`), and before the closing `</div>` of the popup wrapper, add:

```tsx
          {onFollow && (
            <button
              onClick={() => {
                markerRef.current?.closePopup();
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
```

- [ ] **Step 3: Commit**

```bash
git add web/src/components/map/vehicle-marker.tsx
git commit -m "feat: add follow button to vehicle marker popup"
```

---

### Task 3: Wire props through TrackingMap

**Files:**
- Modify: `web/src/components/map/tracking-map.tsx`

- [ ] **Step 1: Add dynamic import for MapController**

After the `VehicleMarkerDynamic` dynamic import (line 45-48), add:

```tsx
const MapControllerDynamic = dynamic(
  () => import("./map-controller").then((m) => m.MapController),
  { ssr: false }
);
```

- [ ] **Step 2: Expand TrackingMapProps**

Replace the existing `TrackingMapProps` type:

```tsx
type TrackingMapProps = {
  positions: VehiclePosition[];
  className?: string;
  followedDeviceId: string | null;
  onFollow: (deviceId: string) => void;
  onCancelFollow: () => void;
  fitAllTrigger: number;
};
```

- [ ] **Step 3: Update the component signature to destructure new props**

```tsx
export function TrackingMap({
  positions,
  className,
  followedDeviceId,
  onFollow,
  onCancelFollow,
  fitAllTrigger,
}: TrackingMapProps) {
```

- [ ] **Step 4: Add MapController and pass onFollow to markers inside MapContainer**

Replace the content inside `<MapContainer>` after `</LayersControl>`:

```tsx
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
```

- [ ] **Step 5: Commit**

```bash
git add web/src/components/map/tracking-map.tsx
git commit -m "feat: wire follow mode and fit-all props through TrackingMap"
```

---

### Task 4: Add state and overlay UI to DashboardMap

**Files:**
- Modify: `web/src/app/(dashboard)/dashboard-map.tsx`

- [ ] **Step 1: Add state and callbacks**

Add `useState` and `useCallback` to the imports:

```tsx
"use client";

import { useState, useCallback } from "react";
import { TrackingMap } from "@/components/map/tracking-map";
import { useRealtimePositions } from "@/lib/hooks/use-realtime-positions";
import type { VehiclePosition } from "@/lib/actions/positions";
```

Inside the `DashboardMap` component, after `const positions = useRealtimePositions(...)`, add:

```tsx
  const [followedDeviceId, setFollowedDeviceId] = useState<string | null>(null);
  const [fitAllTrigger, setFitAllTrigger] = useState(0);

  const handleFollow = useCallback((deviceId: string) => {
    setFollowedDeviceId(deviceId);
  }, []);

  const handleCancelFollow = useCallback(() => {
    setFollowedDeviceId(null);
  }, []);

  const handleFitAll = useCallback(() => {
    setFollowedDeviceId(null);
    setFitAllTrigger((prev) => prev + 1);
  }, []);

  const followedVehicle = followedDeviceId
    ? positions.find((p) => p.device_id === followedDeviceId)
    : null;
```

- [ ] **Step 2: Pass new props to TrackingMap**

Replace the `<TrackingMap>` call:

```tsx
      <TrackingMap
        positions={positions}
        className="w-full h-full"
        followedDeviceId={followedDeviceId}
        onFollow={handleFollow}
        onCancelFollow={handleCancelFollow}
        fitAllTrigger={fitAllTrigger}
      />
```

- [ ] **Step 3: Add follow badge overlay (top-center)**

After `<TrackingMap />` and before the existing vehicle count badge, add:

```tsx
      {followedVehicle && (
        <div
          style={{
            position: "absolute",
            top: 12,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1000,
            background: "#2563eb",
            color: "white",
            borderRadius: 20,
            padding: "8px 20px",
            boxShadow: "0 2px 12px rgba(37,99,235,0.35)",
            fontSize: 14,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 8,
            pointerEvents: "none",
            whiteSpace: "nowrap",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              background: "#60a5fa",
              borderRadius: "50%",
              display: "inline-block",
            }}
          />
          Seguindo: {followedVehicle.vehicle_name || followedVehicle.plate || followedVehicle.device_id} — {followedVehicle.speed.toFixed(0)} km/h
        </div>
      )}
```

- [ ] **Step 4: Add follow hint overlay (bottom-center)**

```tsx
      {followedDeviceId && (
        <div
          style={{
            position: "absolute",
            bottom: 48,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1000,
            background: "rgba(0,0,0,0.6)",
            color: "white",
            borderRadius: 8,
            padding: "4px 14px",
            fontSize: 12,
            pointerEvents: "none",
            whiteSpace: "nowrap",
          }}
        >
          Arraste o mapa para sair do modo follow
        </div>
      )}
```

- [ ] **Step 5: Add "Ver todos" button (bottom-right)**

```tsx
      <button
        onClick={handleFitAll}
        style={{
          position: "absolute",
          bottom: 12,
          right: 12,
          zIndex: 1000,
          background: "white",
          border: "1px solid #d1d5db",
          borderRadius: 8,
          padding: "8px 16px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          fontSize: 13,
          fontWeight: 600,
          color: "#374151",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
        </svg>
        Ver todos
      </button>
```

- [ ] **Step 6: Commit**

```bash
git add web/src/app/\(dashboard\)/dashboard-map.tsx
git commit -m "feat: add follow mode state, overlay UI, and fit-all button"
```

---

### Task 5: Build and verify

- [ ] **Step 1: Run the build**

Run: `cd web && npm run build`

Expected: Build succeeds with no errors.

- [ ] **Step 2: Run lint**

Run: `cd web && npm run lint`

Expected: No new lint errors.

- [ ] **Step 3: Manual verification checklist**

Start dev server: `make web-dev`

Test:
1. Dashboard loads, "Ver todos" button visible bottom-right
2. Click a vehicle marker → popup shows "Seguir veículo" button
3. Click "Seguir" → popup closes, map zooms to 16 and centers, blue badge appears top-center
4. New positions arrive → map re-centers automatically
5. Drag the map → follow mode deactivates, badge disappears
6. Click "Ver todos" → viewport fits all vehicles
7. While following, click "Ver todos" → follow cancels, viewport fits all
8. Test with 0 vehicles → "Ver todos" does nothing, no errors
9. Test with 1 vehicle → "Ver todos" centers on it at zoom 14

- [ ] **Step 4: Final commit (if any fixes needed)**

```bash
git add -u
git commit -m "fix: follow mode adjustments after testing"
```
