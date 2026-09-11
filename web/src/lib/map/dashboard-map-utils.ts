import type { VehicleOperationalStatus, VehiclePosition } from "@/components/map/types";

export type DashboardVehicleFilter = "all" | "moving" | "stopped" | "offline";

export const POSITION_STALE_AFTER_MS = 5 * 60 * 1000;
export const POSITION_OFFLINE_AFTER_MS = 30 * 60 * 1000;
export const POSITION_CLOCK_INTERVAL_MS = 15 * 1000;

type DashboardVehicleLike = Pick<
  VehiclePosition,
  "device_id" | "ignition" | "speed" | "server_time" | "plate" | "vehicle_name"
> & Partial<Pick<VehiclePosition, "device_time">>;

export const DASHBOARD_STATUS_META: Record<
  VehicleOperationalStatus,
  {
    label: string;
    colorClassName: string;
    dotClassName: string;
  }
> = {
  moving: {
    label: "Em movimento",
    colorClassName: "text-emerald-300",
    dotClassName: "bg-emerald-400",
  },
  stopped: {
    label: "Parado",
    colorClassName: "text-amber-300",
    dotClassName: "bg-amber-400",
  },
  offline: {
    label: "Sem sinal",
    colorClassName: "text-rose-300",
    dotClassName: "bg-rose-400",
  },
};

export function getVehicleDisplayLabel(
  position: Pick<DashboardVehicleLike, "device_id" | "plate" | "vehicle_name">
) {
  return position.vehicle_name || position.plate || position.device_id;
}

export function getPositionAgeMs(
  position: Pick<DashboardVehicleLike, "device_time" | "server_time">,
  now = Date.now()
) {
  const measuredAt = Date.parse(position.device_time || position.server_time);
  return Number.isFinite(measuredAt) ? now - measuredAt : Number.POSITIVE_INFINITY;
}

export function isPositionStale(
  position: Pick<DashboardVehicleLike, "device_time" | "server_time">,
  now = Date.now()
) {
  return getPositionAgeMs(position, now) > POSITION_STALE_AFTER_MS;
}

export function getVehicleOperationalStatus(
  position: Pick<DashboardVehicleLike, "ignition" | "speed" | "server_time" | "device_time">,
  now = Date.now()
): VehicleOperationalStatus {
  if (getPositionAgeMs(position, now) > POSITION_OFFLINE_AFTER_MS) {
    return "offline";
  }

  if (position.ignition && position.speed > 2) {
    return "moving";
  }

  return "stopped";
}

export function formatLastSignalRelative(signalTime: string, now = Date.now()) {
  const minutesAgo = Math.max(0, Math.floor((now - new Date(signalTime).getTime()) / 60000));

  if (minutesAgo < 1) {
    return "agora";
  }

  if (minutesAgo < 60) {
    return `${minutesAgo} min`;
  }

  const hours = Math.floor(minutesAgo / 60);
  const remainingMinutes = minutesAgo % 60;

  if (remainingMinutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${remainingMinutes}m`;
}

export function filterDashboardVehicles<T extends DashboardVehicleLike>(
  positions: T[],
  {
    query,
    status,
  }: {
    query: string;
    status: DashboardVehicleFilter;
  }
) {
  const normalizedQuery = query.trim().toLowerCase();

  return positions.filter((position) => {
    if (status !== "all" && getVehicleOperationalStatus(position, Date.now()) !== status) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    const haystack = [
      position.vehicle_name,
      position.plate,
      position.device_id,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalizedQuery);
  });
}
