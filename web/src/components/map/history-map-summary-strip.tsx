import type { HistorySummary } from "@/lib/history/history-player-utils";

import { Card, CardContent } from "@/components/ui/card";

type HistoryMapSummaryStripProps = {
  summary: HistorySummary | null;
  loading: boolean;
};

const metricLabels = [
  { key: "totalDistanceKm", label: "Distância" },
  { key: "totalDurationMinutes", label: "Duração" },
  { key: "stoppedMinutes", label: "Tempo parado" },
  { key: "maxSpeedKmh", label: "Velocidade máxima" },
] as const;

export function HistoryMapSummaryStrip({
  summary,
  loading,
}: HistoryMapSummaryStripProps) {
  return (
    <Card size="sm" className="bg-card/92">
      <CardContent className="flex gap-3 overflow-x-auto pb-1">
        {metricLabels.map((metric) => (
          <div
            key={metric.key}
            className="min-w-[10.5rem] flex-1 rounded-lg border border-border/60 bg-background/70 px-3 py-3"
          >
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {metric.label}
            </p>
            {loading ? (
              <div className="mt-2 h-7 w-24 animate-pulse rounded-md bg-muted" />
            ) : (
              <p className="mt-2 text-xl font-semibold tracking-tight text-foreground">
                {formatMetric(metric.key, summary)}
              </p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function formatMetric(
  key: (typeof metricLabels)[number]["key"],
  summary: HistorySummary | null
) {
  if (!summary) return "--";

  switch (key) {
    case "totalDistanceKm":
      return `${summary.totalDistanceKm.toFixed(1)} km`;
    case "totalDurationMinutes":
      return formatDuration(summary.totalDurationMinutes);
    case "stoppedMinutes":
      return formatDuration(summary.stoppedMinutes);
    case "maxSpeedKmh":
      return `${Math.round(summary.maxSpeedKmh)} km/h`;
    default:
      return "--";
  }
}

function formatDuration(totalMinutes: number) {
  const roundedMinutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(roundedMinutes / 60);
  const minutes = roundedMinutes % 60;

  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours}h`;

  return `${hours}h ${minutes.toString().padStart(2, "0")}min`;
}
