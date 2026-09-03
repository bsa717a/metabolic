/**
 * Shared prescription formatting for exercises. Both `ScheduledExercise` and
 * `ExerciseTemplateItem` carry the same prescription fields, so this accepts a
 * structural subset rather than either concrete type.
 */
import { formatDuration } from './duration';

export type ExercisePrescription = {
  sets?: number | null;
  reps?: string | number | null;
  speed?: string | number | null;
  durationSeconds?: number | null;
  distance?: number | null;
  weight?: number | null;
};

function speedSuffix(speed?: string | number | null) {
  if (speed == null || speed === '') return '';
  return ` · ${String(speed)}`;
}

/** Full label, e.g. "3 sets × 10 reps @ 25 lbs · 1/2". */
export function formatPlan(item: ExercisePrescription): string {
  if (item.sets != null) {
    const weight = item.weight != null ? ` @ ${item.weight} lbs` : '';
    const repsLabel = item.reps == null || item.reps === '' ? '—' : String(item.reps);
    return `${item.sets} sets × ${repsLabel} reps${weight}${speedSuffix(item.speed)}`;
  }
  if (item.durationSeconds != null) {
    const label = formatDuration(item.durationSeconds);
    return label ? `${label}${speedSuffix(item.speed)}` : 'No prescription set';
  }
  if (item.distance != null) return `${item.distance} mi`;
  if (item.weight != null) return `${item.weight} lbs`;
  return 'No prescription set';
}

/** Compact label for dense grids/cells, e.g. "3×10 @ 25 lbs · 1/2". */
export function formatPlanShort(item: ExercisePrescription): string {
  if (item.sets != null) {
    const weight = item.weight != null ? ` @ ${item.weight} lbs` : '';
    const repsLabel = item.reps == null || item.reps === '' ? '—' : String(item.reps);
    return `${item.sets}×${repsLabel}${weight}${speedSuffix(item.speed)}`;
  }
  if (item.durationSeconds != null) {
    const label = formatDuration(item.durationSeconds);
    return label ? `${label}${speedSuffix(item.speed)}` : '—';
  }
  if (item.distance != null) return `${item.distance} mi`;
  if (item.weight != null) return `${item.weight} lbs`;
  return '—';
}
