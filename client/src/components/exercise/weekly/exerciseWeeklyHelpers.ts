import { isFuture, isToday } from '../../../services/api';
import type { ScheduledExercise } from '../../../types';
import type { DayExercises } from '../../../utils/planExportData';

export type ExerciseCompletionStatus = 'complete' | 'incomplete' | 'none';

export function exercisesForDay(days: DayExercises[], date: string): ScheduledExercise[] {
  return days.find((day) => day.date === date)?.exercises ?? [];
}

export function isPastDate(date: string): boolean {
  return !isFuture(date) && !isToday(date);
}

export function dayExerciseCompletionStatus(exercises: ScheduledExercise[], date: string): ExerciseCompletionStatus {
  if (!exercises.length) return 'none';
  if (isFuture(date)) return 'none';
  const hasPlanned = exercises.some((item) => item.status === 'PLANNED');
  if (isToday(date)) return hasPlanned ? 'none' : 'complete';
  return hasPlanned ? 'incomplete' : 'complete';
}

export function exerciseCompletionHighlightClass(status: ExerciseCompletionStatus): string {
  switch (status) {
    case 'complete':
      return 'border-brand-green/40 bg-brand-green/10';
    case 'incomplete':
      return 'border-red-300 bg-red-50 dark:border-red-800/50 dark:bg-red-900/20';
    default:
      return 'border-app-border bg-app-surface';
  }
}

export function formatPlanShort(item: ScheduledExercise): string {
  if (item.sets != null) {
    const weight = item.weight != null ? ` @ ${item.weight} lbs` : '';
    return `${item.sets}×${item.reps ?? '—'}${weight}`;
  }
  if (item.durationMinutes != null) return `${item.durationMinutes} min`;
  if (item.weight != null) return `${item.weight} lbs`;
  return '—';
}

export const EXERCISE_STATUS_LABEL: Record<string, string> = {
  PLANNED: 'Planned',
  DONE: 'Done',
  SKIPPED: 'Skipped'
};

export function exerciseStatusLabel(status: string): string {
  return EXERCISE_STATUS_LABEL[status] ?? status.replaceAll('_', ' ');
}

export function exerciseStatusDotClass(status: string): string {
  switch (status) {
    case 'DONE':
      return 'bg-brand-green';
    case 'SKIPPED':
      return 'bg-red-400';
    case 'PLANNED':
      return 'bg-brand-gold';
    default:
      return 'bg-app-border';
  }
}

export function dayDoneCount(exercises: ScheduledExercise[]): number {
  return exercises.filter((item) => item.status === 'DONE').length;
}
