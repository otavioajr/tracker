"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeviceDialog } from "./device-dialog";
import { deleteDevice } from "@/lib/actions/devices";
import { Trash2, Car } from "lucide-react";
import { useState } from "react";

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

  function formatLastCommunication(value: string | null): string {
    if (!value) return "Nunca";
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>IMEI</TableHead>
          <TableHead>Protocolo</TableHead>
          <TableHead>Modelo</TableHead>
          <TableHead>Veiculo</TableHead>
          <TableHead>Ultima comunicacao</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-24">Acoes</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {devices.length === 0 && (
          <TableRow>
            <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
              Nenhum dispositivo cadastrado
            </TableCell>
          </TableRow>
        )}
        {devices.map((d) => (
          <TableRow key={d.id}>
            <TableCell className="font-mono">{d.imei}</TableCell>
            <TableCell>
              <Badge variant="outline">{d.protocol}</Badge>
            </TableCell>
            <TableCell>{d.model ?? "—"}</TableCell>
            <TableCell>
              {(() => {
                const v = Array.isArray(d.vehicles) ? d.vehicles[0] : d.vehicles;
                return v ? (
                  <Badge variant="secondary" className="gap-1">
                    <Car size={12} /> {v.plate}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground text-sm">Sem veiculo</span>
                );
              })()}
            </TableCell>
            <TableCell>{formatLastCommunication(d.last_communication_at)}</TableCell>
            <TableCell>
              {d.active ? (
                <Badge>Ativo</Badge>
              ) : (
                <Badge variant="secondary">Inativo</Badge>
              )}
            </TableCell>
            <TableCell>
              <div className="flex gap-1">
                <DeviceDialog device={d} />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(d.id)}
                  disabled={deleting === d.id}
                >
                  <Trash2 size={14} className="text-destructive" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
