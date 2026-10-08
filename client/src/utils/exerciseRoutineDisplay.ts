import type { ExerciseRoutine } from '../types';
import { weekdayIndex } from './weekdayPattern';

/** Saved exercise-plan name, e.g. "Core #3". Null when the week is custom or unset. */
export function exerciseWeekPlanHeading(routine: ExerciseRoutine | null): string | null {
  const name = routine?.exercisePlan?.name?.trim();
  return name || null;
}

/**
 * Workout template assigned to this calendar day by the weekly routine.
 * Null for rest days and when no routine is saved — never a catalog default.
 */
export function assignedTemplateIdForDate(routine: ExerciseRoutine | null, date: string): string | null {
  if (!routine) return null;
  const day = routine.days.find((entry) => entry.weekday === weekdayIndex(date));
  return day?.templateId ?? null;
}

/** Dates within `weekDates` that the routine marks as explicit rest days (templateId === null). */
export function routineRestDatesForWeek(routine: ExerciseRoutine | null, weekDates: string[]): Set<string> {
  if (!routine?.days.length) return new Set<string>();
  const byWeekday = new Map(routine.days.map((day) => [day.weekday, day.templateId]));
  const restDates = new Set<string>();
  for (const date of weekDates) {
    if (byWeekday.get(weekdayIndex(date)) === null) restDates.add(date);
  }
  return restDates;
}

/** One-line routine summary, e.g. "3× Push · 2 rest". Returns null when no routine is set. */
export function routineSummaryLabel(routine: ExerciseRoutine | null): string | null {
  if (!routine?.days.length) return null;
  const parts: string[] = [];
  const counts = new Map<string, number>();
  for (const day of routine.days) {
    const key = day.templateId ?? 'rest';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const [key, count] of counts) {
    if (key === 'rest') {
      parts.push(`${count} rest`);
    } else {
      const name = routine.days.find((day) => day.templateId === key)?.template?.name ?? 'Workout';
      parts.push(`${count}× ${name}`);
    }
  }
  return parts.join(' · ');
}
