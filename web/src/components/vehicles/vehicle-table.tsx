"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { VehicleDialog } from "./vehicle-dialog";
import { deleteVehicle } from "@/lib/actions/vehicles";
import { Trash2, Cpu } from "lucide-react";
import { useState } from "react";

type Vehicle = {
  id: string;
  plate: string;
  brand: string | null;
  model: string | null;
  year: number | null;
  color: string | null;
  active: boolean;
  device_id: string | null;
  devices: { imei: string; protocol: string; last_communication_at: string | null } | null;
};

export function VehicleTable({ vehicles }: { vehicles: Vehicle[] }) {
  const [deleting, setDeleting] = useState<string | null>(null);

  async function handleDelete(id: string) {
    if (!confirm("Tem certeza que deseja excluir este veiculo?")) return;
    setDeleting(id);
    await deleteVehicle(id);
    setDeleting(null);
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Placa</TableHead>
          <TableHead>Marca/Modelo</TableHead>
          <TableHead>Ano</TableHead>
          <TableHead>Cor</TableHead>
          <TableHead>Dispositivo</TableHead>
          <TableHead className="w-24">Acoes</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {vehicles.length === 0 && (
          <TableRow>
            <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
              Nenhum veiculo cadastrado
            </TableCell>
          </TableRow>
        )}
        {vehicles.map((v) => (
          <TableRow key={v.id}>
            <TableCell className="font-medium">{v.plate}</TableCell>
            <TableCell>{[v.brand, v.model].filter(Boolean).join(" ") || "—"}</TableCell>
            <TableCell>{v.year ?? "—"}</TableCell>
            <TableCell>{v.color ?? "—"}</TableCell>
            <TableCell>
              {v.devices ? (
                <Badge variant="outline" className="gap-1">
                  <Cpu size={12} /> {v.devices.imei}
                </Badge>
              ) : (
                <span className="text-muted-foreground text-sm">Sem dispositivo</span>
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
  );
}
