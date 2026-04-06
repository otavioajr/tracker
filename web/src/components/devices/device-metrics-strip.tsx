import type { ReactNode } from "react";
import { Activity, AlertTriangle, Car } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

import type { DeviceMetrics } from "./device-presenters";

export function DeviceMetricsStrip({ metrics }: { metrics: DeviceMetrics }) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <MetricCard
        label="Pendentes"
        value={metrics.pending}
        icon={<AlertTriangle className="size-4 text-amber-600" />}
        tone="text-amber-700"
      />
      <MetricCard
        label="Ativos"
        value={metrics.active}
        icon={<Activity className="size-4 text-emerald-600" />}
        tone="text-emerald-700"
      />
      <MetricCard
        label="Sem veículo"
        value={metrics.unassigned}
        icon={<Car className="size-4 text-slate-500" />}
        tone="text-slate-700"
      />
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: ReactNode;
  tone: string;
}) {
  return (
    <Card size="sm" className="border border-border/60 bg-card/95">
      <CardContent className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {label}
          </p>
          <p className={`mt-2 text-3xl font-semibold tracking-tight ${tone}`}>
            {value}
          </p>
        </div>
        <div className="rounded-full border border-border/60 bg-muted/40 p-2">
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}
