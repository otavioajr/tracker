import { getDevices } from "@/lib/actions/devices";
import { DeviceTable } from "@/components/devices/device-table";
import { DeviceDialog } from "@/components/devices/device-dialog";

export default async function DevicesPage() {
  const devices = await getDevices();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dispositivos</h1>
        <DeviceDialog />
      </div>
      <DeviceTable devices={devices} />
    </div>
  );
}
