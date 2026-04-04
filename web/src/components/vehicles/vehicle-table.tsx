"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { VehicleDialog } from "./vehicle-dialog";
import { deleteVehicle, associateDevice } from "@/lib/actions/vehicles";
import { Trash2, Cpu, Link2, Unlink } from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Vehicle = {
  id: string;
  name: string | null;
  plate: string;
  brand: string | null;
  model: string | null;
  year: number | null;
  color: string | null;
  active: boolean;
  device_id: string | null;
  devices: {
    imei: string;
    protocol: string;
    last_communication_at: string | null;
  } | null;
};

type AvailableDevice = {
  id: string;
  imei: string;
  model: string | null;
};

export function VehicleTable({
  vehicles,
  availableDevices,
}: {
  vehicles: Vehicle[];
  availableDevices: AvailableDevice[];
}) {
  const [deleting, setDeleting] = useState<string | null>(null);
  const [linking, setLinking] = useState<string | null>(null);

  async function handleDelete(id: string) {
    if (!confirm("Tem certeza que deseja excluir este veiculo?")) return;
    setDeleting(id);
    await deleteVehicle(id);
    setDeleting(null);
  }

  async function handleLink(vehicleId: string, deviceId: string) {
    setLinking(vehicleId);
    await associateDevice(vehicleId, deviceId);
    setLinking(null);
  }

  async function handleUnlink(vehicleId: string) {
    if (!confirm("Desvincular o dispositivo deste veículo?")) return;
    setLinking(vehicleId);
    await associateDevice(vehicleId, null);
    setLinking(null);
  }

  const assignedDeviceIds = new Set(
    vehicles.filter((v) => v.device_id).map((v) => v.device_id)
  );
  const unassignedDevices = availableDevices.filter(
    (d) => !assignedDeviceIds.has(d.id)
  );

  return (
    <>
      {/* Mobile card view */}
      <div className="space-y-3 lg:hidden">
        {vehicles.length === 0 && (
          <p className="text-center text-muted-foreground py-8 text-sm">
            Nenhum veículo cadastrado
          </p>
        )}
        {vehicles.map((v, i) => (
          <div
            key={v.id}
            className="bg-card border border-border/50 rounded-xl p-4 animate-slide-up"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <div className="flex items-start justify-between">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm truncate">
                  {v.name || v.plate}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {v.name ? `${v.plate} · ` : ""}
                  {[v.brand, v.model].filter(Boolean).join(" ")}
                  {v.year ? ` · ${v.year}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-1 ml-2 shrink-0">
                <VehicleDialog vehicle={v} />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(v.id)}
                  disabled={deleting === v.id}
                >
                  <Trash2 size={14} className="text-destructive" />
                </Button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {v.devices ? (
                <>
                  <Badge
                    variant="outline"
                    className="gap-1.5 text-xs font-mono"
                  >
                    <Cpu size={11} />
                    {v.devices.imei}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleUnlink(v.id)}
                    disabled={linking === v.id}
                  >
                    <Unlink size={12} className="text-muted-foreground" />
                  </Button>
                </>
              ) : (
                <>
                  <Badge
                    variant="secondary"
                    className="gap-1.5 text-xs opacity-50"
                  >
                    Sem dispositivo
                  </Badge>
                  <Dialog>
                    <DialogTrigger
                      render={
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={linking === v.id}
                          className="h-7 px-2 text-xs"
                        />
                      }
                    >
                      <Link2 size={12} className="mr-1" /> Vincular
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>
                          Vincular dispositivo ao veículo {v.plate}
                        </DialogTitle>
                      </DialogHeader>
                      <p className="text-sm text-muted-foreground">
                        Selecione o dispositivo para associar a este veículo:
                      </p>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {unassignedDevices.length === 0 ? (
                          <p className="text-sm text-muted-foreground py-4 text-center">
                            Todos os dispositivos já estão vinculados a
                            veículos.
                          </p>
                        ) : (
                          unassignedDevices.map((d) => (
                            <Button
                              key={d.id}
                              variant="outline"
                              className="w-full justify-start"
                              onClick={() => handleLink(v.id, d.id)}
                            >
                              <span className="font-mono">{d.imei}</span>
                              {d.model && (
                                <span className="ml-2 text-muted-foreground">
                                  ({d.model})
                                </span>
                              )}
                            </Button>
                          ))
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table view */}
      <div className="hidden lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Placa</TableHead>
              <TableHead>Marca/Modelo</TableHead>
              <TableHead>Ano</TableHead>
              <TableHead>Cor</TableHead>
              <TableHead>Dispositivo</TableHead>
              <TableHead className="w-32">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vehicles.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center text-muted-foreground py-8"
                >
                  Nenhum veículo cadastrado
                </TableCell>
              </TableRow>
            )}
            {vehicles.map((v) => (
              <TableRow key={v.id}>
                <TableCell>{v.name ?? "—"}</TableCell>
                <TableCell className="font-medium">{v.plate}</TableCell>
                <TableCell>
                  {[v.brand, v.model].filter(Boolean).join(" ") || "—"}
                </TableCell>
                <TableCell>{v.year ?? "—"}</TableCell>
                <TableCell>{v.color ?? "—"}</TableCell>
                <TableCell>
                  {v.devices ? (
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="gap-1">
                        <Cpu size={12} /> {v.devices.imei}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleUnlink(v.id)}
                        disabled={linking === v.id}
                        title="Desvincular dispositivo"
                      >
                        <Unlink
                          size={14}
                          className="text-muted-foreground"
                        />
                      </Button>
                    </div>
                  ) : (
                    <Dialog>
                      <DialogTrigger
                        render={
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={linking === v.id}
                          />
                        }
                      >
                        <Link2 size={14} className="mr-1" /> Vincular
                        dispositivo
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>
                            Vincular dispositivo ao veículo {v.plate}
                          </DialogTitle>
                        </DialogHeader>
                        <p className="text-sm text-muted-foreground">
                          Selecione o dispositivo para associar a este
                          veículo:
                        </p>
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                          {unassignedDevices.length === 0 ? (
                            <p className="text-sm text-muted-foreground py-4 text-center">
                              Todos os dispositivos já estão vinculados a
                              veículos.
                            </p>
                          ) : (
                            unassignedDevices.map((d) => (
                              <Button
                                key={d.id}
                                variant="outline"
                                className="w-full justify-start"
                                onClick={() => handleLink(v.id, d.id)}
                              >
                                <span className="font-mono">{d.imei}</span>
                                {d.model && (
                                  <span className="ml-2 text-muted-foreground">
                                    ({d.model})
                                  </span>
                                )}
                              </Button>
                            ))
                          )}
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <VehicleDialog vehicle={v} />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(v.id)}
                      disabled={deleting === v.id}
                    >
                      <Trash2 size={14} className="text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
