"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createDevice, updateDevice } from "@/lib/actions/devices";
import { Plus, Pencil } from "lucide-react";

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
  const isEdit = !!device;

  async function handleSubmit(formData: FormData) {
    setError(null);
    const result = isEdit
      ? await updateDevice(device!.id, formData)
      : await createDevice(formData);

    if (result?.error) {
      setError(result.error);
    } else {
      setOpen(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={
        isEdit
          ? <Button variant="ghost" size="sm"><Pencil size={14} /></Button>
          : <Button><Plus size={16} className="mr-2" /> Novo Dispositivo</Button>
      } />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Dispositivo" : "Novo Dispositivo"}</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 text-sm p-3 rounded-md">
              {error}
            </div>
          )}
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
          {isEdit && (
            <input
              type="hidden"
              name="active"
              value={device?.active ? "true" : "false"}
            />
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit">{isEdit ? "Salvar" : "Criar"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
