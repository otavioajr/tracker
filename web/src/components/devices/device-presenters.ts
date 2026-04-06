export type DeviceVehicle = {
  id: string;
  plate: string;
};

export type DeviceMetricSource = {
  active: boolean;
  vehicles: DeviceVehicle | DeviceVehicle[] | null;
};

export type DeviceMetrics = {
  total: number;
  pending: number;
  active: number;
  unassigned: number;
};

export function getPrimaryVehicle(
  vehicles: DeviceVehicle | DeviceVehicle[] | null,
): DeviceVehicle | null {
  if (!vehicles) return null;
  return Array.isArray(vehicles) ? vehicles[0] ?? null : vehicles;
}

export function buildDeviceMetrics(
  devices: DeviceMetricSource[],
  pendingCount: number,
): DeviceMetrics {
  return {
    total: devices.length,
    pending: pendingCount,
    active: devices.filter((device) => device.active).length,
    unassigned: devices.filter((device) => !getPrimaryVehicle(device.vehicles))
      .length,
  };
}

export function formatDeviceLastCommunication(
  value: string | null,
  now = new Date(),
): string {
  if (!value) return "Nunca";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Nunca";

  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return "Agora";

  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return "Agora";
  if (diffMinutes < 60) return `há ${diffMinutes} min`;
  if (diffHours < 24) return `há ${diffHours}h`;
  return `há ${diffDays}d`;
}
