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

function prescribedReps(reps?: string | number | null): string | null {
  if (reps == null) return null;
  const text = String(reps).trim();
  return text ? text : null;
}

function prescribedDuration(seconds?: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return '';
  return formatDuration(seconds);
}

/**
 * Sets line. Duration stays visible when sets are present:
 * "3 sets × 30s", "3 sets × 10 reps in 30s", "3×15/12/10 in 30s".
 */
function formatSets(item: ExercisePrescription, compact: boolean): string {
  const weight = item.weight != null ? ` @ ${item.weight} lbs` : '';
  const speed = speedSuffix(item.speed);
  const duration = prescribedDuration(item.durationSeconds);
  const reps = prescribedReps(item.reps);
  const sets = item.sets;

  if (duration && !reps) {
    return compact ? `${sets}×${duration}${weight}${speed}` : `${sets} sets × ${duration}${weight}${speed}`;
  }

  const repsLabel = reps ?? '—';
  if (compact) {
    const core = duration ? `${sets}×${repsLabel} in ${duration}` : `${sets}×${repsLabel}`;
    return `${core}${weight}${speed}`;
  }
  const repsPart = duration ? `${repsLabel} reps in ${duration}` : `${repsLabel} reps`;
  return `${sets} sets × ${repsPart}${weight}${speed}`;
}

/** Full label, e.g. "3 sets × 10 reps @ 25 lbs · 1/2" or "3 sets × 10 reps in 30s". */
export function formatPlan(item: ExercisePrescription): string {
  if (item.sets != null) return formatSets(item, false);
  if (item.durationSeconds != null) {
    const label = formatDuration(item.durationSeconds);
    return label ? `${label}${speedSuffix(item.speed)}` : 'No prescription set';
  }
  if (item.distance != null) return `${item.distance} mi`;
  if (item.weight != null) return `${item.weight} lbs`;
  return 'No prescription set';
}

/** Compact label for dense grids/cells, e.g. "3×10 @ 25 lbs · 1/2" or "3×10 in 30s". */
export function formatPlanShort(item: ExercisePrescription): string {
  if (item.sets != null) return formatSets(item, true);
  if (item.durationSeconds != null) {
    const label = formatDuration(item.durationSeconds);
    return label ? `${label}${speedSuffix(item.speed)}` : '—';
  }
  if (item.distance != null) return `${item.distance} mi`;
  if (item.weight != null) return `${item.weight} lbs`;
  return '—';
}
