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
import { createVehicle, updateVehicle } from "@/lib/actions/vehicles";
import { Plus, Pencil } from "lucide-react";

type Vehicle = {
  id: string;
  name: string | null;
  plate: string;
  brand: string | null;
  model: string | null;
  year: number | null;
  color: string | null;
};

export function VehicleDialog({ vehicle }: { vehicle?: Vehicle }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = !!vehicle;

  async function handleSubmit(formData: FormData) {
    setError(null);
    const result = isEdit
      ? await updateVehicle(vehicle!.id, formData)
      : await createVehicle(formData);

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
          : <Button><Plus size={16} className="mr-2" /> Novo Veiculo</Button>
      } />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Veiculo" : "Novo Veiculo"}</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 text-sm p-3 rounded-md">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="name">Nome / Apelido</Label>
            <Input id="name" name="name" defaultValue={vehicle?.name ?? ""} placeholder="Ex: Carro do João" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="plate">Placa</Label>
            <Input id="plate" name="plate" required defaultValue={vehicle?.plate ?? ""} placeholder="ABC-1234" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="brand">Marca</Label>
              <Input id="brand" name="brand" defaultValue={vehicle?.brand ?? ""} placeholder="Toyota" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="model">Modelo</Label>
              <Input id="model" name="model" defaultValue={vehicle?.model ?? ""} placeholder="Hilux" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="year">Ano</Label>
              <Input id="year" name="year" type="number" defaultValue={vehicle?.year ?? ""} placeholder="2024" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="color">Cor</Label>
              <Input id="color" name="color" defaultValue={vehicle?.color ?? ""} placeholder="Branco" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit">{isEdit ? "Salvar" : "Criar"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
