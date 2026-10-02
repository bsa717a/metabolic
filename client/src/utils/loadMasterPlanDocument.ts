import type { Meal, PlanPeriodInfo, ScheduledExercise, UserAccountDetails } from '../types';
import type { HydrationSummary } from '../types/hydration';
import { api, getWeekDates, startOfWeek, todayDateParam } from '../services/api';
import { fetchExercisesForDates, fetchMealsForDates } from './planExportData';
import type { MealPlanLayout } from './mealPlanLayout';
import { buildMasterPlanDocument, type MasterPlanDayInput, type MasterPlanDocument } from './masterPlanPdfModel';

export async function loadMasterPlanDocument(input: {
  userId: string;
  clientName: string;
  anchorDate: string;
  layout: MealPlanLayout;
}): Promise<MasterPlanDocument> {
  const startDate = startOfWeek(input.anchorDate);
  const dates = getWeekDates(startDate);
  const [mealDays, exerciseDays, hydration, period, profile] = await Promise.all([
    fetchMealsForDates(dates),
    fetchExercisesForDates(dates),
    api<HydrationSummary>(`/api/hydration?${todayDateParam()}`).catch(() => null),
    api<PlanPeriodInfo>(`/api/daily-logs/${startDate}/plan-period`).catch(() => null),
    api<UserAccountDetails>(`/api/users/${input.userId}/profile`).catch(() => null)
  ]);

  const exercisesByDate = new Map(exerciseDays.map((day) => [day.date, day.exercises]));
  const days: MasterPlanDayInput[] = mealDays.map((day) => ({
    date: day.date,
    meals: day.meals.map(toMealInput),
    exercises: (exercisesByDate.get(day.date) ?? []).map(toExerciseInput)
  }));

  return buildMasterPlanDocument({
    clientName: input.clientName,
    layout: input.layout,
    waterGoalOz: hydration?.goalOz ?? 64,
    dietaryPreferences: profile?.dietaryPreferences,
    foodAllergies: profile?.foodAllergies,
    weeks: [
      {
        weekNumber: period?.weekNumber ?? null,
        startDate,
        days
      }
    ]
  });
}

function toMealInput(meal: Meal) {
  return {
    mealNumber: meal.mealNumber,
    name: meal.name,
    items: (meal.items ?? []).map((item) => ({
      type: item.type,
      quantity: Number(item.quantity),
      unit: item.unit,
      nameSnapshot: item.nameSnapshot
    }))
  };
}

function toExerciseInput(exercise: ScheduledExercise) {
  return {
    name: exercise.exercise.name,
    sets: exercise.sets,
    reps: exercise.reps,
    speed: exercise.speed,
    durationSeconds: exercise.durationSeconds,
    distance: exercise.distance,
    weight: exercise.weight
  };
}
