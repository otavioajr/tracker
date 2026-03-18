"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { deleteGeofence } from "@/lib/actions/geofences";
import { Trash2 } from "lucide-react";
import { useState } from "react";

type Geofence = {
  id: string;
  name: string;
  type: string;
  active: boolean;
  created_at: string;
};

export function GeofenceTable({ geofences }: { geofences: Geofence[] }) {
  const [deleting, setDeleting] = useState<string | null>(null);

  async function handleDelete(id: string) {
    if (!confirm("Tem certeza que deseja excluir esta geocerca?")) return;
    setDeleting(id);
    await deleteGeofence(id);
    setDeleting(null);
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nome</TableHead>
          <TableHead>Tipo</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Criada em</TableHead>
          <TableHead className="w-24">Acoes</TableHead>
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
          <TableRow key={g.id}>
            <TableCell className="font-medium">{g.name}</TableCell>
            <TableCell>
              <Badge variant={g.type === "exclusao" ? "destructive" : "default"}>
                {g.type === "exclusao" ? "Exclusao" : "Inclusao"}
              </Badge>
            </TableCell>
            <TableCell>
              <Badge variant={g.active ? "default" : "secondary"}>
                {g.active ? "Ativa" : "Inativa"}
              </Badge>
            </TableCell>
            <TableCell>
              {new Date(g.created_at).toLocaleDateString("pt-BR")}
            </TableCell>
            <TableCell>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDelete(g.id)}
                disabled={deleting === g.id}
              >
                <Trash2 size={14} className="text-destructive" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
