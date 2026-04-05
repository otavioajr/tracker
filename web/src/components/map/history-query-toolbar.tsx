"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type HistoryQueryToolbarProps = {
  vehicleId: string;
  vehicles: Array<{ id: string; label: string }>;
  startDate: string;
  endDate: string;
  loading: boolean;
  error?: string;
  onVehicleChange: (value: string) => void;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onSearch: () => void;
};

const fieldClassName =
  "h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function HistoryQueryToolbar({
  vehicleId,
  vehicles,
  startDate,
  endDate,
  loading,
  error,
  onVehicleChange,
  onStartDateChange,
  onEndDateChange,
  onSearch,
}: HistoryQueryToolbarProps) {
  const selectedVehicleLabel =
    vehicles.find((vehicle) => vehicle.id === vehicleId)?.label ?? "";

  return (
    <Card size="sm" className="gap-3 bg-card/95">
      <CardContent className="space-y-3">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">
              Veículo
            </label>
            <Select value={vehicleId} onValueChange={(value) => onVehicleChange(value ?? "")}>
              <SelectTrigger
                size="default"
                className="h-9 w-full rounded-lg bg-background"
                disabled={loading || vehicles.length === 0}
              >
                {selectedVehicleLabel ? (
                  <SelectValue>{selectedVehicleLabel}</SelectValue>
                ) : (
                  <SelectValue placeholder="Selecione um veículo" />
                )}
              </SelectTrigger>
              <SelectContent align="start">
                {vehicles.map((vehicle) => (
                  <SelectItem key={vehicle.id} value={vehicle.id}>
                    {vehicle.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">
              Início
            </label>
            <input
              type="datetime-local"
              value={startDate}
              onChange={(event) => onStartDateChange(event.target.value)}
              className={fieldClassName}
              disabled={loading}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">
              Fim
            </label>
            <input
              type="datetime-local"
              value={endDate}
              onChange={(event) => onEndDateChange(event.target.value)}
              className={fieldClassName}
              disabled={loading}
            />
          </div>

          <Button
            type="button"
            size="lg"
            onClick={onSearch}
            disabled={loading}
            className="w-full md:w-auto"
          >
            {loading ? "Buscando..." : "Buscar histórico"}
          </Button>
        </div>

        {error ? (
          <div className="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
