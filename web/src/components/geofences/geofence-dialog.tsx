"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { GeofenceMeta, GeofenceType } from "@/lib/geofences/types";

type Props = {
  open: boolean;
  title: string;
  description?: string;
  initialValues?: Partial<GeofenceMeta>;
  submitting?: boolean;
  errorMessage?: string | null;
  onCancel: () => void;
  onSubmit: (meta: GeofenceMeta) => void;
};

export function GeofenceDialog({
  open,
  title,
  description,
  initialValues,
  submitting = false,
  errorMessage,
  onCancel,
  onSubmit,
}: Props) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [type, setType] = useState<GeofenceType>(initialValues?.type ?? "inclusion");
  const [active, setActive] = useState<boolean>(initialValues?.active ?? true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ name: name.trim(), type, active });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="geofence-name">Nome</Label>
            <Input
              id="geofence-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              required
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="geofence-type">Tipo</Label>
            <Select value={type} onValueChange={(v) => setType(v as GeofenceType)}>
              <SelectTrigger id="geofence-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inclusion">Zona permitida</SelectItem>
                <SelectItem value="exclusion">Zona proibida</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="geofence-active">Ativa</Label>
            <Switch id="geofence-active" checked={active} onCheckedChange={setActive} />
          </div>

          {errorMessage && (
            <p className="text-sm text-destructive" role="alert">
              {errorMessage}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting || name.trim().length === 0}>
              {submitting ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
