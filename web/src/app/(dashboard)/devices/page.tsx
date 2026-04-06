import { DeviceDialog } from "@/components/devices/device-dialog";
import { DeviceMetricsStrip } from "@/components/devices/device-metrics-strip";
import { DeviceTable } from "@/components/devices/device-table";
import { buildDeviceMetrics } from "@/components/devices/device-presenters";
import { PendingDevicesTable } from "@/components/devices/pending-devices-table";
import { getDevices } from "@/lib/actions/devices";
import { getPendingDevices } from "@/lib/actions/pending-devices";

export default async function DevicesPage() {
  const [devices, pending] = await Promise.all([getDevices(), getPendingDevices()]);
  const metrics = buildDeviceMetrics(devices, pending.length);

  return (
    <div className="space-y-6 lg:space-y-7">
      <section className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card/95 p-4 lg:flex-row lg:items-end lg:justify-between lg:p-6">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Provisionamento
          </p>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight lg:text-3xl">
              Dispositivos
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Cadastre, vincule e acompanhe o inventário de rastreadores com foco nas pendências operacionais.
            </p>
          </div>
        </div>
        <DeviceDialog />
      </section>

      <DeviceMetricsStrip metrics={metrics} />

      <PendingDevicesTable
        pending={pending}
        devices={devices.map((device) => ({
          id: device.id,
          imei: device.imei,
          model: device.model,
          serial_number: device.serial_number,
        }))}
      />

      <DeviceTable devices={devices} />
    </div>
  );
}
