import { ProgramStatus } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { ensureDailyLog } from './dailyLogService.js';
import { sortScheduledExercises } from './exerciseService.js';
import { parseDateParam, localTimeParts, userDayKey } from '../utils/dates.js';
import { resolveNextMeal } from '../utils/meals.js';
import { n, round } from '../utils/numbers.js';

function hasNutritionActivity(meal: { status: string; plannedCalories: unknown; actualCalories: unknown; items: unknown[] }) {
  return meal.items.length > 0 || n(meal.plannedCalories) > 0 || n(meal.actualCalories) > 0 || meal.status !== 'PLANNED';
}

function mealsForNutritionDisplay<T extends { status: string; plannedCalories: unknown; actualCalories: unknown; items: unknown[] }>(
  meals: T[]
) {
  const activeMeals = meals.filter(hasNutritionActivity);
  return activeMeals.length ? activeMeals : meals;
}

/**
 * Loads the dashboard for a user's day. `dateKey` (YYYY-MM-DD) selects the
 * calendar day. Pass the client's browser timezone (with `date`) so meal timing
 * matches the web UI; SMS and other server callers use the profile timezone.
 */
export async function getTodayDashboard(userId: string, dateKey?: string, timeZone?: string | null) {
  let resolvedDateKey = dateKey;
  if (!resolvedDateKey) {
    const tz =
      timeZone ??
      (await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } }))?.timezone ??
      null;
    resolvedDateKey = userDayKey(tz);
  }
  const today = parseDateParam(resolvedDateKey);
  const program = await prisma.program.findFirst({
    where: { userId, status: ProgramStatus.ACTIVE },
    include: { metrics: true }
  });
  if (!program) {
    return {
      program: null,
      dailyLog: null,
      meals: [],
      exercises: [],
      summary: null,
      weightTrend: [],
      date: resolvedDateKey
    };
  }

  const dailyLog = await ensureDailyLog(userId, program, today);
  const [meals, rawExercises, weightTrend] = await Promise.all([
    prisma.meal.findMany({ where: { dailyLogId: dailyLog.id }, include: { items: true }, orderBy: { mealNumber: 'asc' } }),
    prisma.scheduledExercise.findMany({ where: { userId, scheduledDate: today }, include: { exercise: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
    prisma.dailyLog.findMany({ where: { userId, weight: { not: null } }, orderBy: { date: 'asc' }, take: 30 })
  ]);
  const nutritionMeals = mealsForNutritionDisplay(meals);
  const exercises = sortScheduledExercises(rawExercises);

  const weightMetric = program.metrics.find((metric) => metric.metricType === 'WEIGHT');
  const start = n(weightMetric?.startValue);
  const current = n(weightMetric?.currentValue);
  const goal = n(weightMetric?.goalValue);
  const goalProgress = start !== goal ? round(((start - current) / (start - goal)) * 100, 1) : 0;
  const minutesOfDay = timeZone ? localTimeParts(timeZone).minutesOfDay : undefined;
  const nextMeal = resolveNextMeal(meals, minutesOfDay);

  return {
    program,
    dailyLog,
    meals: nutritionMeals,
    allMeals: meals,
    exercises,
    date: resolvedDateKey,
    nextMeal: nextMeal
      ? {
          name: nextMeal.name,
          plannedTime: nextMeal.plannedTime,
          status: nextMeal.status,
          items: nextMeal.items
            .filter((item) => item.type === 'PLANNED' && item.nameSnapshot.trim())
            .map((item) => item.nameSnapshot)
        }
      : null,
    summary: {
          currentWeight: current,
          caloriesRemaining: round(n(dailyLog.calorieTarget) - n(dailyLog.caloriesActual), 1),
          proteinRemaining: round(n(dailyLog.proteinTarget) - n(dailyLog.proteinActual), 1),
          nextMeal: nextMeal?.name ?? 'All meals complete',
          exercisesLeft: exercises.filter((exercise) => exercise.status === 'PLANNED').length,
          goalProgress
        },
    weightTrend: weightTrend.map((log) => ({ date: log.date.toISOString().slice(0, 10), weight: n(log.weight) }))
  };
}
