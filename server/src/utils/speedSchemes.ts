/** Allowed prescription speed/tempo schemes shown in editors. */
export const SPEED_SCHEMES = ['1/3', '1/2', '1/1'] as const;
export type SpeedScheme = (typeof SPEED_SCHEMES)[number];

export function normalizeSpeedScheme(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}
