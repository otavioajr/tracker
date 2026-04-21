"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Trash2, MapPin } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  deleteGeofence,
  updateGeofenceMeta,
} from "@/lib/actions/geofences";
import type { GeofenceRow, GeofenceType } from "@/lib/geofences/types";

type Row = Pick<GeofenceRow, "id" | "name" | "type" | "active" | "created_at">;

export function GeofenceTable({ geofences }: { geofences: Row[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nome</TableHead>
          <TableHead className="w-44">Tipo</TableHead>
          <TableHead className="w-24">Ativa</TableHead>
          <TableHead className="w-32">Criada em</TableHead>
          <TableHead className="w-32 text-right">Ações</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {geofences.length === 0 && (
          <TableRow>
            <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
              Nenhuma geocerca cadastrada
            </TableCell>
          </TableRow>
        )}
        {geofences.map((g) => (
          <GeofenceRowItem key={g.id} row={g} />
        ))}
      </TableBody>
    </Table>
  );
}

function GeofenceRowItem({ row }: { row: Row }) {
  const [name, setName] = useState(row.name ?? "");
  const [type, setType] = useState<GeofenceType>((row.type ?? "inclusion") as GeofenceType);
  const [active, setActive] = useState<boolean>(row.active ?? true);
  const [, startTransition] = useTransition();
  const [deleting, setDeleting] = useState(false);

  const commitMeta = (patch: Partial<{ name: string; type: GeofenceType; active: boolean }>) => {
    startTransition(async () => {
      const result = await updateGeofenceMeta(row.id as string, patch);
      if ("error" in result) {
        toast.error(`Falha ao salvar: ${result.error}`);
        setName(row.name ?? "");
        setType((row.type ?? "inclusion") as GeofenceType);
        setActive(row.active ?? true);
      }
    });
  };

  const handleDelete = async () => {
    if (!confirm(`Excluir geocerca "${row.name}"? Esta ação não pode ser desfeita.`)) return;
    setDeleting(true);
    const result = await deleteGeofence(row.id as string);
    setDeleting(false);
    if ("error" in result) toast.error(`Falha ao excluir: ${result.error}`);
  };

  return (
    <TableRow>
      <TableCell>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (name.trim() !== row.name) commitMeta({ name });
          }}
          maxLength={100}
          className="h-8"
        />
      </TableCell>
      <TableCell>
        <Select
          value={type}
          onValueChange={(v) => {
            const next = v as GeofenceType;
            setType(next);
            commitMeta({ type: next });
          }}
        >
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="inclusion">Zona permitida</SelectItem>
            <SelectItem value="exclusion">Zona proibida</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Switch
          checked={active}
          onCheckedChange={(next) => {
            setActive(next);
            commitMeta({ active: next });
          }}
        />
      </TableCell>
      <TableCell>
        {row.created_at ? new Date(row.created_at).toLocaleDateString("pt-BR") : "—"}
      </TableCell>
      <TableCell className="text-right space-x-1">
        <Link
          href={`/geofences/${row.id}/edit-shape`}
          title="Editar forma"
          className={buttonVariants({ size: "sm", variant: "ghost" })}
        >
          <MapPin size={14} />
        </Link>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleDelete}
          disabled={deleting}
          title="Excluir"
        >
          <Trash2 size={14} className="text-destructive" />
        </Button>
      </TableCell>
    </TableRow>
  );
}
