# Plan 4: Web Features — Map, Alerts, Reports & PWA

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real-time map tracking, route history, geofence management, alerts feed, reports, and PWA support to the vehicle tracking platform.

**Architecture:** Leaflet map with dynamic import (no SSR). Supabase Realtime subscriptions for live position updates. Server actions for data queries. All pages inside the existing `(dashboard)` route group with sidebar navigation.

**Tech Stack:** Next.js 16, Leaflet 1.9 + react-leaflet 5, Supabase Realtime, Tailwind CSS, shadcn/ui (base-ui)

**Spec:** `docs/superpowers/specs/2026-03-17-vehicle-tracker-design.md`

**IMPORTANT patterns from existing code:**
- Dialogs use base-ui: `DialogTrigger render={<Button />}` (NOT `asChild`)
- Server actions in `web/src/lib/actions/`
- `getTenantId()` from `@/lib/actions/utils` for tenant-scoped inserts
- Supabase client from `@/lib/supabase/client` (browser) or `server` (SSR)

---

## File Structure

```
web/src/
├── app/(dashboard)/
│   ├── page.tsx                        # MODIFY — replace stats with map
│   ├── history/page.tsx                # CREATE — route history/replay
│   ├── geofences/page.tsx              # CREATE — geofence management
│   ├── alerts/page.tsx                 # CREATE — alerts feed + rules
│   └── reports/page.tsx                # CREATE — trips, stops, mileage
├── components/
│   ├── map/
│   │   ├── tracking-map.tsx            # CREATE — Leaflet map wrapper (dynamic)
│   │   ├── vehicle-marker.tsx          # CREATE — marker with popup
│   │   └── history-player.tsx          # CREATE — route replay controls
│   ├── geofences/
│   │   ├── geofence-table.tsx          # CREATE
│   │   └── geofence-dialog.tsx         # CREATE
│   ├── alerts/
│   │   ├── alert-feed.tsx              # CREATE
│   │   └── alert-rule-table.tsx        # CREATE
│   └── reports/
│       └── report-view.tsx             # CREATE
├── lib/
│   ├── actions/
│   │   ├── positions.ts               # CREATE — position queries
│   │   ├── geofences.ts               # CREATE — geofence CRUD
│   │   ├── alerts.ts                   # CREATE — alerts + rules
│   │   └── reports.ts                  # CREATE — report queries
│   └── hooks/
│       └── use-realtime-positions.ts   # CREATE — Supabase Realtime hook
└── public/
    └── manifest.json                   # CREATE — PWA manifest
```

---

### Task 1: Leaflet Map Component (Dynamic Import)

**Files:**
- Create: `web/src/components/map/tracking-map.tsx`
- Create: `web/src/components/map/vehicle-marker.tsx`

Leaflet requires browser APIs (window, document) so it must be dynamically imported in Next.js to avoid SSR errors.

- [ ] **Step 1: Create vehicle marker component**

```tsx
// web/src/components/map/vehicle-marker.tsx
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
  plate?: string;
};

// Custom icon based on vehicle state
function getIcon(ignition: boolean, speed: number) {
  const color = speed > 0 ? "#22c55e" : ignition ? "#f59e0b" : "#ef4444";
  return L.divIcon({
    className: "",
    html: `<div style="
      width: 28px; height: 28px; border-radius: 50%;
      background: ${color}; border: 3px solid white;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      display: flex; align-items: center; justify-content: center;
    ">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="1">
        <path d="M7 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/>
        <path d="M17 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/>
        <path d="M5 17h-2v-6l2 -5h9l4 5h1a2 2 0 0 1 2 2v4h-2m-4 0h-6"/>
      </svg>
    </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

export function VehicleMarker({ position }: { position: VehiclePosition }) {
  const icon = getIcon(position.ignition, position.speed);

  return (
    <Marker position={[position.latitude, position.longitude]} icon={icon}>
      <Popup>
        <div className="text-sm space-y-1">
          <p className="font-bold">{position.plate ?? position.device_id}</p>
          <p>Velocidade: {position.speed?.toFixed(0)} km/h</p>
          <p>Ignicao: {position.ignition ? "Ligada" : "Desligada"}</p>
          <p className="text-xs text-gray-500">
            {new Date(position.device_time).toLocaleString("pt-BR")}
          </p>
        </div>
      </Popup>
    </Marker>
  );
}
```

- [ ] **Step 2: Create tracking map wrapper**

```tsx
// web/src/components/map/tracking-map.tsx
"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

