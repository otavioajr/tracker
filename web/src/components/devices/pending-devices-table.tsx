"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { Link2, Network, ShieldX } from "lucide-react";

import {
  createDeviceAndAssignVehicleFromPending,
  createDeviceAndVehicleFromPending,
  createDeviceFromPending,
  dismissPendingDevice,
  linkPendingDevice,
} from "@/lib/actions/pending-devices";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

type VehicleOption = {
  id: string;
  name: string | null;
  plate: string;
};

type LinkMode =
  | "existing-device"
  | "new-device"
  | "existing-vehicle"
  | "new-vehicle";

export function PendingDevicesTable({
  pending,
  devices,
  vehicles,
}: {
  pending: PendingDevice[];
  devices: Device[];
  vehicles: VehicleOption[];
}) {
  if (pending.length === 0) return null;

  const unlinkedDevices = devices.filter((device) => !device.serial_number);

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
          <PendingDeviceRow
            key={device.id}
            device={device}
            vehicles={vehicles}
            unlinkedDevices={unlinkedDevices}
            onDismiss={handleDismiss}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function PendingDeviceRow({
  device,
  unlinkedDevices,
  vehicles,
  onDismiss,
}: {
  device: PendingDevice;
  unlinkedDevices: Device[];
  vehicles: VehicleOption[];
  onDismiss: (pendingId: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<LinkMode>("existing-device");
  const [submittingMode, setSubmittingMode] = useState<LinkMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState("");

  const isSubmitting = submittingMode !== null;

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);

    if (!nextOpen) {
      setMode("existing-device");
      setSubmittingMode(null);
      setSelectedVehicleId("");
      setError(null);
    }
  }

  async function handleExistingDeviceLink(deviceId: string) {
    setError(null);
    setSubmittingMode("existing-device");

    try {
      const result = await linkPendingDevice(device.id, deviceId);

      if (result && "error" in result) {
        setError(result.error ?? "Não foi possível concluir o vínculo");
        return;
      }

      handleOpenChange(false);
    } finally {
      setSubmittingMode(null);
    }
  }

  async function handleCreateDevice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmittingMode("new-device");

    try {
      const result = await createDeviceFromPending(device.id, new FormData(event.currentTarget));

      if (result && "error" in result) {
        setError(result.error ?? "Não foi possível criar o dispositivo");
        return;
      }

      handleOpenChange(false);
    } finally {
      setSubmittingMode(null);
    }
  }

  async function handleAssignVehicle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmittingMode("existing-vehicle");

    try {
      const result = await createDeviceAndAssignVehicleFromPending(
        device.id,
        selectedVehicleId,
        new FormData(event.currentTarget),
      );

      if (result && "error" in result) {
        setError(result.error ?? "Não foi possível vincular ao veículo");
        return;
      }

      handleOpenChange(false);
    } finally {
      setSubmittingMode(null);
    }
  }

  async function handleCreateVehicle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmittingMode("new-vehicle");

    try {
      const result = await createDeviceAndVehicleFromPending(
        device.id,
        new FormData(event.currentTarget),
      );

      if (result && "error" in result) {
        setError(result.error ?? "Não foi possível criar o veículo");
        return;
      }

      handleOpenChange(false);
    } finally {
      setSubmittingMode(null);
    }
  }

  return (
    <div className="grid gap-3 rounded-xl border border-border/60 bg-background/80 p-4 lg:grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,0.8fr))_auto]">
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
        value={formatDeviceTimestamp(device.first_seen_at)}
      />
      <InfoColumn
        label="Última conexão"
        value={formatDeviceLastCommunication(device.last_seen_at)}
      />
      <InfoColumn label="Mensagens" value={String(device.message_count)} />

      <div className="flex items-center gap-2 lg:justify-end">
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger
            render={
              <Button disabled={isSubmitting}>
                <Link2 className="mr-2 size-4" />
                Vincular
              </Button>
            }
          />
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Vincular serial {device.serial}</DialogTitle>
              <DialogDescription>
                Escolha como deseja resolver esta pendência operacional.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="font-mono">
                  Serial detectado: {device.serial}
                </Badge>
                <Badge variant="secondary">{device.protocol}</Badge>
              </div>

              <ModeSelector
                currentMode={mode}
                disabled={isSubmitting}
                onSelect={(nextMode) => {
                  setMode(nextMode);
                  setError(null);
                }}
              />

              {error ? (
                <div
                  role="alert"
                  className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {error}
                </div>
              ) : null}

              {mode === "existing-device" ? (
                <div className="space-y-2">
                  {unlinkedDevices.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border/70 px-3 py-4 text-sm text-muted-foreground">
                      Todos os dispositivos cadastrados já possuem serial vinculado.
                    </p>
                  ) : (
                    unlinkedDevices.map((candidate) => (
                      <Button
                        key={candidate.id}
                        type="button"
                        variant="outline"
                        className="w-full justify-start"
                        disabled={isSubmitting}
                        onClick={() => handleExistingDeviceLink(candidate.id)}
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
              ) : null}

              {mode === "new-device" ? (
                <DeviceDetailsForm
                  submitLabel="Criar dispositivo"
                  submitting={submittingMode === "new-device"}
                  onSubmit={handleCreateDevice}
                />
              ) : null}

              {mode === "existing-vehicle" ? (
                <form className="space-y-4" onSubmit={handleAssignVehicle}>
                  <DeviceFields />
                  <div className="space-y-2">
                    <Label htmlFor={`vehicle-${device.id}`}>Veículo</Label>
                    {vehicles.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-border/70 px-3 py-4 text-sm text-muted-foreground">
                        Nenhum veículo disponível para receber este dispositivo.
                      </p>
                    ) : (
                      <select
                        id={`vehicle-${device.id}`}
                        value={selectedVehicleId}
                        onChange={(event) => setSelectedVehicleId(event.target.value)}
                        className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                      >
                        <option value="">Selecione um veículo</option>
                        {vehicles.map((vehicle) => (
                          <option key={vehicle.id} value={vehicle.id}>
                            {vehicle.name ? `${vehicle.name} · ${vehicle.plate}` : vehicle.plate}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <DialogFooter>
                    <Button
                      type="submit"
                      disabled={
                        submittingMode === "existing-vehicle" ||
                        vehicles.length === 0 ||
                        !selectedVehicleId
                      }
                    >
                      Vincular ao veículo
                    </Button>
                  </DialogFooter>
                </form>
              ) : null}

              {mode === "new-vehicle" ? (
                <form className="space-y-4" onSubmit={handleCreateVehicle}>
                  <DeviceFields />
                  <VehicleFields />
                  <DialogFooter>
                    <Button type="submit" disabled={submittingMode === "new-vehicle"}>
                      Criar veículo e vincular
                    </Button>
                  </DialogFooter>
                </form>
              ) : null}
            </div>
          </DialogContent>
        </Dialog>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDismiss(device.id)}
          aria-label="Ignorar pendência"
        >
          <ShieldX className="size-4 text-muted-foreground" />
        </Button>
      </div>
    </div>
  );
}

function ModeSelector({
  currentMode,
  disabled,
  onSelect,
}: {
  currentMode: LinkMode;
  disabled: boolean;
  onSelect: (mode: LinkMode) => void;
}) {
  const options: Array<{ mode: LinkMode; label: string }> = [
    { mode: "existing-device", label: "Usar dispositivo existente" },
    { mode: "new-device", label: "Novo dispositivo" },
    { mode: "existing-vehicle", label: "Vincular a carro existente" },
    { mode: "new-vehicle", label: "Cadastrar novo carro" },
  ];

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map((option) => (
        <Button
          key={option.mode}
          type="button"
          variant={currentMode === option.mode ? "default" : "outline"}
          disabled={disabled}
          aria-pressed={currentMode === option.mode}
          className="justify-start"
          onClick={() => onSelect(option.mode)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

function DeviceDetailsForm({
  submitLabel,
  submitting,
  onSubmit,
}: {
  submitLabel: string;
  submitting: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <DeviceFields />
      <DialogFooter>
        <Button type="submit" disabled={submitting}>
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

function DeviceFields() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="imei">IMEI</Label>
        <Input id="imei" name="imei" required placeholder="861234567890123" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="model">Modelo</Label>
        <Input id="model" name="model" placeholder="ST300" />
      </div>
    </div>
  );
}

function VehicleFields() {
  return (
    <div className="space-y-4 rounded-xl border border-border/60 p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Nome / Apelido</Label>
          <Input id="name" name="name" placeholder="Ex: Fiorino do João" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="plate">Placa</Label>
          <Input id="plate" name="plate" required placeholder="ABC1D23" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="brand">Marca</Label>
          <Input id="brand" name="brand" placeholder="Fiat" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="vehicle_model">Modelo do veículo</Label>
          <Input
            id="vehicle_model"
            name="vehicle_model"
            placeholder="Fiorino Endurance"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="year">Ano</Label>
          <Input id="year" name="year" type="number" placeholder="2026" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="color">Cor</Label>
          <Input id="color" name="color" placeholder="Branco" />
        </div>
      </div>
    </div>
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

function formatDeviceTimestamp(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}
