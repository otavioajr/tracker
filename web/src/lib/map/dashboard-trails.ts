import type {
  DashboardTrailPoint,
  VehiclePosition,
} from "@/components/map/types";

export const DASHBOARD_TRAIL_POINT_LIMIT = 300;

type TrailState = {
  activeTrailDeviceIds: Set<string>;
  trailCursors: Record<string, string>;
  trails: Record<string, DashboardTrailPoint[]>;
};

export function activateTrailForVehicle({
  deviceId,
  currentServerTime,
  activeTrailDeviceIds,
  trailCursors,
  trails,
}: {
  deviceId: string;
  currentServerTime?: string;
} & TrailState): TrailState {
  const nextActiveTrailDeviceIds = new Set(activeTrailDeviceIds);
  nextActiveTrailDeviceIds.add(deviceId);

  return {
    activeTrailDeviceIds: nextActiveTrailDeviceIds,
    trailCursors: {
      ...trailCursors,
      [deviceId]: currentServerTime ?? "",
    },
    trails: {
      ...trails,
      [deviceId]: [],
    },
  };
}

export function clearTrailForVehicle({
  deviceId,
  activeTrailDeviceIds,
  trailCursors,
  trails,
}: {
  deviceId: string;
} & TrailState): TrailState {
  const nextActiveTrailDeviceIds = new Set(activeTrailDeviceIds);
  nextActiveTrailDeviceIds.delete(deviceId);

  const nextTrailCursors = { ...trailCursors };
  const nextTrails = { ...trails };
  delete nextTrailCursors[deviceId];
  delete nextTrails[deviceId];

  return {
    activeTrailDeviceIds: nextActiveTrailDeviceIds,
    trailCursors: nextTrailCursors,
    trails: nextTrails,
  };
}

export function ingestRealtimeTrailPositions({
  positions,
  activeTrailDeviceIds,
  trailCursors,
  trails,
  pointLimit = DASHBOARD_TRAIL_POINT_LIMIT,
}: {
  positions: VehiclePosition[];
  pointLimit?: number;
} & TrailState): Pick<TrailState, "trailCursors" | "trails"> {
  if (activeTrailDeviceIds.size === 0) {
    return {
      trailCursors,
      trails,
    };
  }

  let nextTrailCursors = trailCursors;
  let nextTrails = trails;
  let changed = false;

  for (const position of positions) {
    if (!activeTrailDeviceIds.has(position.device_id)) {
      continue;
    }

    const currentCursor = nextTrailCursors[position.device_id] ?? "";
    if (position.server_time <= currentCursor) {
      continue;
    }

    const nextPoint: DashboardTrailPoint = {
      latitude: position.latitude,
      longitude: position.longitude,
      server_time: position.server_time,
    };

    if (!changed) {
      nextTrailCursors = { ...trailCursors };
      nextTrails = { ...trails };
      changed = true;
    }

    const previousTrail = nextTrails[position.device_id] ?? [];
    nextTrails[position.device_id] = [...previousTrail, nextPoint].slice(
      -pointLimit
    );
    nextTrailCursors[position.device_id] = position.server_time;
  }

  return {
    trailCursors: changed ? nextTrailCursors : trailCursors,
    trails: changed ? nextTrails : trails,
  };
}
