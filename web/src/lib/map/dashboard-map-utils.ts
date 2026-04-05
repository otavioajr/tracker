import type { VehicleOperationalStatus, VehiclePosition } from "@/components/map/types";

export type DashboardVehicleFilter = "all" | "moving" | "stopped" | "offline";

type DashboardVehicleLike = Pick<
  VehiclePosition,
  "device_id" | "ignition" | "speed" | "server_time" | "plate" | "vehicle_name"
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

export function getVehicleOperationalStatus(
  position: Pick<DashboardVehicleLike, "ignition" | "speed" | "server_time">
): VehicleOperationalStatus {
  const minutesAgo = (Date.now() - new Date(position.server_time).getTime()) / 60000;

  if (minutesAgo > 30) {
    return "offline";
  }

  if (position.ignition && position.speed > 2) {
    return "moving";
  }

  return "stopped";
}

export function formatLastSignalRelative(serverTime: string) {
  const minutesAgo = Math.max(
    0,
    Math.floor((Date.now() - new Date(serverTime).getTime()) / 60000)
  );

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
    if (status !== "all" && getVehicleOperationalStatus(position) !== status) {
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
