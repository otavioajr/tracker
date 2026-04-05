"use client";

import { useState } from "react";
import { Link2, Network, ShieldX } from "lucide-react";

import { dismissPendingDevice, linkPendingDevice } from "@/lib/actions/pending-devices";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { formatDeviceLastCommunication } from "./device-presenters";

type PendingDevice = {
  id: string;
  serial: string;
  protocol: string;
  ip_address: string | null;
  first_seen_at: string;
  last_seen_at: string;
  message_count: number;
};

type Device = {
  id: string;
  imei: string;
  model: string | null;
  serial_number: string | null;
};

export function PendingDevicesTable({
  pending,
  devices,
}: {
  pending: PendingDevice[];
  devices: Device[];
}) {
  const [linking, setLinking] = useState<string | null>(null);

  if (pending.length === 0) return null;

  const unlinkedDevices = devices.filter((device) => !device.serial_number);

  async function handleLink(pendingId: string, deviceId: string) {
    setLinking(pendingId);
    await linkPendingDevice(pendingId, deviceId);
    setLinking(null);
  }

  async function handleDismiss(pendingId: string) {
    if (!confirm("Ignorar este dispositivo pendente?")) return;
    await dismissPendingDevice(pendingId);
  }

  return (
    <Card className="border-amber-200/80 bg-amber-50/40 dark:border-amber-950/60 dark:bg-amber-950/10">
      <CardHeader className="gap-3 border-b border-amber-200/70 dark:border-amber-950/60">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-amber-700 dark:text-amber-400">
              Ação prioritária
            </p>
            <CardTitle>Dispositivos detectados aguardando vínculo</CardTitle>
            <CardDescription>
              Resolva rapidamente os seriais que já chegaram ao gateway mas ainda não foram associados a um cadastro.
            </CardDescription>
          </div>
          <Badge variant="secondary" className="rounded-full px-3 py-1 text-sm">
            {pending.length} pendentes
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="grid gap-3">
        {pending.map((device) => (
          <div
            key={device.id}
            className="grid gap-3 rounded-xl border border-border/60 bg-background/80 p-4 lg:grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,0.8fr))_auto]"
          >
            <div className="space-y-1">
              <p className="font-mono text-sm font-medium">{device.serial}</p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">{device.protocol}</Badge>
                {device.ip_address ? (
                  <span className="inline-flex items-center gap-1">
                    <Network className="size-3" />
                    {device.ip_address}
                  </span>
                ) : null}
              </div>
            </div>

            <InfoColumn
              label="Primeira conexão"
              value={formatDeviceLastCommunication(device.first_seen_at)}
            />
            <InfoColumn
              label="Última conexão"
              value={formatDeviceLastCommunication(device.last_seen_at)}
            />
            <InfoColumn label="Mensagens" value={String(device.message_count)} />

            <div className="flex items-center gap-2 lg:justify-end">
              <Dialog>
                <DialogTrigger
                  render={
                    <Button disabled={linking === device.id}>
                      <Link2 className="mr-2 size-4" />
                      Vincular
                    </Button>
                  }
                />
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Vincular serial {device.serial}</DialogTitle>
                    <DialogDescription>
                      Escolha um dispositivo cadastrado sem serial para concluir o provisionamento.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-2">
                    {unlinkedDevices.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-border/70 px-3 py-4 text-sm text-muted-foreground">
                        Todos os dispositivos cadastrados já possuem serial vinculado.
                      </p>
                    ) : (
                      unlinkedDevices.map((candidate) => (
                        <Button
                          key={candidate.id}
                          variant="outline"
                          className="w-full justify-start"
                          onClick={() => handleLink(device.id, candidate.id)}
                        >
                          <span className="font-mono">{candidate.imei}</span>
                          {candidate.model ? (
                            <span className="ml-2 text-muted-foreground">
                              ({candidate.model})
                            </span>
                          ) : null}
                        </Button>
                      ))
                    )}
                  </div>
                </DialogContent>
              </Dialog>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDismiss(device.id)}
                aria-label="Ignorar pendência"
              >
                <ShieldX className="size-4 text-muted-foreground" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function InfoColumn({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}
