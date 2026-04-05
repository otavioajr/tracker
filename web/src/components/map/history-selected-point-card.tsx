"use client";

import type { ReactNode } from "react";
import type { VehiclePosition } from "@/lib/actions/positions";
import { formatHistoryTimestamp } from "@/lib/history/history-player-utils";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type HistorySelectedPointCardProps = {
  currentPosition: VehiclePosition | null;
  loading: boolean;
  hasSearched: boolean;
  searchFailed: boolean;
};

export function HistorySelectedPointCard({
  currentPosition,
  loading,
  hasSearched,
  searchFailed,
}: HistorySelectedPointCardProps) {
  const beforeSearch = !hasSearched;
  const noResults = hasSearched && !loading && !searchFailed && !currentPosition;

  return (
    <Card size="sm" className="bg-card/94">
      <CardHeader className="border-b border-border/60 pb-3">
        <CardTitle>Ponto selecionado</CardTitle>
        <CardDescription>
          Leitura instantânea do frame atual da reprodução.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {beforeSearch ? (
          <MessageBox>
            O ponto atual será exibido aqui durante a navegação do histórico.
          </MessageBox>
        ) : loading ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="h-12 animate-pulse rounded-lg border border-border/60 bg-muted/50"
              />
            ))}
          </div>
        ) : searchFailed ? (
          <MessageBox>
            Nenhum ponto pôde ser carregado porque a busca falhou.
          </MessageBox>
        ) : noResults ? (
          <MessageBox>Nenhum ponto disponível para inspeção.</MessageBox>
        ) : currentPosition ? (
          <dl className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
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
            <InfoRow label="Latitude" value={currentPosition.latitude.toFixed(5)} />
            <InfoRow label="Longitude" value={currentPosition.longitude.toFixed(5)} />
          </dl>
        ) : (
          <MessageBox>
            Selecione um destaque ou mova a timeline para inspecionar um ponto.
          </MessageBox>
        )}
      </CardContent>
    </Card>
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

function MessageBox({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border/70 bg-background/40 px-3 py-4 text-sm text-muted-foreground">
      {children}
    </p>
  );
}
