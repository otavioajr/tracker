import type { VehicleOperationalStatus, VehiclePosition } from "@/components/map/types";

// "offline" é chave legada das preferências; significa dados antigos, não falta de sinal.
export type DashboardVehicleFilter = "all" | "moving" | "stopped" | "offline";
export const POSITION_STALE_AFTER_MS = 5 * 60_000;
export const POSITION_CLOCK_INTERVAL_MS = 15_000;

export function isPositionStale(deviceTime: string, now = Date.now()) {
  const measuredAt = Date.parse(deviceTime);
  return !Number.isFinite(measuredAt) || now - measuredAt > POSITION_STALE_AFTER_MS;
}

type DashboardVehicleLike = Pick<
  VehiclePosition,
  "device_id" | "ignition" | "speed" | "device_time" | "plate" | "vehicle_name"
>;

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
    label: "Posição desatualizada",
    colorClassName: "text-rose-300",
    dotClassName: "bg-rose-400",
  },
};

export function getVehicleDisplayLabel(
  position: Pick<DashboardVehicleLike, "device_id" | "plate" | "vehicle_name">
) {
  return position.vehicle_name || position.plate || position.device_id;
}

export function getVehicleOperationalStatus(
  position: Pick<DashboardVehicleLike, "ignition" | "speed" | "device_time">,
  now = Date.now()
): VehicleOperationalStatus {
  // Idade da medição nunca é rejuvenescida por uma gravação tardia.
  if (isPositionStale(position.device_time, now)) {
    return "offline";
  }

  if (position.ignition && position.speed > 2) {
    return "moving";
  }

  return "stopped";
}

export function formatLastSignalRelative(deviceTime: string, now = Date.now()) {
  const measuredAt = Date.parse(deviceTime);
  if (!Number.isFinite(measuredAt)) return "com horário indisponível";
  const secondsAgo = Math.max(0, Math.floor((now - measuredAt) / 1000));
  const minutesAgo = Math.floor(secondsAgo / 60);

  if (minutesAgo < 1) {
    return `${secondsAgo} s`;
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
    now = Date.now(),
  }: {
    query: string;
    status: DashboardVehicleFilter;
    now?: number;
  }
) {
  const normalizedQuery = query.trim().toLowerCase();

  return positions.filter((position) => {
    if (status !== "all" && getVehicleOperationalStatus(position, now) !== status) {
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
