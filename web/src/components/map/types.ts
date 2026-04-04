export type VehiclePosition = {
  device_id: string;
  vehicle_id?: string;
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

export type VehicleOperationalStatus = "moving" | "stopped" | "offline";

export type DashboardVehicleListEntry = {
  device_id: string;
  displayLabel: string;
  status: VehicleOperationalStatus;
  lastSignalLabel: string;
  speedLabel: string;
  secondaryLabel?: string;
};