// Dynamic import to avoid SSR issues with Leaflet
const MapContainer = dynamic(
  () => import("react-leaflet").then((mod) => mod.MapContainer),
  { ssr: false }
);
const TileLayer = dynamic(
  () => import("react-leaflet").then((mod) => mod.TileLayer),
  { ssr: false }
);

// VehicleMarker also needs dynamic import since it uses leaflet
const VehicleMarker = dynamic(
  () => import("./vehicle-marker").then((mod) => mod.VehicleMarker),
  { ssr: false }
);

type VehiclePosition = {
  device_id: string;
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
  ignition: boolean;
  device_time: string;
  plate?: string;
};

export function TrackingMap({
  positions,
  className,
}: {
  positions: VehiclePosition[];
  className?: string;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className={`bg-muted flex items-center justify-center ${className}`}>
        <p className="text-muted-foreground">Carregando mapa...</p>
      </div>
    );
  }

  // Center on São Paulo by default, or on first position
  const center = positions.length > 0
    ? [positions[0].latitude, positions[0].longitude] as [number, number]
    : [-23.55, -46.63] as [number, number];

  return (
    <MapContainer
      center={center}
      zoom={13}
      className={className}
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {positions.map((pos) => (
        <VehicleMarker key={pos.device_id} position={pos} />
      ))}
    </MapContainer>
  );
}
```

- [ ] **Step 3: Add Leaflet CSS to globals.css**

Add to the top of `web/src/app/globals.css` (before existing imports):

```css
@import "leaflet/dist/leaflet.css";
```

- [ ] **Step 4: Verify build**

Run: `cd web && npm run build`

- [ ] **Step 5: Commit**

```bash
git add web/src/components/map/ web/src/app/globals.css && git commit -m "feat(web): add Leaflet map component with vehicle markers"
```

---

### Task 2: Real-time Positions Hook + Dashboard Map

**Files:**
- Create: `web/src/lib/hooks/use-realtime-positions.ts`
- Create: `web/src/lib/actions/positions.ts`
- Modify: `web/src/app/(dashboard)/page.tsx`

- [ ] **Step 1: Create positions server action**

```typescript
// web/src/lib/actions/positions.ts
"use server";

import { createClient } from "@/lib/supabase/server";

export async function getLatestPositions() {
  const supabase = await createClient();

  // Get the latest position for each device using a lateral join approach
  // We get all devices and their most recent position
  const { data: devices, error: devError } = await supabase
    .from("devices")
    .select("id, imei, vehicles(plate)")
    .eq("active", true);

  if (devError) throw new Error(devError.message);

  const positions = [];
  for (const device of devices || []) {
    const { data: pos } = await supabase
      .from("positions")
      .select("*")
      .eq("device_id", device.id)
      .order("server_time", { ascending: false })
      .limit(1)
      .single();

    if (pos) {
      // Extract lat/lon from PostGIS point — Supabase returns it as JSON
      const location = pos.location as any;
      const lat = location?.coordinates?.[1] ?? 0;
      const lon = location?.coordinates?.[0] ?? 0;

      const plate = Array.isArray(device.vehicles)
        ? device.vehicles[0]?.plate
        : (device.vehicles as any)?.plate;

      positions.push({
        device_id: device.id,
        latitude: lat,
        longitude: lon,
        speed: pos.speed ?? 0,
        heading: pos.heading ?? 0,
        ignition: pos.ignition ?? false,
        device_time: pos.device_time,
        plate: plate ?? device.imei,
      });
    }
  }

  return positions;
}

