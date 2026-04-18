const ENABLED_VALUES = new Set(["1", "true", "on", "yes"]);

export function isDashboardMapRotationEnabled(
  rawValue: string | undefined = process.env.NEXT_PUBLIC_ENABLE_MAP_ROTATION
) {
  return ENABLED_VALUES.has((rawValue ?? "").trim().toLowerCase());
}
