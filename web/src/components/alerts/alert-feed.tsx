"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { markAlertRead } from "@/lib/actions/alerts";
import { AlertTriangle, Check, Info, Zap } from "lucide-react";
import { useState } from "react";

type Vehicle = { plate: string } | null;
type Device = { imei: string; vehicles: Vehicle | Vehicle[] | null } | null;

type Alert = {
  id: string;
  type: string;
  severity: string;
  message: string;
  read: boolean;
  created_at: string;
  devices: Device | Device[] | null;
};

function getSeverityIcon(severity: string) {
  switch (severity) {
    case "critical":
      return <AlertTriangle size={16} className="text-destructive" />;
    case "warning":
      return <Zap size={16} className="text-yellow-500" />;
    default:
      return <Info size={16} className="text-blue-500" />;
  }
}

function getSeverityVariant(
  severity: string
): "destructive" | "default" | "secondary" {
  switch (severity) {
    case "critical":
      return "destructive";
    case "warning":
      return "default";
    default:
      return "secondary";
  }
}

function getVehicleLabel(device: Device | Device[] | null): string {
  const d = Array.isArray(device) ? device[0] : device;
  if (!d) return "—";

  const vehicles = d.vehicles;
  const vehicle = Array.isArray(vehicles) ? vehicles[0] : vehicles;

  if (vehicle?.plate) return vehicle.plate;
  return d.imei ?? "—";
}

function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateStr));
}

export function AlertFeed({ alerts }: { alerts: Alert[] }) {
  const [marking, setMarking] = useState<string | null>(null);

  async function handleMarkRead(id: string) {
    setMarking(id);
    await markAlertRead(id);
    setMarking(null);
  }

  if (alerts.length === 0) {
    return (
      <p className="text-muted-foreground text-sm py-8 text-center">
        Nenhum alerta encontrado.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {alerts.map((alert) => (
        <Card
          key={alert.id}
          className={alert.read ? "" : "bg-accent/50"}
        >
          <CardContent className="flex items-start gap-3 py-4">
            <div className="mt-0.5">{getSeverityIcon(alert.severity)}</div>

            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <Badge variant={getSeverityVariant(alert.severity)}>
                  {alert.type}
                </Badge>
                <span className="text-sm font-medium">
                  {getVehicleLabel(alert.devices)}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{alert.message}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {formatDate(alert.created_at)}
              </p>
            </div>

            {!alert.read && (
              <Button
                variant="ghost"
                size="sm"
                disabled={marking === alert.id}
                onClick={() => handleMarkRead(alert.id)}
                title="Marcar como lido"
              >
                <Check size={14} />
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
