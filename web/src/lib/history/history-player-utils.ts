import type { VehiclePosition } from "@/lib/actions/positions";

export type PlaybackSpeedPreset = "1x" | "2x" | "4x" | "8x";

export type HistorySummary = {
  totalPoints: number;
  totalDistanceKm: number;
  maxSpeedKmh: number;
  movingMinutes: number;
  stoppedMinutes: number;
  totalDurationMinutes: number;
};

export type HistoryHighlight = {
  kind: "stop" | "milestone";
  index: number;
  label: string;
  timestamp: string;
  latitude: number;
  longitude: number;
};

const PLAYBACK_INTERVAL_MS: Record<PlaybackSpeedPreset, number> = {
  "1x": 800,
  "2x": 400,
  "4x": 200,
  "8x": 100,
};

const STOP_SPEED_THRESHOLD_KMH = 2;
const STOP_DURATION_MINUTES = 5;
const MINUTES_PER_MS = 1 / 60000;

export function getPlaybackIntervalMs(speed: PlaybackSpeedPreset) {
  return PLAYBACK_INTERVAL_MS[speed];
}

export function formatHistoryTimestamp(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function buildHistorySummary(
  positions: readonly VehiclePosition[]
): HistorySummary {
  if (positions.length === 0) {
    return {
      totalPoints: 0,
      totalDistanceKm: 0,
      maxSpeedKmh: 0,
      movingMinutes: 0,
      stoppedMinutes: 0,
      totalDurationMinutes: 0,
    };
  }

  const orderedPositions = sortPositions(positions);
  let totalDistanceKm = 0;
  let movingMinutes = 0;
  let stoppedMinutes = 0;
  let maxSpeedKmh = 0;

  for (let index = 0; index < orderedPositions.length; index += 1) {
    const current = orderedPositions[index];
    maxSpeedKmh = Math.max(maxSpeedKmh, current.speed ?? 0);

    const next = orderedPositions[index + 1];
    if (!next) continue;

    totalDistanceKm += haversineDistanceKm(current, next);

    const intervalMinutes =
      (new Date(next.server_time).getTime() - new Date(current.server_time).getTime()) *
      MINUTES_PER_MS;

    if (intervalMinutes <= 0) continue;

    if ((current.speed ?? 0) <= STOP_SPEED_THRESHOLD_KMH) {
      stoppedMinutes += intervalMinutes;
    } else {
      movingMinutes += intervalMinutes;
    }
  }

  const firstTimestamp = new Date(orderedPositions[0].server_time).getTime();
  const lastTimestamp = new Date(
    orderedPositions[orderedPositions.length - 1].server_time
  ).getTime();
  const totalDurationMinutes = Math.max(0, (lastTimestamp - firstTimestamp) * MINUTES_PER_MS);

  return {
    totalPoints: orderedPositions.length,
    totalDistanceKm,
    maxSpeedKmh,
    movingMinutes,
    stoppedMinutes,
    totalDurationMinutes,
  };
}

export function buildHistoryHighlights(
  positions: readonly VehiclePosition[]
): HistoryHighlight[] {
  if (positions.length === 0) return [];

  const orderedPositions = sortPositions(positions);
  const highlights: HistoryHighlight[] = [];
  let stopSequenceStartIndex: number | null = null;
  let stopSequenceEndIndex: number | null = null;
  let stopCount = 0;

  highlights.push({
    kind: "milestone",
    index: 0,
    label: "Start",
    timestamp: orderedPositions[0].server_time,
    latitude: orderedPositions[0].latitude,
    longitude: orderedPositions[0].longitude,
  });

  for (let index = 0; index < orderedPositions.length; index += 1) {
    const current = orderedPositions[index];
    const next = orderedPositions[index + 1];
    const currentIsStopped = (current.speed ?? 0) <= STOP_SPEED_THRESHOLD_KMH;

    if (currentIsStopped && stopSequenceStartIndex === null) {
      stopSequenceStartIndex = index;
    }

    if (currentIsStopped) {
      stopSequenceEndIndex = index;
    }

    const stopSequenceEnds =
      stopSequenceStartIndex !== null &&
      (!next || (next.speed ?? 0) > STOP_SPEED_THRESHOLD_KMH);

    if (stopSequenceEnds) {
      const stopStart = orderedPositions[stopSequenceStartIndex];
      const stopEnd = orderedPositions[stopSequenceEndIndex ?? stopSequenceStartIndex];
      const stopDurationMinutes =
        (new Date(stopEnd.server_time).getTime() - new Date(stopStart.server_time).getTime()) *
        MINUTES_PER_MS;

      if (stopDurationMinutes >= STOP_DURATION_MINUTES) {
        stopCount += 1;
        highlights.push({
          kind: "stop",
          index: stopSequenceStartIndex,
          label: `Stop ${stopCount}`,
          timestamp: stopStart.server_time,
          latitude: stopStart.latitude,
          longitude: stopStart.longitude,
        });
      }

      stopSequenceStartIndex = null;
      stopSequenceEndIndex = null;
    }
  }

  const lastPosition = orderedPositions[orderedPositions.length - 1];
  if (lastPosition && orderedPositions.length > 1) {
    highlights.push({
      kind: "milestone",
      index: orderedPositions.length - 1,
      label: "End",
      timestamp: lastPosition.server_time,
      latitude: lastPosition.latitude,
      longitude: lastPosition.longitude,
    });
  }

  return highlights;
}

function sortPositions(positions: readonly VehiclePosition[]) {
  return [...positions].sort(
    (left, right) =>
      new Date(left.server_time).getTime() - new Date(right.server_time).getTime()
  );
}

function haversineDistanceKm(left: VehiclePosition, right: VehiclePosition) {
  const earthRadiusKm = 6371;
  const latitudeDelta = toRadians(right.latitude - left.latitude);
  const longitudeDelta = toRadians(right.longitude - left.longitude);
  const startLatitude = toRadians(left.latitude);
  const endLatitude = toRadians(right.latitude);

  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.sin(longitudeDelta / 2) ** 2 * Math.cos(startLatitude) * Math.cos(endLatitude);

  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}
