"use client";

import { useEffect, useState } from "react";
import { getDevices } from "@/lib/actions/devices";
import { getTripsReport, TripReport } from "@/lib/actions/reports";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";

type Device = {
  id: string;
  imei: string;
  vehicles: { id: string; plate: string } | { id: string; plate: string }[] | null;
};

function getDeviceLabel(device: Device): string {
  const vehicles = device.vehicles;
  const plate = Array.isArray(vehicles)
    ? vehicles[0]?.plate
    : vehicles?.plate;
  return plate ? `${plate} (${device.imei})` : device.imei;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR");
}

export default function ReportsPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [trips, setTrips] = useState<TripReport[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getDevices()
      .then((data) => {
        setDevices((data as Device[]) ?? []);
        if (data && data.length > 0) setDeviceId(data[0].id);
      })
      .catch(() => setError("Erro ao carregar dispositivos"));
  }, []);

  async function handleSubmit() {
    if (!deviceId || !startDate || !endDate) {
      setError("Preencha todos os campos");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const data = await getTripsReport(deviceId, startDate, endDate);
      setTrips(data);
    } catch {
      setError("Erro ao gerar relatorio");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Relatorios</h1>

      <Card>
        <CardHeader>
          <CardTitle>Relatorio de Viagens</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-muted-foreground">
                Dispositivo
              </label>
              <select
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {getDeviceLabel(d)}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-muted-foreground">
                Inicio
              </label>
              <input
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-muted-foreground">
                Fim
              </label>
              <input
                type="datetime-local"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <button
              onClick={handleSubmit}
              disabled={loading}
              className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium shadow-sm hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? "Gerando..." : "Gerar Relatorio"}
            </button>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {/* Results Table */}
          {trips === null ? (
            <p className="text-sm text-muted-foreground py-4">
              Selecione um dispositivo e periodo
            </p>
          ) : trips.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              Nenhuma viagem encontrada
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Veiculo</TableHead>
                  <TableHead>Inicio</TableHead>
                  <TableHead>Fim</TableHead>
                  <TableHead>Duracao (min)</TableHead>
                  <TableHead>Vel. Max (km/h)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trips.map((trip, index) => (
                  <TableRow key={index}>
                    <TableCell>{trip.plate}</TableCell>
                    <TableCell>{formatDateTime(trip.start_time)}</TableCell>
                    <TableCell>{formatDateTime(trip.end_time)}</TableCell>
                    <TableCell>{trip.duration_min}</TableCell>
                    <TableCell>{trip.max_speed}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
