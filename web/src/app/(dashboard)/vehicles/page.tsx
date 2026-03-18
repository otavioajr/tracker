import { getVehicles } from "@/lib/actions/vehicles";
import { VehicleTable } from "@/components/vehicles/vehicle-table";
import { VehicleDialog } from "@/components/vehicles/vehicle-dialog";

export default async function VehiclesPage() {
  const vehicles = await getVehicles();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Veiculos</h1>
        <VehicleDialog />
      </div>
      <VehicleTable vehicles={vehicles} />
    </div>
  );
}