export async function getPositionHistory(deviceId: string, startDate: string, endDate: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("positions")
    .select("*")
    .eq("device_id", deviceId)
    .gte("server_time", startDate)
    .lte("server_time", endDate)
    .order("server_time", { ascending: true });

  if (error) throw new Error(error.message);

  return (data || []).map((pos) => {
    const location = pos.location as any;
    return {
      latitude: location?.coordinates?.[1] ?? 0,
      longitude: location?.coordinates?.[0] ?? 0,
      speed: pos.speed ?? 0,
      heading: pos.heading ?? 0,
      ignition: pos.ignition ?? false,
      device_time: pos.device_time,
    };
  });
}
```

- [ ] **Step 2: Create realtime positions hook**

```typescript
// web/src/lib/hooks/use-realtime-positions.ts
"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

type VehiclePosition = {
  device_id: string;
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
  ignition: boolean;
  device_time: string;
  plate?: string;
};

export function useRealtimePositions(initialPositions: VehiclePosition[]) {
  const [positions, setPositions] = useState<Map<string, VehiclePosition>>(
    () => new Map(initialPositions.map((p) => [p.device_id, p]))
  );

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel("positions-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "positions",
        },
        (payload) => {
          const pos = payload.new;
          const location = pos.location as any;
          const lat = location?.coordinates?.[1] ?? 0;
          const lon = location?.coordinates?.[0] ?? 0;

          setPositions((prev) => {
            const next = new Map(prev);
            const existing = next.get(pos.device_id);
            next.set(pos.device_id, {
              device_id: pos.device_id,
              latitude: lat,
              longitude: lon,
              speed: pos.speed ?? 0,
              heading: pos.heading ?? 0,
              ignition: pos.ignition ?? false,
              device_time: pos.device_time,
              plate: existing?.plate,
            });
            return next;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return Array.from(positions.values());
}
```

- [ ] **Step 3: Rewrite dashboard page with map**

Replace `web/src/app/(dashboard)/page.tsx` entirely:

```tsx
// web/src/app/(dashboard)/page.tsx
import { getLatestPositions } from "@/lib/actions/positions";
import { DashboardMap } from "./dashboard-map";

export default async function DashboardPage() {
  const positions = await getLatestPositions();

  return (
    <div className="h-full -m-6">
      <DashboardMap initialPositions={positions} />
    </div>
  );
}
```

- [ ] **Step 4: Create dashboard map client component**

```tsx
// web/src/app/(dashboard)/dashboard-map.tsx
"use client";

import { TrackingMap } from "@/components/map/tracking-map";
import { useRealtimePositions } from "@/lib/hooks/use-realtime-positions";

type VehiclePosition = {
  device_id: string;
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
  ignition: boolean;
  device_time: string;
  plate?: string;
};

export function DashboardMap({ initialPositions }: { initialPositions: VehiclePosition[] }) {
  const positions = useRealtimePositions(initialPositions);

  return (
    <div className="h-full w-full relative">
      <TrackingMap positions={positions} className="h-full w-full" />
      <div className="absolute bottom-4 left-4 bg-card/90 backdrop-blur rounded-lg p-3 text-sm shadow-lg z-[1000]">
        <p className="font-medium">{positions.length} veiculo(s) no mapa</p>
        <p className="text-muted-foreground text-xs">Atualizacao em tempo real</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify build**

Run: `cd web && npm run build`

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/actions/positions.ts web/src/lib/hooks/ web/src/app/\(dashboard\)/page.tsx web/src/app/\(dashboard\)/dashboard-map.tsx && git commit -m "feat(web): add real-time map dashboard with Supabase Realtime"
```

---

### Task 3: History Page with Route Replay

**Files:**
- Create: `web/src/components/map/history-player.tsx`
- Create: `web/src/app/(dashboard)/history/page.tsx`

- [ ] **Step 1: Create history player component**

```tsx
// web/src/components/map/history-player.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Play, Pause, SkipBack } from "lucide-react";
import { getPositionHistory } from "@/lib/actions/positions";
import { getDevices } from "@/lib/actions/devices";

const MapContainer = dynamic(() => import("react-leaflet").then((m) => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import("react-leaflet").then((m) => m.TileLayer), { ssr: false });
const Polyline = dynamic(() => import("react-leaflet").then((m) => m.Polyline), { ssr: false });
const CircleMarker = dynamic(() => import("react-leaflet").then((m) => m.CircleMarker), { ssr: false });

type PositionPoint = {
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
  ignition: boolean;
  device_time: string;
};

export function HistoryPlayer() {
  const [devices, setDevices] = useState<any[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [positions, setPositions] = useState<PositionPoint[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    getDevices().then(setDevices);
  }, []);

  useEffect(() => {
    if (!playing) return;
    if (currentIdx >= positions.length - 1) { setPlaying(false); return; }

    const timer = setTimeout(() => setCurrentIdx((i) => i + 1), 200);
    return () => clearTimeout(timer);
  }, [playing, currentIdx, positions.length]);

  async function handleSearch() {
    if (!deviceId || !startDate || !endDate) return;
    const data = await getPositionHistory(deviceId, startDate, endDate);
    setPositions(data);
    setCurrentIdx(0);
    setPlaying(false);
  }

  const route = positions.slice(0, currentIdx + 1).map((p) => [p.latitude, p.longitude] as [number, number]);
  const current = positions[currentIdx];

  const center = current
    ? [current.latitude, current.longitude] as [number, number]
    : [-23.55, -46.63] as [number, number];

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Controls */}
      <div className="flex gap-4 items-end flex-wrap">
        <div className="space-y-1">
          <Label>Dispositivo</Label>
          <select
            className="h-9 rounded-md border px-3 text-sm bg-background"
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
          >
            <option value="">Selecione...</option>
            {devices.map((d: any) => (
              <option key={d.id} value={d.id}>{d.imei}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label>Inicio</Label>
          <Input type="datetime-local" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Fim</Label>
          <Input type="datetime-local" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <Button onClick={handleSearch}>Buscar</Button>
        {positions.length > 0 && (
          <>
            <Button variant="outline" size="sm" onClick={() => { setCurrentIdx(0); setPlaying(false); }}>
              <SkipBack size={14} />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPlaying(!playing)}>
              {playing ? <Pause size={14} /> : <Play size={14} />}
            </Button>
            <span className="text-sm text-muted-foreground">
              {currentIdx + 1}/{positions.length} pontos
            </span>
          </>
        )}
      </div>

      {/* Map */}
      <div className="flex-1 rounded-lg overflow-hidden border">
        {mounted ? (
          <MapContainer center={center} zoom={14} style={{ height: "100%", width: "100%" }}>
            <TileLayer
              attribution='&copy; OpenStreetMap'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {route.length > 1 && <Polyline positions={route} color="#3b82f6" weight={3} />}
            {current && (
              <CircleMarker
                center={[current.latitude, current.longitude]}
                radius={8}
                fillColor="#3b82f6"
                fillOpacity={1}
                color="white"
                weight={2}
              />
            )}
          </MapContainer>
        ) : (
          <div className="h-full flex items-center justify-center bg-muted">
            <p className="text-muted-foreground">Carregando mapa...</p>
          </div>
        )}
      </div>

      {/* Position info */}
      {current && (
        <div className="text-sm text-muted-foreground">
          {new Date(current.device_time).toLocaleString("pt-BR")} — {current.speed.toFixed(0)} km/h — Ignicao: {current.ignition ? "Ligada" : "Desligada"}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create history page**

```tsx
// web/src/app/(dashboard)/history/page.tsx
import { HistoryPlayer } from "@/components/map/history-player";

export default function HistoryPage() {
  return (
    <div className="h-[calc(100vh-8rem)]">
      <h1 className="text-2xl font-bold mb-4">Historico de Rotas</h1>
      <HistoryPlayer />
    </div>
  );
}
```

- [ ] **Step 3: Update sidebar to include History link**

Add `{ href: "/history", label: "Historico", icon: Clock }` to the sidebar navItems after "Mapa". Import `Clock` from lucide-react.

- [ ] **Step 4: Verify build and commit**

```bash
cd web && npm run build
cd /Users/otavioajr/Documents/Projetos/tracker && git add web/ && git commit -m "feat(web): add route history page with replay"
```

---

### Task 4: Alerts Page

**Files:**
- Create: `web/src/lib/actions/alerts.ts`
- Create: `web/src/components/alerts/alert-feed.tsx`
- Create: `web/src/app/(dashboard)/alerts/page.tsx`

- [ ] **Step 1: Create alerts server actions**

```typescript
// web/src/lib/actions/alerts.ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function getAlerts(limit = 50) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("alerts")
    .select("*, devices(imei, vehicles(plate))")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return data;
}

export async function markAlertRead(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("alerts")
    .update({ read: true })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/alerts");
  return { success: true };
}

export async function getAlertRules() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("alert_rules")
    .select("*, devices(imei)")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}
```

- [ ] **Step 2: Create alert feed component**

```tsx
// web/src/components/alerts/alert-feed.tsx
"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { markAlertRead } from "@/lib/actions/alerts";
import { AlertTriangle, Info, Zap, Check } from "lucide-react";

type Alert = {
  id: string;
  type: string;
  severity: string;
  message: string;
  read: boolean;
  created_at: string;
  devices: { imei: string; vehicles: { plate: string }[] | { plate: string } | null } | null;
};

const severityConfig = {
  critical: { color: "destructive" as const, icon: AlertTriangle },
  warning: { color: "default" as const, icon: Zap },
  info: { color: "secondary" as const, icon: Info },
};

export function AlertFeed({ alerts }: { alerts: Alert[] }) {
  async function handleMarkRead(id: string) {
    await markAlertRead(id);
  }

  function getPlate(alert: Alert) {
    if (!alert.devices) return alert.devices;
    const v = alert.devices.vehicles;
    if (Array.isArray(v)) return v[0]?.plate ?? alert.devices.imei;
    return (v as any)?.plate ?? alert.devices.imei;
  }

  return (
    <div className="space-y-2">
      {alerts.length === 0 && (
        <p className="text-center text-muted-foreground py-8">Nenhum alerta registrado</p>
      )}
      {alerts.map((alert) => {
        const config = severityConfig[alert.severity as keyof typeof severityConfig] ?? severityConfig.info;
        const Icon = config.icon;

        return (
          <div
            key={alert.id}
            className={`flex items-start gap-3 p-4 rounded-lg border ${!alert.read ? "bg-accent/50" : ""}`}
          >
            <Icon size={18} className="mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant={config.color}>{alert.type}</Badge>
                <span className="text-sm font-medium">{getPlate(alert)}</span>
                <span className="text-xs text-muted-foreground ml-auto">
                  {new Date(alert.created_at).toLocaleString("pt-BR")}
                </span>
              </div>
              <p className="text-sm">{alert.message}</p>
            </div>
            {!alert.read && (
              <Button variant="ghost" size="sm" onClick={() => handleMarkRead(alert.id)}>
                <Check size={14} />
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Create alerts page**

```tsx
// web/src/app/(dashboard)/alerts/page.tsx
import { getAlerts } from "@/lib/actions/alerts";
import { AlertFeed } from "@/components/alerts/alert-feed";

export default async function AlertsPage() {
  const alerts = await getAlerts();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Alertas</h1>
      <AlertFeed alerts={alerts} />
    </div>
  );
}
```

- [ ] **Step 4: Verify build and commit**

```bash
cd web && npm run build
cd /Users/otavioajr/Documents/Projetos/tracker && git add web/ && git commit -m "feat(web): add alerts feed page"
```

---

### Task 5: Reports Page

**Files:**
- Create: `web/src/lib/actions/reports.ts`
- Create: `web/src/app/(dashboard)/reports/page.tsx`

- [ ] **Step 1: Create reports server actions**

```typescript
// web/src/lib/actions/reports.ts
"use server";

import { createClient } from "@/lib/supabase/server";

export type TripReport = {
  device_id: string;
  plate: string;
  start_time: string;
  end_time: string;
  distance_km: number;
  duration_min: number;
  max_speed: number;
};

export async function getTripsReport(deviceId: string, startDate: string, endDate: string): Promise<TripReport[]> {
  const supabase = await createClient();

  // Get positions for the device in the date range
  const { data: positions, error } = await supabase
    .from("positions")
    .select("speed, ignition, device_time, location")
    .eq("device_id", deviceId)
    .gte("server_time", startDate)
    .lte("server_time", endDate)
    .order("server_time", { ascending: true });

  if (error) throw new Error(error.message);
  if (!positions || positions.length < 2) return [];

  // Get vehicle plate
  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("plate")
    .eq("device_id", deviceId)
    .single();

  const plate = vehicle?.plate ?? deviceId;

  // Simple trip detection: group consecutive moving positions
  const trips: TripReport[] = [];
  let tripStart: number | null = null;
  let maxSpeed = 0;

  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];
    const isMoving = (pos.speed ?? 0) > 2;

    if (isMoving && tripStart === null) {
      tripStart = i;
      maxSpeed = pos.speed ?? 0;
    } else if (isMoving) {
      maxSpeed = Math.max(maxSpeed, pos.speed ?? 0);
    } else if (!isMoving && tripStart !== null) {
      const startPos = positions[tripStart];
      const endPos = positions[i - 1];
      const startTime = new Date(startPos.device_time);
      const endTime = new Date(endPos.device_time);
      const durationMin = (endTime.getTime() - startTime.getTime()) / 60000;

      if (durationMin > 1) {
        trips.push({
          device_id: deviceId,
          plate,
          start_time: startPos.device_time,
          end_time: endPos.device_time,
          distance_km: 0, // Simplified — would need haversine calculation
          duration_min: Math.round(durationMin),
          max_speed: maxSpeed,
        });
      }

      tripStart = null;
      maxSpeed = 0;
    }
  }

  return trips;
}
```

- [ ] **Step 2: Create reports page**

```tsx
// web/src/app/(dashboard)/reports/page.tsx
"use client";

import { useState } from "react";
import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getDevices } from "@/lib/actions/devices";
import { getTripsReport, type TripReport } from "@/lib/actions/reports";

export default function ReportsPage() {
  const [devices, setDevices] = useState<any[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [trips, setTrips] = useState<TripReport[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { getDevices().then(setDevices); }, []);

  async function handleSearch() {
    if (!deviceId || !startDate || !endDate) return;
    setLoading(true);
    const data = await getTripsReport(deviceId, startDate, endDate);
    setTrips(data);
    setLoading(false);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Relatorios</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Relatorio de Viagens</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 items-end flex-wrap mb-6">
            <div className="space-y-1">
              <Label>Dispositivo</Label>
              <select
                className="h-9 rounded-md border px-3 text-sm bg-background"
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
              >
                <option value="">Selecione...</option>
                {devices.map((d: any) => (
                  <option key={d.id} value={d.id}>{d.imei}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Inicio</Label>
              <Input type="datetime-local" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Fim</Label>
              <Input type="datetime-local" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <Button onClick={handleSearch} disabled={loading}>
              {loading ? "Buscando..." : "Gerar Relatorio"}
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Veiculo</TableHead>
                <TableHead>Inicio</TableHead>
                <TableHead>Fim</TableHead>
                <TableHead>Duracao</TableHead>
                <TableHead>Vel. Max</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trips.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    {deviceId ? "Nenhuma viagem encontrada no periodo" : "Selecione um dispositivo e periodo"}
                  </TableCell>
                </TableRow>
              )}
              {trips.map((trip, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{trip.plate}</TableCell>
                  <TableCell>{new Date(trip.start_time).toLocaleString("pt-BR")}</TableCell>
                  <TableCell>{new Date(trip.end_time).toLocaleString("pt-BR")}</TableCell>
                  <TableCell>{trip.duration_min} min</TableCell>
                  <TableCell>{trip.max_speed.toFixed(0)} km/h</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Verify build and commit**

```bash
cd web && npm run build
cd /Users/otavioajr/Documents/Projetos/tracker && git add web/ && git commit -m "feat(web): add trip reports page"
```

---

### Task 6: Geofences Page

**Files:**
- Create: `web/src/lib/actions/geofences.ts`
- Create: `web/src/components/geofences/geofence-table.tsx`
- Create: `web/src/app/(dashboard)/geofences/page.tsx`

- [ ] **Step 1: Create geofence server actions**

```typescript
// web/src/lib/actions/geofences.ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getTenantId } from "./utils";

export async function getGeofences() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("geofences")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}

export async function deleteGeofence(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("geofences").delete().eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/geofences");
  return { success: true };
}
```

- [ ] **Step 2: Create geofence table**

```tsx
// web/src/components/geofences/geofence-table.tsx
"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { deleteGeofence } from "@/lib/actions/geofences";
import { Trash2 } from "lucide-react";
import { useState } from "react";

type Geofence = {
  id: string;
  name: string;
  type: string;
  active: boolean;
  created_at: string;
};

export function GeofenceTable({ geofences }: { geofences: Geofence[] }) {
  const [deleting, setDeleting] = useState<string | null>(null);

  async function handleDelete(id: string) {
    if (!confirm("Tem certeza que deseja excluir esta geocerca?")) return;
    setDeleting(id);
    await deleteGeofence(id);
    setDeleting(null);
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nome</TableHead>
          <TableHead>Tipo</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Criada em</TableHead>
          <TableHead className="w-24">Acoes</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {geofences.length === 0 && (
          <TableRow>
            <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
              Nenhuma geocerca cadastrada
            </TableCell>
          </TableRow>
        )}
        {geofences.map((g) => (
          <TableRow key={g.id}>
            <TableCell className="font-medium">{g.name}</TableCell>
            <TableCell>
              <Badge variant={g.type === "inclusion" ? "default" : "destructive"}>
                {g.type === "inclusion" ? "Inclusao" : "Exclusao"}
              </Badge>
            </TableCell>
            <TableCell>
              <Badge variant={g.active ? "default" : "secondary"}>
                {g.active ? "Ativa" : "Inativa"}
              </Badge>
            </TableCell>
            <TableCell className="text-sm">{new Date(g.created_at).toLocaleDateString("pt-BR")}</TableCell>
            <TableCell>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDelete(g.id)}
                disabled={deleting === g.id}
              >
                <Trash2 size={14} className="text-destructive" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 3: Create geofences page**

```tsx
// web/src/app/(dashboard)/geofences/page.tsx
import { getGeofences } from "@/lib/actions/geofences";
import { GeofenceTable } from "@/components/geofences/geofence-table";

export default async function GeofencesPage() {
  const geofences = await getGeofences();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Geocercas</h1>
      </div>
      <p className="text-muted-foreground text-sm">Desenho de geocercas no mapa sera adicionado em uma proxima versao.</p>
      <GeofenceTable geofences={geofences} />
    </div>
  );
}
```

- [ ] **Step 4: Update sidebar to include Geofences + History links**

In `web/src/components/dashboard/sidebar.tsx`, update the navItems array. Import `MapPin, Clock` from lucide-react. Add after the Mapa entry:
```
{ href: "/history", label: "Historico", icon: Clock },
```
And replace the existing entries or add:
```
{ href: "/geofences", label: "Geocercas", icon: MapPin },
```

The final navItems should be:
```
Map → /, Clock → /history, Car → /vehicles, Cpu → /devices, MapPin → /geofences, Bell → /alerts, FileText → /reports
```

- [ ] **Step 5: Verify build and commit**

```bash
cd web && npm run build
cd /Users/otavioajr/Documents/Projetos/tracker && git add web/ && git commit -m "feat(web): add geofences page and update sidebar navigation"
```

---

### Task 7: PWA Manifest & Final Verification

**Files:**
- Create: `web/public/manifest.json`
- Modify: `web/src/app/layout.tsx`

- [ ] **Step 1: Create PWA manifest**

```json
{
  "name": "Tracker - Rastreamento Veicular",
  "short_name": "Tracker",
  "description": "Plataforma de rastreamento veicular em tempo real",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#09090b",
  "theme_color": "#09090b",
  "orientation": "any",
  "icons": [
    {
      "src": "/favicon.ico",
      "sizes": "48x48",
      "type": "image/x-icon"
    }
  ]
}
```

- [ ] **Step 2: Add manifest link and meta tags to layout**

Update `web/src/app/layout.tsx` to add manifest and PWA meta tags in the `<head>`:

```tsx
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tracker",
  description: "Plataforma de rastreamento veicular",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Tracker",
  },
};

export const viewport: Viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Full build verification**

```bash
cd web && npm run build
```

Expected routes: `/`, `/login`, `/register`, `/vehicles`, `/devices`, `/history`, `/geofences`, `/alerts`, `/reports`, `/auth/callback`

- [ ] **Step 4: Final commit**

```bash
cd /Users/otavioajr/Documents/Projetos/tracker && git add web/ && git commit -m "feat(web): add PWA manifest and finalize Plan 4"
```
