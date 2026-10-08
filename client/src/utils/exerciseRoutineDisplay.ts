import type { ExerciseRoutine, ScheduledExercise } from '../types';
import type { DayExercises } from './planExportData';
import { weekdayIndex } from './weekdayPattern';

/** Saved exercise-plan name, e.g. "5 Day Split (#5)". Null when unset. Never a day's workout. */
export function exerciseWeekPlanHeading(routine: ExerciseRoutine | null): string | null {
  return assignedExercisePlan(routine)?.name ?? null;
}

/** The plan the week is on. Null when nothing is assigned — never a day's workout. */
export function assignedExercisePlan(
  routine: ExerciseRoutine | null
): { id: string; name: string } | null {
  const name = routine?.exercisePlan?.name?.trim();
  const id = routine?.exercisePlanId ?? routine?.exercisePlan?.id ?? null;
  if (!id || !name) return null;
  return { id, name };
}

/**
 * Options for the Exercise plan picker. The saved plan is always included so the
 * control shows the same name as the week, even before the catalog finishes loading.
 */
export function exercisePlanPickerOptions(
  plans: { id: string; name: string }[],
  assigned: { id: string; name: string } | null
): { id: string; name: string }[] {
  const options = plans
    .filter((plan) => plan.id && plan.name.trim())
    .map((plan) => ({ id: plan.id, name: plan.name.trim() }));
  if (assigned && !options.some((plan) => plan.id === assigned.id)) {
    return [assigned, ...options];
  }
  return options;
}

/** Saved plan, unless the coach has picked a different one and not applied it yet. */
export function exercisePlanPickerValue(assignedId: string | null, override: string | null): string {
  if (override !== null) return override;
  return assignedId ?? '';
}

/** Week title when the client has no saved exercise plan. */
export const NO_EXERCISE_PLAN_ASSIGNED = 'No plan is assigned.';

/** Shown by Apply plan. Uncovered weekdays are stored as rest. */
export const APPLY_EXERCISE_PLAN_HINT =
  'Applying replaces the whole week, and weekdays the plan does not cover become rest days.';

/** Mon=0 … Sun=6 from a plan's day templates (dayIndex order). Leftover weekdays are rest. */
export function weekdayAssignmentsFromPlanDays(
  days: { id: string; dayIndex?: number | null }[]
): { weekday: number; templateId: string | null }[] {
  const sorted = [...days].sort((a, b) => (a.dayIndex ?? 0) - (b.dayIndex ?? 0));
  return Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    templateId: sorted[weekday]?.id ?? null
  }));
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

/**
 * Week cards after Apply plan or Save routine. Saved workouts stay visible even when
 * the exercise list is still empty, so assigned days are not shown as rest.
 */
export function coachWeekDaysForRoutine(
  routine: ExerciseRoutine | null,
  weekDates: string[],
  fetched: DayExercises[]
): DayExercises[] {
  return weekDates.map((date) => {
    const fromServer = fetched.find((day) => day.date === date);
    if (fromServer && fromServer.exercises.length > 0) return fromServer;
    const weekday = weekdayIndex(date);
    const assignment = routine?.days.find((day) => day.weekday === weekday);
    const name = assignment?.templateId ? assignment.template?.name?.trim() : '';
    if (!name) return fromServer ?? { date, exercises: [] };
    const placeholder: ScheduledExercise = {
      id: `assigned-${date}`,
      status: 'PLANNED',
      exercise: { name }
    };
    return { date, exercises: [placeholder] };
  });
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
