# History Player Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the red circle marker with a car waypoint icon and eliminate map flickering during history playback.

**Architecture:** All changes in a single file (`history-player.tsx`). Add a `createHistoryIcon()` function for the SVG waypoint marker, and a `HistoryMapController` component that uses `map.setView()` with animation instead of the destructive `key`-based MapContainer remount.

**Tech Stack:** React, react-leaflet (`useMap`, `Marker`), Leaflet (`L.DivIcon`), Next.js dynamic imports

---

### Task 1: Add `createHistoryIcon()` function and swap the marker

**Files:**
- Modify: `web/src/components/map/history-player.tsx`

- [ ] **Step 1: Add dynamic import for `Marker` and remove `CircleMarker`**

Replace the `CircleMarker` dynamic import with `Marker`:

```typescript
// REMOVE this block (lines 25-28):
const CircleMarker = dynamic(
  () => import("react-leaflet").then((m) => m.CircleMarker),
  { ssr: false }
);

// ADD this block in its place:
const MarkerDynamic = dynamic(
  () => import("react-leaflet").then((m) => m.Marker),
  { ssr: false }
);
```

- [ ] **Step 2: Add `createHistoryIcon()` function**

Add this function after the `SAO_PAULO` constant (after line 8), before the dynamic imports.

**Important:** `HistoryPlayer` is imported directly (not dynamically) from the page, so we CANNOT use `import L from "leaflet"` at the top level — leaflet accesses `window` on import and would break SSR. Use lazy `require` inside the function instead, and cache the icon instance.

```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _historyIcon: any = null;

function createHistoryIcon() {
  if (_historyIcon) return _historyIcon;
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
```

Note: The SVG reuses the exact car path from `vehicle-marker.tsx`. The triangle polygon sits below the circle, creating the pin/waypoint effect. `iconAnchor: [16, 42]` points to the tip of the triangle. The icon is cached in `_historyIcon` to avoid recreating it on every render.

- [ ] **Step 3: Replace `CircleMarker` usage with `Marker` using the new icon**

In the JSX, replace the CircleMarker block (lines 252-258):

```tsx
// REMOVE:
{currentPos && (
  <CircleMarker
    center={[currentPos.latitude, currentPos.longitude]}
    radius={8}
    pathOptions={{ color: "#ef4444", fillColor: "#ef4444", fillOpacity: 1 }}
  />
)}

// REPLACE WITH:
{currentPos && (
  <MarkerDynamic
    position={[currentPos.latitude, currentPos.longitude]}
    icon={createHistoryIcon()}
  />
)}
```

- [ ] **Step 4: Verify the marker renders correctly**

Run: `cd web && npm run dev`

Open http://localhost:3000, navigate to Histórico, search for a vehicle's history. Confirm:
- The red circle is gone
- A green car icon with a pin/pointer arrow appears at the current position
- The tip of the arrow points to the exact location on the map

- [ ] **Step 5: Commit**

```bash
git add web/src/components/map/history-player.tsx
git commit -m "feat(history): replace circle marker with car waypoint icon"
```

---

### Task 2: Add `HistoryMapController` and remove flickering

**Files:**
- Modify: `web/src/components/map/history-player.tsx`

- [ ] **Step 1: Add dynamic import for the controller component**

The `HistoryMapController` uses `useMap()` which must run inside `MapContainer`. Since we use dynamic imports for SSR safety, we need to create the component and import `useMap` properly.

Add this after the existing dynamic imports:

```typescript
const HistoryMapControllerDynamic = dynamic(
  () => import("./history-map-controller").then((m) => m.HistoryMapController),
  { ssr: false }
);
```

- [ ] **Step 2: Create `history-map-controller.tsx`**

Create file `web/src/components/map/history-map-controller.tsx`:

