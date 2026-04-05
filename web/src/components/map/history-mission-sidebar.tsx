"use client";

import type { ReactNode } from "react";

import type { VehiclePosition } from "@/lib/actions/positions";
import type {
  HistoryHighlight,
  HistorySummary,
} from "@/lib/history/history-player-utils";
import { formatHistoryTimestamp } from "@/lib/history/history-player-utils";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type HistoryMissionSidebarProps = {
  summary: HistorySummary | null;
  highlights: HistoryHighlight[];
  currentPosition: VehiclePosition | null;
  loading: boolean;
  hasSearched: boolean;
  onHighlightSelect: (index: number) => void;
};

export function HistoryMissionSidebar({
  summary,
  highlights,
  currentPosition,
  loading,
  hasSearched,
  onHighlightSelect,
}: HistoryMissionSidebarProps) {
  const beforeSearch = !hasSearched;
  const noResults = hasSearched && !loading && (!summary || summary.totalPoints === 0);
  const hasResults = Boolean(summary && summary.totalPoints > 0);

  return (
    <aside className="flex w-full shrink-0 flex-col gap-3 xl:sticky xl:top-4 xl:w-[22rem] xl:self-start">
      <Card className="gap-4 bg-card/98">
        <CardHeader className="border-b border-border/60 pb-4">
          <CardTitle>Resumo da viagem</CardTitle>
          <CardDescription>
            Visão operacional do trecho consultado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {beforeSearch ? (
            <SidebarMessage>
              Escolha um veículo e um período para montar a missão.
            </SidebarMessage>
          ) : loading ? (
            <SummaryLoadingState />
          ) : noResults ? (
            <SidebarMessage>
              Nenhum trajeto encontrado no período consultado.
            </SidebarMessage>
          ) : hasResults ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-border/60 bg-background/70 p-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  Distância total
                </p>
                <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
                  {summary.totalDistanceKm.toFixed(1)} km
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {summary.totalPoints} pontos telemétricos no trajeto.
                </p>
              </div>

              <dl className="grid grid-cols-2 gap-3">
                <MetricTile label="Duração" value={formatDuration(summary.totalDurationMinutes)} />
                <MetricTile label="Tempo parado" value={formatDuration(summary.stoppedMinutes)} />
                <MetricTile label="Tempo em movimento" value={formatDuration(summary.movingMinutes)} />
                <MetricTile
                  label="Velocidade máxima"
                  value={`${Math.round(summary.maxSpeedKmh)} km/h`}
                />
              </dl>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card size="sm" className="bg-card/94">
        <CardHeader className="border-b border-border/60 pb-3">
          <CardTitle>Paradas e destaques</CardTitle>
          <CardDescription>
            Saltos rápidos para eventos importantes do percurso.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {beforeSearch ? (
            <SidebarMessage>
              Os destaques aparecem depois da primeira consulta.
            </SidebarMessage>
          ) : loading ? (
            <ListLoadingState />
          ) : noResults ? (
            <SidebarMessage>Sem destaques para este período.</SidebarMessage>
          ) : highlights.length === 0 ? (
            <SidebarMessage>O trajeto não gerou destaques relevantes.</SidebarMessage>
          ) : (
            <div className="space-y-2">
              {highlights.map((highlight, index) => {
                const display = getHighlightDisplay(highlights, index);

                return (
                  <button
                    key={`${highlight.kind}-${highlight.index}-${highlight.timestamp}`}
                    type="button"
                    onClick={() => onHighlightSelect(highlight.index)}
                    className="flex w-full items-start justify-between gap-3 rounded-lg border border-border/60 bg-background/65 px-3 py-2.5 text-left transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={highlight.kind === "stop" ? "secondary" : "outline"}>
                          {display.badge}
                        </Badge>
                        <span className="truncate font-medium text-foreground">
                          {display.title}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {formatHistoryTimestamp(highlight.timestamp)}
                      </p>
                    </div>
                    <span className="text-xs font-medium text-muted-foreground">
                      #{highlight.index + 1}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card size="sm" className="bg-card/94">
        <CardHeader className="border-b border-border/60 pb-3">
          <CardTitle>Ponto selecionado</CardTitle>
          <CardDescription>
            Leitura instantânea do frame atual da reprodução.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {beforeSearch ? (
            <SidebarMessage>
              O ponto atual será exibido aqui durante a navegação do histórico.
            </SidebarMessage>
          ) : loading ? (
            <CurrentPointLoadingState />
          ) : noResults ? (
            <SidebarMessage>Nenhum ponto disponível para inspeção.</SidebarMessage>
          ) : currentPosition ? (
            <dl className="space-y-3">
              <InfoRow
                label="Horário"
                value={formatHistoryTimestamp(currentPosition.server_time)}
              />
              <InfoRow
                label="Velocidade"
                value={`${Math.round(currentPosition.speed)} km/h`}
              />
              <InfoRow
                label="Ignição"
                value={currentPosition.ignition ? "Ligada" : "Desligada"}
              />
              <InfoRow
                label="Direção"
                value={`${Math.round(currentPosition.heading)}°`}
              />
              <InfoRow
                label="Latitude"
                value={currentPosition.latitude.toFixed(5)}
              />
              <InfoRow
                label="Longitude"
                value={currentPosition.longitude.toFixed(5)}
              />
            </dl>
          ) : (
            <SidebarMessage>
              Selecione um destaque ou mova a timeline para inspecionar um ponto.
            </SidebarMessage>
          )}
        </CardContent>
      </Card>
    </aside>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/60 p-3">
      <dt className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-lg font-semibold tracking-tight text-foreground">
        {value}
      </dd>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border/50 bg-background/55 px-3 py-2">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

function SidebarMessage({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border/70 bg-background/40 px-3 py-4 text-sm text-muted-foreground">
      {children}
    </p>
  );
}

function SummaryLoadingState() {
  return (
    <div className="space-y-4">
      <div className="h-28 animate-pulse rounded-xl border border-border/60 bg-muted/60" />
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-20 animate-pulse rounded-lg border border-border/60 bg-muted/50"
          />
        ))}
      </div>
    </div>
  );
}

function ListLoadingState() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="h-16 animate-pulse rounded-lg border border-border/60 bg-muted/50"
        />
      ))}
    </div>
  );
}

function CurrentPointLoadingState() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className="h-11 animate-pulse rounded-lg border border-border/60 bg-muted/50"
        />
      ))}
    </div>
  );
}

function getHighlightDisplay(
  highlights: HistoryHighlight[],
  currentIndex: number
) {
  const highlight = highlights[currentIndex];

  if (highlight.kind === "stop") {
    const stopOrder =
      highlights.slice(0, currentIndex + 1).filter((item) => item.kind === "stop").length;

    return {
      badge: "Parada",
      title: `Parada ${stopOrder}`,
    };
  }

  const milestoneOrder =
    highlights
      .slice(0, currentIndex + 1)
      .filter((item) => item.kind === "milestone").length;
  const totalMilestones = highlights.filter((item) => item.kind === "milestone").length;

  if (milestoneOrder === 1) {
    return {
      badge: "Marco",
      title: "Início da rota",
    };
  }

  if (milestoneOrder === totalMilestones) {
    return {
      badge: "Marco",
      title: "Fim da rota",
    };
  }

  return {
    badge: "Marco",
    title: `Marco ${milestoneOrder}`,
  };
}

function formatDuration(totalMinutes: number) {
  const roundedMinutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(roundedMinutes / 60);
  const minutes = roundedMinutes % 60;

  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours}h`;

  return `${hours}h ${minutes.toString().padStart(2, "0")}min`;
}
