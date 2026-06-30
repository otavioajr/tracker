"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { markAlertRead } from "@/lib/actions/alerts";
import { AlertTriangle, Eye, Info, Zap } from "lucide-react";
import { useEffect, useState } from "react";

export const ALERT_READ_EVENT = "tracker:alert-read";
export const ALERT_READ_ALL_EVENT = "tracker:alert-read-all";

type AlertReadEventDetail = {
  id: string;
  countChanged: boolean;
};

function dispatchAlertReadEvent(detail: AlertReadEventDetail) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent<AlertReadEventDetail>(ALERT_READ_EVENT, {
      detail,
    })
  );
}

type Vehicle = { plate: string } | null;
type Device = { imei: string; vehicles: Vehicle | Vehicle[] | null } | null;

export type AlertFeedAlert = {
  id: string;
  type: string;
  severity: string;
  message: string;
  read: boolean;
  created_at: string;
  devices: Device | Device[] | null;
};

type AlertFeedProps = {
  alerts: AlertFeedAlert[];
  variant?: "page" | "dropdown";
  onAlertRead?: (id: string) => void;
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

export function AlertFeed({
  alerts,
  variant = "page",
  onAlertRead,
}: AlertFeedProps) {
  const [items, setItems] = useState(alerts);
  const [marking, setMarking] = useState<string | null>(null);

  useEffect(() => {
    setItems(alerts);
  }, [alerts]);

  useEffect(() => {
    function handleAlertRead(event: Event) {
      const { detail } = event as CustomEvent<AlertReadEventDetail>;
      const id = detail?.id;

      if (!id) return;

      setItems((current) =>
        current.map((item) => (item.id === id ? { ...item, read: true } : item))
      );
    }

    function handleAlertReadAll() {
      setItems((current) =>
        current.map((item) => (item.read ? item : { ...item, read: true }))
      );
    }

    window.addEventListener(ALERT_READ_EVENT, handleAlertRead);
    window.addEventListener(ALERT_READ_ALL_EVENT, handleAlertReadAll);

    return () => {
      window.removeEventListener(ALERT_READ_EVENT, handleAlertRead);
      window.removeEventListener(ALERT_READ_ALL_EVENT, handleAlertReadAll);
    };
  }, []);

  async function handleMarkRead(id: string) {
    const wasUnread = items.some((item) => item.id === id && !item.read);

    setMarking(id);

    try {
      const result = await markAlertRead(id);
      if (result && "error" in result) {
        return;
      }

      setItems((current) =>
        current.map((item) => (item.id === id ? { ...item, read: true } : item))
      );

      if (wasUnread) {
        dispatchAlertReadEvent({ id, countChanged: true });
        onAlertRead?.(id);
      }
    } catch {
      return;
    } finally {
      setMarking(null);
    }
  }

  if (items.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Nenhum alerta encontrado.
      </p>
    );
  }

  const isDropdown = variant === "dropdown";

  return (
    <div className={cn(isDropdown ? "space-y-2" : "space-y-3")}>
      {items.map((alert) => (
        <Card
          key={alert.id}
          size={isDropdown ? "sm" : "default"}
          className={cn(!alert.read && "bg-accent/50")}
        >
          <CardContent
            className={cn(
              "flex items-start gap-3",
              isDropdown ? "py-3" : "py-4"
            )}
          >
            <div className="mt-0.5">{getSeverityIcon(alert.severity)}</div>

            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <Badge variant={getSeverityVariant(alert.severity)}>
                  {alert.type}
                </Badge>
                <span
                  className={cn(
                    "font-medium",
                    isDropdown ? "text-[13px]" : "text-sm"
                  )}
                >
                  {getVehicleLabel(alert.devices)}
                </span>
              </div>
              <p
                className={cn(
                  "text-muted-foreground",
                  isDropdown ? "text-[13px]" : "text-sm"
                )}
              >
                {alert.message}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatDate(alert.created_at)}
              </p>
            </div>

            {!alert.read && (
              <Button
                variant="ghost"
                size="sm"
                disabled={marking === alert.id}
                onClick={() => handleMarkRead(alert.id)}
                aria-label="Marcar alerta como lido"
                title="Marcar alerta como lido"
              >
                <Eye size={14} />
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
