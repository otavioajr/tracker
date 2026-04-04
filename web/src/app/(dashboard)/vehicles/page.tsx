import { getVehicles } from "@/lib/actions/vehicles";
import { getDevices } from "@/lib/actions/devices";
import { VehicleTable } from "@/components/vehicles/vehicle-table";
import { VehicleDialog } from "@/components/vehicles/vehicle-dialog";

export default async function VehiclesPage() {
  const [vehicles, devices] = await Promise.all([
    getVehicles(),
    getDevices(),
  ]);

  return (
    <div className="space-y-4 lg:space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl lg:text-2xl font-bold">Veículos</h1>
        <VehicleDialog />
      </div>
      <VehicleTable
        vehicles={vehicles}
        availableDevices={devices.map((d) => ({
          id: d.id,
          imei: d.imei,
          model: d.model,
        }))}
      />
    </div>
  );
}
