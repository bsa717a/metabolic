import { addDays, api, formatWeekRange, getWeekDates, startOfWeek } from '../services/api';
import type { Meal, ScheduledExercise } from '../types';

export type ExportRange = 'day' | 'week';

export type DayMeals = { date: string; meals: Meal[] };
export type DayExercises = { date: string; exercises: ScheduledExercise[] };

export function parseExportRange(params: URLSearchParams): ExportRange {
  return params.get('range') === 'week' ? 'week' : 'day';
}

export function getWeekRange(anchorDate: string) {
  const startDate = startOfWeek(anchorDate);
  return {
    startDate,
    endDate: addDays(startDate, 6),
    dates: getWeekDates(startDate)
  };
}

export function formatWeekExportLabel(startDate: string) {
  return formatWeekRange(startDate);
}

async function fetchMealsForDate(date: string, signal?: AbortSignal) {
  try {
    return await api<Meal[]>(`/api/daily-logs/${date}/ensure`, { method: 'POST', signal });
  } catch {
    return await api<Meal[]>(`/api/daily-logs/${date}/meals`, { signal });
  }
}

async function fetchExercisesForDate(date: string, signal?: AbortSignal) {
  try {
    return await api<ScheduledExercise[]>(`/api/daily-logs/${date}/exercises/ensure`, { method: 'POST', signal });
  } catch {
    return await api<ScheduledExercise[]>(`/api/daily-logs/${date}/exercises`, { signal });
  }
}

export async function fetchMealsForDates(dates: string[], signal?: AbortSignal) {
  return Promise.all(
    dates.map(async (date) => ({
      date,
      meals: await fetchMealsForDate(date, signal)
    }))
  );
}

export async function fetchExercisesForDates(dates: string[], signal?: AbortSignal) {
  return Promise.all(
    dates.map(async (date) => ({
      date,
      exercises: await fetchExercisesForDate(date, signal)
    }))
  );
}

export async function fetchCoachExercisesForDates(clientId: string, dates: string[], signal?: AbortSignal) {
  return Promise.all(
    dates.map(async (date) => {
      try {
        const exercises = await api<ScheduledExercise[]>(
          `/api/coach/users/${clientId}/daily-logs/${date}/exercises`,
          { signal }
        );
        return { date, exercises };
      } catch {
        return { date, exercises: [] as ScheduledExercise[] };
      }
    })
  );
}

export async function fetchCoachMealsForDates(clientId: string, dates: string[], signal?: AbortSignal) {
  return Promise.all(
    dates.map(async (date) => {
      try {
        const meals = await api<Meal[]>(
          `/api/coach/users/${clientId}/daily-logs/${date}/meals`,
          { signal }
        );
        return { date, meals };
      } catch {
        return { date, meals: [] as Meal[] };
      }
    })
  );
}

export function weekHasMeals(days: DayMeals[]) {
  return days.some((day) => day.meals.length > 0);
}

export function weekHasExercises(days: DayExercises[]) {
  return days.some((day) => day.exercises.length > 0);
}
