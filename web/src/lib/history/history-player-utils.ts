export type PlaybackSpeedPreset = "1x" | "2x" | "4x" | "8x";

export type HistoryPositionInput = {
  latitude: number;
  longitude: number;
  speed: number;
  ignition: boolean;
  server_time: string;
};

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

type HistoryPositionEntry = {
  position: HistoryPositionInput;
  originalIndex: number;
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
    timeZone: "America/Sao_Paulo",
  }).format(new Date(iso));
}

export function buildHistorySummary(
  positions: readonly HistoryPositionInput[]
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
    maxSpeedKmh = Math.max(maxSpeedKmh, current.position.speed ?? 0);

    const next = orderedPositions[index + 1];
    if (!next) continue;

    totalDistanceKm += haversineDistanceKm(current.position, next.position);

    const intervalMinutes =
      (new Date(next.position.server_time).getTime() -
        new Date(current.position.server_time).getTime()) *
      MINUTES_PER_MS;

    if (intervalMinutes <= 0) continue;

    if ((current.position.speed ?? 0) <= STOP_SPEED_THRESHOLD_KMH) {
      stoppedMinutes += intervalMinutes;
    } else {
      movingMinutes += intervalMinutes;
    }
  }

  const firstTimestamp = new Date(orderedPositions[0].position.server_time).getTime();
  const lastTimestamp = new Date(
    orderedPositions[orderedPositions.length - 1].position.server_time
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
  positions: readonly HistoryPositionInput[]
): HistoryHighlight[] {
  if (positions.length === 0) return [];

  const orderedPositions = sortPositions(positions);
  const highlights: HistoryHighlight[] = [];
  let stopSequenceStartIndex: number | null = null;
  let stopSequenceEndIndex: number | null = null;
  let stopCount = 0;

  const firstPosition = orderedPositions[0];
  highlights.push({
    kind: "milestone",
    index: firstPosition.originalIndex,
    label: "Start",
    timestamp: firstPosition.position.server_time,
    latitude: firstPosition.position.latitude,
    longitude: firstPosition.position.longitude,
  });

  for (let index = 0; index < orderedPositions.length; index += 1) {
    const current = orderedPositions[index];
    const next = orderedPositions[index + 1];
    const currentIsStopped = (current.position.speed ?? 0) <= STOP_SPEED_THRESHOLD_KMH;

    if (currentIsStopped && stopSequenceStartIndex === null) {
      stopSequenceStartIndex = index;
    }

    if (currentIsStopped) {
      stopSequenceEndIndex = index;
    }

    const stopSequenceEnds =
      stopSequenceStartIndex !== null &&
      (!next || (next.position.speed ?? 0) > STOP_SPEED_THRESHOLD_KMH);

    if (stopSequenceEnds) {
      const stopStartIndex = stopSequenceStartIndex;
      const stopEndIndex = stopSequenceEndIndex;
      if (stopStartIndex === null || stopEndIndex === null) {
        continue;
      }

      const stopStart = orderedPositions[stopStartIndex];
      // Sparse telemetry can skip the exact transition point, so let the first
      // moving resume frame close the stop window when it appears.
      const stopEnd =
        next && (next.position.speed ?? 0) > STOP_SPEED_THRESHOLD_KMH
          ? next
          : orderedPositions[stopEndIndex];
      const stopDurationMinutes =
        (new Date(stopEnd.position.server_time).getTime() -
          new Date(stopStart.position.server_time).getTime()) *
        MINUTES_PER_MS;

      if (stopDurationMinutes >= STOP_DURATION_MINUTES) {
        const stopIndex = stopStart.originalIndex;
        stopCount += 1;
        highlights.push({
          kind: "stop",
          index: stopIndex,
          label: `Stop ${stopCount}`,
          timestamp: stopStart.position.server_time,
          latitude: stopStart.position.latitude,
          longitude: stopStart.position.longitude,
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
      index: lastPosition.originalIndex,
      label: "End",
      timestamp: lastPosition.position.server_time,
      latitude: lastPosition.position.latitude,
      longitude: lastPosition.position.longitude,
    });
  }

  return highlights;
}

function sortPositions(
  positions: readonly HistoryPositionInput[]
): HistoryPositionEntry[] {
  return positions
    .map((position, originalIndex) => ({ position, originalIndex }))
    .sort(
      (left, right) =>
        new Date(left.position.server_time).getTime() -
        new Date(right.position.server_time).getTime()
    );
}

function haversineDistanceKm(left: HistoryPositionInput, right: HistoryPositionInput) {
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
