import type { ExerciseRoutine } from '../types';
import { routineWeekdayIsRest } from './routineDayEdits';
import { weekdayIndex } from './weekdayPattern';

/** Dates within `weekDates` that the routine marks as rest (no plan workout and nothing added). */
export function routineRestDatesForWeek(routine: ExerciseRoutine | null, weekDates: string[]): Set<string> {
  if (!routine?.days.length) return new Set<string>();
  const byWeekday = new Map(routine.days.map((day) => [day.weekday, day]));
  const restDates = new Set<string>();
  for (const date of weekDates) {
    const day = byWeekday.get(weekdayIndex(date));
    if (day && routineWeekdayIsRest(day)) restDates.add(date);
  }
  return restDates;
}

/** One-line routine summary, e.g. "3× Push · 2 rest". Returns null when no routine is set. */
export function routineSummaryLabel(routine: ExerciseRoutine | null): string | null {
  if (!routine?.days.length) return null;
  const parts: string[] = [];
  const counts = new Map<string, number>();
  for (const day of routine.days) {
    const key = routineWeekdayIsRest(day) ? 'rest' : (day.templateId ?? `added:${day.id}`);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const [key, count] of counts) {
    if (key === 'rest') {
      parts.push(`${count} rest`);
    } else if (key.startsWith('added:')) {
      parts.push(`${count} added`);
    } else {
      const name = routine.days.find((day) => day.templateId === key)?.template?.name ?? 'Workout';
      parts.push(`${count}× ${name}`);
    }
  }
  return parts.join(' · ');
}
