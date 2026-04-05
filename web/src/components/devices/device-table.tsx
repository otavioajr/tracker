"use client";

import { useState } from "react";
import { Car, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deleteDevice } from "@/lib/actions/devices";
import { DeviceDialog } from "./device-dialog";
import { formatDeviceLastCommunication, getPrimaryVehicle } from "./device-presenters";

type Vehicle = {
  id: string;
  plate: string;
};

type Device = {
  id: string;
  imei: string;
  protocol: string;
  model: string | null;
  active: boolean;
  last_communication_at: string | null;
  vehicles: Vehicle | Vehicle[] | null;
};

export function DeviceTable({ devices }: { devices: Device[] }) {
  const [deleting, setDeleting] = useState<string | null>(null);

  async function handleDelete(id: string) {
    if (!confirm("Tem certeza que deseja excluir este dispositivo?")) return;
    setDeleting(id);
    await deleteDevice(id);
    setDeleting(null);
  }

  return (
    <Card className="border border-border/60 bg-card/95">
      <CardHeader className="gap-2 border-b border-border/60">
        <CardTitle>Inventário principal</CardTitle>
        <CardDescription>
          Consulte vínculo, status e última comunicação sem perder o contexto operacional.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {devices.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-10 text-center">
            <div className="space-y-1">
              <p className="text-base font-medium">Nenhum dispositivo cadastrado</p>
              <p className="text-sm text-muted-foreground">
                Cadastre o primeiro dispositivo para começar a organizar o provisionamento da frota.
              </p>
            </div>
            <DeviceDialog />
          </div>
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>IMEI</TableHead>
                    <TableHead>Vínculo</TableHead>
                    <TableHead>Modelo</TableHead>
                    <TableHead>Protocolo</TableHead>
                    <TableHead>Última comunicação</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-24">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {devices.map((device) => {
                    const vehicle = getPrimaryVehicle(device.vehicles);

                    return (
                      <TableRow key={device.id}>
                        <TableCell className="font-mono tabular-nums">{device.imei}</TableCell>
                        <TableCell>
                          {vehicle ? (
                            <Badge variant="secondary" className="gap-1">
                              <Car className="size-3.5" />
                              {vehicle.plate}
                            </Badge>
                          ) : (
                            <span className="text-sm text-muted-foreground">Sem veículo</span>
                          )}
                        </TableCell>
                        <TableCell>{device.model ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{device.protocol}</Badge>
                        </TableCell>
                        <TableCell>{formatDeviceLastCommunication(device.last_communication_at)}</TableCell>
                        <TableCell>
                          <Badge variant={device.active ? "default" : "secondary"}>
                            {device.active ? "Ativo" : "Inativo"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <DeviceDialog device={device} />
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(device.id)}
                              disabled={deleting === device.id}
                            >
                              <Trash2 className="size-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="grid gap-3 md:hidden">
              {devices.map((device) => {
                const vehicle = getPrimaryVehicle(device.vehicles);

                return (
                  <div key={device.id} className="rounded-xl border border-border/60 bg-background/80 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-2">
                        <p className="font-mono text-sm font-medium tabular-nums">{device.imei}</p>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={device.active ? "default" : "secondary"}>
                            {device.active ? "Ativo" : "Inativo"}
                          </Badge>
                          <Badge variant="outline">{device.protocol}</Badge>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <DeviceDialog device={device} />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(device.id)}
                          disabled={deleting === device.id}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </div>

                    <dl className="mt-4 grid gap-3 text-sm">
                      <MobileInfo label="Vínculo" value={vehicle?.plate ?? "Sem veículo"} />
                      <MobileInfo label="Modelo" value={device.model ?? "—"} />
                      <MobileInfo
                        label="Última comunicação"
                        value={formatDeviceLastCommunication(device.last_communication_at)}
                      />
                    </dl>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function MobileInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
