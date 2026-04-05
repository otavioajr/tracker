"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";

import { createDevice, updateDevice } from "@/lib/actions/devices";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Device = {
  id: string;
  imei: string;
  protocol: string;
  model: string | null;
  active: boolean;
};

export function DeviceDialog({ device }: { device?: Device }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = Boolean(device);

  async function handleSubmit(formData: FormData) {
    setError(null);

    const result = isEdit
      ? await updateDevice(device!.id, formData)
      : await createDevice(formData);

    if (result?.error) {
      setError(result.error);
      return;
    }

    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          isEdit ? (
            <Button variant="ghost" size="sm" aria-label="Editar dispositivo">
              <Pencil className="size-4" />
            </Button>
          ) : (
            <Button>
              <Plus className="mr-2 size-4" />
              Novo Dispositivo
            </Button>
          )
        }
      />

      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Dispositivo" : "Novo Dispositivo"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Atualize o modelo exibido e confirme os dados usados no inventário operacional."
              : "Cadastre o IMEI e o modelo para liberar o provisionamento e o vínculo com a frota."}
          </DialogDescription>
        </DialogHeader>

        <form action={handleSubmit} className="space-y-4">
          {error ? (
            <div
              role="alert"
              className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="imei">IMEI</Label>
            <Input
              id="imei"
              name="imei"
              required
              disabled={isEdit}
              defaultValue={device?.imei ?? ""}
              placeholder="000000000000000"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="protocol">Protocolo</Label>
            <Input
              id="protocol"
              name="protocol"
              disabled
              defaultValue={device?.protocol ?? "suntech"}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="model">Modelo</Label>
            <Input
              id="model"
              name="model"
              defaultValue={device?.model ?? ""}
              placeholder="ST300"
            />
          </div>

          {isEdit ? (
            <input type="hidden" name="active" value={device?.active ? "true" : "false"} />
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit">{isEdit ? "Salvar alterações" : "Criar dispositivo"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
