"use client";

import type { PlaybackSpeedPreset } from "@/lib/history/history-player-utils";
import { formatHistoryTimestamp } from "@/lib/history/history-player-utils";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type HistoryPlaybackBarProps = {
  playing: boolean;
  currentIndex: number;
  totalPoints: number;
  speed: PlaybackSpeedPreset;
  currentTimestamp: string | null;
  onPlay: () => void;
  onPause: () => void;
  onReset: () => void;
  onSeek: (index: number) => void;
  onSpeedChange: (speed: PlaybackSpeedPreset) => void;
};

const speedPresets: PlaybackSpeedPreset[] = ["1x", "2x", "4x", "8x"];

export function HistoryPlaybackBar({
  playing,
  currentIndex,
  totalPoints,
  speed,
  currentTimestamp,
  onPlay,
  onPause,
  onReset,
  onSeek,
  onSpeedChange,
}: HistoryPlaybackBarProps) {
  const safeTotalPoints = Math.max(totalPoints, 0);
  const maxIndex = Math.max(safeTotalPoints - 1, 0);
  const safeIndex = Math.min(Math.max(currentIndex, 0), maxIndex);
  const hasPoints = safeTotalPoints > 0;

  return (
    <Card size="sm" className="bg-card/95">
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={playing ? onPause : onPlay}
              disabled={!hasPoints}
            >
              {playing ? "Pausar" : "Reproduzir"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onReset}
              disabled={!hasPoints}
            >
              Reiniciar
            </Button>
            <div className="ml-0 flex items-center gap-1.5 xl:ml-2">
              {speedPresets.map((preset) => (
                <Button
                  key={preset}
                  type="button"
                  size="sm"
                  variant={preset === speed ? "default" : "outline"}
                  onClick={() => onSpeedChange(preset)}
                  disabled={!hasPoints}
                >
                  {preset}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-medium text-foreground">
              {hasPoints ? `${safeIndex + 1} / ${safeTotalPoints}` : "0 / 0"}
            </span>
            <span className="text-muted-foreground">
              {currentTimestamp
                ? formatHistoryTimestamp(currentTimestamp)
                : "Nenhum ponto selecionado"}
            </span>
          </div>
        </div>

        <div className="space-y-2">
          <input
            type="range"
            min={0}
            max={maxIndex}
            value={safeIndex}
            onChange={(event) => onSeek(Number(event.target.value))}
            disabled={!hasPoints}
            aria-label="Linha do tempo do histórico"
            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary disabled:cursor-not-allowed disabled:opacity-50 [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-primary [&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-muted [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-muted [&::-webkit-slider-thumb]:mt-[-4px] [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
          />
          <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            <span>Início</span>
            <span>Timeline da missão</span>
            <span>Fim</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
