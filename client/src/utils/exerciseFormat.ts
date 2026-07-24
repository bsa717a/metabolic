/**
 * Shared prescription formatting for exercises. Both `ScheduledExercise` and
 * `ExerciseTemplateItem` carry the same prescription fields, so this accepts a
 * structural subset rather than either concrete type.
 */
export type ExercisePrescription = {
  sets?: number | null;
  reps?: number | null;
  durationMinutes?: number | null;
  distance?: number | null;
  weight?: number | null;
};

/** Full label, e.g. "3 sets × 10 reps @ 25 lbs". */
export function formatPlan(item: ExercisePrescription): string {
  if (item.sets != null) {
    const weight = item.weight != null ? ` @ ${item.weight} lbs` : '';
    return `${item.sets} sets × ${item.reps ?? '—'} reps${weight}`;
  }
  if (item.durationMinutes != null) return `${item.durationMinutes} min`;
  if (item.distance != null) return `${item.distance} mi`;
  if (item.weight != null) return `${item.weight} lbs`;
  return 'No prescription set';
}

/** Compact label for dense grids/cells, e.g. "3×10 @ 25 lbs". */
export function formatPlanShort(item: ExercisePrescription): string {
  if (item.sets != null) {
    const weight = item.weight != null ? ` @ ${item.weight} lbs` : '';
    return `${item.sets}×${item.reps ?? '—'}${weight}`;
  }
  if (item.durationMinutes != null) return `${item.durationMinutes} min`;
  if (item.distance != null) return `${item.distance} mi`;
  if (item.weight != null) return `${item.weight} lbs`;
  return '—';
}
