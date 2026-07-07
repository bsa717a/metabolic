export function progressToGoal(start: number, current: number, goal: number) {
  const range = Math.abs(start - goal);
  if (range <= 0) return current <= goal ? 100 : 0;
  const traveled = start >= goal ? Math.max(0, start - current) : Math.max(0, current - start);
  return Math.min(100, Math.max(0, Math.round((traveled / range) * 100)));
}

export type JourneyMetricType =
  | 'CALORIES'
  | 'PROTEIN'
  | 'BODY_FAT'
  | 'WEIGHT'
  | 'LEAN_TISSUE_MASS'
  | 'FAT_MASS';

export const BLUEPRINT_JOURNEY_METRICS: Array<{
  type: JourneyMetricType;
  label: string;
  format: (value: number, unit: string) => string;
}> = [
  { type: 'WEIGHT', label: 'Weight', format: (value) => `${value.toFixed(0)}` },
  { type: 'CALORIES', label: 'Calories', format: (value) => `${Math.round(value)}` },
  { type: 'PROTEIN', label: 'Protein', format: (value) => `${Math.round(value)}g` },
  { type: 'BODY_FAT', label: 'Body fat', format: (value) => `${value.toFixed(1)}%` },
  { type: 'LEAN_TISSUE_MASS', label: 'Lean mass', format: (value) => `${value.toFixed(0)}` },
  { type: 'FAT_MASS', label: 'Fat mass', format: (value) => `${value.toFixed(0)}` }
];
