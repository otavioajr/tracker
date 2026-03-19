import { getDevices } from "@/lib/actions/devices";
import { getPendingDevices } from "@/lib/actions/pending-devices";
import { DeviceTable } from "@/components/devices/device-table";
import { DeviceDialog } from "@/components/devices/device-dialog";
import { PendingDevicesTable } from "@/components/devices/pending-devices-table";

export default async function DevicesPage() {
  const [devices, pending] = await Promise.all([
    getDevices(),
    getPendingDevices(),
  ]);

  return (
    <div className="space-y-6">
      <PendingDevicesTable
        pending={pending}
        devices={devices.map((d) => ({
          id: d.id,
          imei: d.imei,
          model: d.model,
          serial_number: d.serial_number,
        }))}
      />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dispositivos</h1>
        <DeviceDialog />
      </div>
      <DeviceTable devices={devices} />
    </div>
  );
}
