"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link2, X } from "lucide-react";
import { useState } from "react";
import { linkPendingDevice, dismissPendingDevice } from "@/lib/actions/pending-devices";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

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

  const unlinkedDevices = devices.filter((d) => !d.serial_number);

  async function handleLink(pendingId: string, deviceId: string) {
    setLinking(pendingId);
    await linkPendingDevice(pendingId, deviceId);
    setLinking(null);
  }

  async function handleDismiss(pendingId: string) {
    if (!confirm("Ignorar este dispositivo pendente?")) return;
    await dismissPendingDevice(pendingId);
  }

  function formatDate(value: string): string {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">Dispositivos Pendentes</h2>
        <Badge variant="secondary">{pending.length}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        Dispositivos que se conectaram ao servidor mas ainda não foram associados a um cadastro.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Serial</TableHead>
            <TableHead>Protocolo</TableHead>
            <TableHead>IP</TableHead>
            <TableHead>Primeira conexão</TableHead>
            <TableHead>Última conexão</TableHead>
            <TableHead>Mensagens</TableHead>
            <TableHead className="w-32">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pending.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-mono">{p.serial}</TableCell>
              <TableCell>
                <Badge variant="outline">{p.protocol}</Badge>
              </TableCell>
              <TableCell className="font-mono text-sm">{p.ip_address ?? "—"}</TableCell>
              <TableCell>{formatDate(p.first_seen_at)}</TableCell>
              <TableCell>{formatDate(p.last_seen_at)}</TableCell>
              <TableCell>{p.message_count}</TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Dialog>
                    <DialogTrigger
                      render={
                        <Button variant="outline" size="sm" disabled={linking === p.id} />
                      }
                    >
                      <Link2 size={14} className="mr-1" /> Vincular
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Vincular serial {p.serial}</DialogTitle>
                      </DialogHeader>
                      <p className="text-sm text-muted-foreground">
                        Selecione o dispositivo cadastrado para associar a este serial:
                      </p>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {unlinkedDevices.length === 0 ? (
                          <p className="text-sm text-muted-foreground py-4 text-center">
                            Todos os dispositivos já possuem serial vinculado.
                          </p>
                        ) : (
                          unlinkedDevices.map((d) => (
                            <Button
                              key={d.id}
                              variant="outline"
                              className="w-full justify-start"
                              onClick={() => handleLink(p.id, d.id)}
                            >
                              <span className="font-mono">{d.imei}</span>
                              {d.model && (
                                <span className="ml-2 text-muted-foreground">({d.model})</span>
                              )}
                            </Button>
                          ))
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>
                  <Button variant="ghost" size="sm" onClick={() => handleDismiss(p.id)}>
                    <X size={14} className="text-muted-foreground" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