```typescript
"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";

const INITIAL_ZOOM = 15;

export function HistoryMapController({
  center,
}: {
  center: [number, number] | null;
}) {
  const map = useMap();
  const isFirstView = useRef(true);

  useEffect(() => {
    if (!center) return;

    if (isFirstView.current) {
      map.setView(center, INITIAL_ZOOM, { animate: false });
      isFirstView.current = false;
      return;
    }

    map.setView(center, map.getZoom(), { animate: true });
  }, [center, map]);

  // Reset first-view flag when center becomes null (new search)
  useEffect(() => {
    if (!center) {
      isFirstView.current = true;
    }
  }, [center]);

  return null;
}
```

Note: Separate file because `useMap()` must be imported directly (not via `next/dynamic` re-export), and it keeps the component focused. The `isFirstView` ref ensures the first position sets zoom to 15, and subsequent updates preserve the user's zoom level.

- [ ] **Step 3: Remove `key` from MapContainer and add the controller**

In the JSX, modify the `MapContainer`:

```tsx
// REMOVE the key prop from MapContainer (line 218):
// Before:
<MapContainer
  key={mapCenter.join(",")}
  center={mapCenter}
  zoom={14}
  style={{ width: "100%", height: "100%", minHeight: 400 }}
>

// After:
<MapContainer
  center={SAO_PAULO}
  zoom={14}
  style={{ width: "100%", height: "100%", minHeight: 400 }}
>
```

The `center` is now `SAO_PAULO` (only used for initial render). All subsequent view changes go through the controller.

- [ ] **Step 4: Add `HistoryMapControllerDynamic` inside MapContainer**

Add the controller component right after the `LayersControl` closing tag and before the Polyline:

```tsx
<HistoryMapControllerDynamic
  center={currentPos ? [currentPos.latitude, currentPos.longitude] : null}
/>
```

The full MapContainer JSX should now be:

```tsx
<MapContainer
  center={SAO_PAULO}
  zoom={14}
  style={{ width: "100%", height: "100%", minHeight: 400 }}
>
  <LayersControl position="topright">
    {/* ... BaseLayer tiles unchanged ... */}
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
```

- [ ] **Step 5: Remove unused `mapCenter` variable**

The `mapCenter` variable (lines 134-139) is no longer needed since the controller handles positioning. Remove it:

```typescript
// REMOVE these lines:
const mapCenter: [number, number] =
  currentPos
    ? [currentPos.latitude, currentPos.longitude]
    : positions.length > 0
    ? [positions[0].latitude, positions[0].longitude]
    : SAO_PAULO;
```

- [ ] **Step 6: Verify smooth playback**

Run: `cd web && npm run dev`

Open http://localhost:3000, navigate to Histórico, search for a vehicle with history data. Press Play and confirm:
- No flickering or flashing during playback
- The map smoothly follows the vehicle marker
- Tiles don't reload each frame
- Zoom level is preserved when user zooms in/out during playback
- The car waypoint icon moves smoothly along the route
- The polyline grows correctly behind the marker

- [ ] **Step 7: Commit**

```bash
git add web/src/components/map/history-map-controller.tsx web/src/components/map/history-player.tsx
git commit -m "feat(history): smooth camera playback without flickering"
```

---

### Task 3: Final verification and cleanup

**Files:**
- Verify: `web/src/components/map/history-player.tsx`
- Verify: `web/src/components/map/history-map-controller.tsx`

- [ ] **Step 1: Run the linter**

Run: `cd web && npm run lint`

Expected: No errors related to the changed files.

- [ ] **Step 2: Run production build**

Run: `cd web && npm run build`

Expected: Build succeeds without errors.

- [ ] **Step 3: End-to-end manual test**

Open the app and run through:
1. Go to Histórico
2. Select a vehicle, set date range, click Buscar
3. Confirm car waypoint icon (green car + arrow) appears at first position
4. Click Play — confirm smooth animation, no flicker
5. Zoom in/out during playback — confirm zoom is preserved
6. Click Pause, then Play — confirm resume works
7. Click Reset — confirm returns to first position
8. Search again with different dates — confirm map recenters to new first position
