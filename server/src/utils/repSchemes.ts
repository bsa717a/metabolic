/** Allowed prescription rep schemes shown in editors. */
export const REP_SCHEMES = ['10', '15/12/10', '20/17/15'] as const;
export type RepScheme = (typeof REP_SCHEMES)[number];

export function normalizeRepScheme(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

/** Catalog defaultReps (int) → prescription string. */
export function defaultRepsToScheme(defaultReps: number | null | undefined): string | null {
  if (defaultReps == null) return null;
  return String(defaultReps);
}
