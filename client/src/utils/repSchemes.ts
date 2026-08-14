/** Allowed prescription rep schemes shown in editors. */
export const REP_SCHEMES = ['10', '15/12/10', '20/17/15'] as const;
export type RepScheme = (typeof REP_SCHEMES)[number];

export function normalizeRepScheme(value: string | number | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

/** Primary number from a scheme for numeric fallbacks (e.g. session steppers). */
export function primaryRepsFromScheme(reps: string | number | null | undefined): number {
  return repsForSet(reps, 1);
}

/** Numeric segments from a scheme like `15/12/10`. Empty when nothing parses. */
export function repSchemeParts(reps: string | number | null | undefined): number[] {
  if (reps == null) return [];
  return String(reps)
    .split('/')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => Number(part))
    .filter((n) => Number.isFinite(n));
}

/**
 * Rep target for a 1-based set index from a scheme like `15/12/10`.
 * Extra sets beyond the scheme reuse the last segment.
 */
export function repsForSet(reps: string | number | null | undefined, setIndex: number): number {
  const parts = repSchemeParts(reps);
  if (!parts.length) return 0;
  const index = Math.max(0, Math.min(parts.length - 1, Math.floor(setIndex) - 1));
  return parts[index] ?? 0;
}
