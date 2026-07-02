import { MealItemType, MealStatus, Prisma, ProgramMode, ProgramStatus, type Program, type ProgramMetric } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { parseDateParam, startOfUtcDay, userDayKey } from '../utils/dates.js';
import { applyDefaultTemplateToNewLogOutsideTx } from './nutritionTemplateApply.js';
import { applyDefaultTemplateToNewDayOutsideTx } from './exerciseTemplateApply.js';
import { resolvePlanForDate } from './planResolution.js';

const DEFAULT_MEALS: [number, string, string][] = [
  [1, 'Breakfast', '07:30'],
  [2, 'Snack', '10:30'],
  [3, 'Lunch', '12:30'],
  [4, 'Snack', '15:30'],
  [5, 'Dinner', '18:30']
];

function metricValue(metrics: ProgramMetric[], type: string) {
  return metrics.find((metric) => metric.metricType === type)?.currentValue;
}

async function copyMealsFromLog(sourceLogId: string, targetLogId: string, userId: string) {
  const sourceMeals = await prisma.meal.findMany({
    where: { dailyLogId: sourceLogId },
    include: { items: true },
    orderBy: { mealNumber: 'asc' }
  });

  for (const meal of sourceMeals) {
    const plannedItems = meal.items.filter((item) => item.type === MealItemType.PLANNED);
    if (!plannedItems.length && meal.status === MealStatus.PLANNED) continue;

    await prisma.meal.create({
      data: {
        dailyLogId: targetLogId,
        userId,
        mealNumber: meal.mealNumber,
        name: meal.name,
        plannedTime: meal.plannedTime,
        status: MealStatus.PLANNED,
        // Card-builder provenance travels with the copy so the builder reopens with the same picks.
        cardSelections: (meal.cardSelections ?? undefined) as Prisma.InputJsonValue | undefined,
        plannedCalories: meal.plannedCalories,
        plannedProtein: meal.plannedProtein,
        plannedCarbs: meal.plannedCarbs,
        plannedFat: meal.plannedFat,
        items: plannedItems.length
          ? {
              create: plannedItems.map((item) => ({
                foodId: item.foodId,
                type: MealItemType.PLANNED,
                nameSnapshot: item.nameSnapshot,
                quantity: item.quantity,
                unit: item.unit,
                calories: item.calories,
                protein: item.protein,
                carbs: item.carbs,
                fat: item.fat
              }))
            }
          : undefined
      }
    });
  }
}

async function createDefaultMeals(dailyLogId: string, userId: string) {
  for (const [mealNumber, name, plannedTime] of DEFAULT_MEALS) {
    await prisma.meal.create({
      data: { dailyLogId, userId, mealNumber, name, plannedTime, status: MealStatus.PLANNED }
    });
  }
}

async function copyExercisesForDate(programId: string, userId: string, targetDate: Date) {
  const latestExerciseDay = await prisma.scheduledExercise.findFirst({
    where: { userId, programId },
    orderBy: { scheduledDate: 'desc' }
  });

  if (!latestExerciseDay) return;

  const templateExercises = await prisma.scheduledExercise.findMany({
    where: { userId, programId, scheduledDate: latestExerciseDay.scheduledDate },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
  });

  if (!templateExercises.length) return;

  await prisma.scheduledExercise.createMany({
    data: templateExercises.map((exercise) => ({
      programId,
      userId,
      exerciseId: exercise.exerciseId,
      scheduledDate: targetDate,
      sets: exercise.sets,
      reps: exercise.reps,
      durationMinutes: exercise.durationMinutes,
      distance: exercise.distance,
      weight: exercise.weight,
      status: 'PLANNED',
      sortOrder: exercise.sortOrder
    }))
  });
}

async function seedExercisesForDate(
  program: { id: string; defaultExerciseTemplateId: string | null },
  userId: string,
  targetDate: Date
) {
  const existing = await prisma.scheduledExercise.count({
    where: { userId, programId: program.id, scheduledDate: targetDate }
  });
  if (existing) return;

  if (program.defaultExerciseTemplateId) {
    await applyDefaultTemplateToNewDayOutsideTx(program, userId, targetDate);
    return;
  }

  await copyExercisesForDate(program.id, userId, targetDate);
}

/** The plan week's frozen targets (formula era) win over template/fallback stamping. */
async function stampFrozenTargets(dailyLogId: string, program: Program, day: Date) {
  const period = await prisma.planPeriod.findFirst({
    where: { programId: program.id, effectiveDate: { lte: day }, calorieTarget: { not: null } },
    orderBy: { effectiveDate: 'desc' },
    select: { calorieTarget: true, proteinTarget: true, carbTarget: true, fatTarget: true }
  });
  if (!period) return;
  await prisma.dailyLog.update({
    where: { id: dailyLogId },
    data: {
      calorieTarget: period.calorieTarget!,
      proteinTarget: period.proteinTarget ?? undefined,
      carbTarget: period.carbTarget ?? undefined,
      fatTarget: period.fatTarget ?? undefined
    }
  });
}

export async function ensureDailyLog(userId: string, program: Program & { metrics: ProgramMetric[] }, targetDate: Date) {
  const day = startOfUtcDay(targetDate);

  // The nutrition/exercise templates in effect for this date (weekly PlanPeriod), falling back to
  // the program defaults so programs without PlanPeriods behave exactly as before. Resolved only on
  // the branches that actually seed a plan — never on the hot path where the log already has meals.
  const planProgramForDay = async () => {
    const resolved = await resolvePlanForDate(program, day);
    return {
      ...program,
      defaultNutritionTemplateId: resolved.nutritionTemplateId,
      defaultExerciseTemplateId: resolved.exerciseTemplateId
    };
  };
  const existing = await prisma.dailyLog.findUnique({
    where: { userId_date: { userId, date: day } },
    include: { meals: true }
  });
  if (existing) {
    if (existing.meals.length === 0) {
      const priorLog = await prisma.dailyLog.findFirst({
        where: { userId, programId: program.id, date: { lt: day } },
        orderBy: { date: 'desc' },
        include: { meals: { include: { items: true }, orderBy: { mealNumber: 'asc' } } }
      });
      if (priorLog?.meals.length) {
        await copyMealsFromLog(priorLog.id, existing.id, userId);
      } else {
        const planProgram = await planProgramForDay();
        if (planProgram.defaultNutritionTemplateId) {
          await applyDefaultTemplateToNewLogOutsideTx(planProgram, existing.id, userId);
        } else {
          await createDefaultMeals(existing.id, userId);
        }
      }
      await stampFrozenTargets(existing.id, program, day);
    }
    return existing;
  }

  const priorLog = await prisma.dailyLog.findFirst({
    where: { userId, programId: program.id, date: { lt: day } },
    orderBy: { date: 'desc' },
    include: { meals: { include: { items: true }, orderBy: { mealNumber: 'asc' } } }
  });

  const fallbackLog = priorLog
    ?? (await prisma.dailyLog.findFirst({
      where: { userId, programId: program.id },
      orderBy: { date: 'desc' },
      include: { meals: { include: { items: true }, orderBy: { mealNumber: 'asc' } } }
    }));

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { waterGoalOz: true }
  });

  let dailyLog;
  let created = false;

  try {
    dailyLog = await prisma.dailyLog.create({
      data: {
        programId: program.id,
        userId,
        date: day,
        weight: fallbackLog?.weight ?? metricValue(program.metrics, 'WEIGHT'),
        bodyFat: fallbackLog?.bodyFat ?? metricValue(program.metrics, 'BODY_FAT'),
        waist: fallbackLog?.waist,
        calorieTarget: fallbackLog?.calorieTarget ?? metricValue(program.metrics, 'CALORIES') ?? 2200,
        proteinTarget: fallbackLog?.proteinTarget ?? metricValue(program.metrics, 'PROTEIN') ?? 190,
        carbTarget: fallbackLog?.carbTarget ?? 190,
        fatTarget: fallbackLog?.fatTarget ?? 70,
        waterTargetOz: fallbackLog?.waterTargetOz ?? user?.waterGoalOz ?? 64,
        mealsPlanned: fallbackLog?.meals.length ?? DEFAULT_MEALS.length,
        exercisesPlanned: fallbackLog?.exercisesPlanned ?? 4
      }
    });
    created = true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      dailyLog = await prisma.dailyLog.findUnique({ where: { userId_date: { userId, date: day } } });
      if (!dailyLog) throw error;
    } else {
      throw error;
    }
  }

  if (!created) return dailyLog;

  const planProgram = await planProgramForDay();

  if (fallbackLog?.meals.length) {
    await copyMealsFromLog(fallbackLog.id, dailyLog.id, userId);
  } else if (planProgram.defaultNutritionTemplateId) {
    await applyDefaultTemplateToNewLogOutsideTx(planProgram, dailyLog.id, userId);
  } else {
    await createDefaultMeals(dailyLog.id, userId);
  }

  await stampFrozenTargets(dailyLog.id, program, day);
  await seedExercisesForDate(planProgram, userId, day);

  return dailyLog;
}

export async function userTodayDate(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true }
  });
  return parseDateParam(userDayKey(user?.timezone ?? null));
}

export async function ensureTodayDailyLog(userId: string, program: Program & { metrics: ProgramMetric[] }) {
  const day = await userTodayDate(userId);
  return ensureDailyLog(userId, program, day);
}

const SELF_DIRECTED_PROGRAM_NAME = 'Food tracking';

/**
 * Gap A — "just log food" with no coach/plan. Returns the user's active program, or provisions a
 * lightweight SELF_DIRECTED one (no coach, no templates, no metrics, so DailyLog falls back to its
 * default targets) so logging works without a coached plan. If the user later onboards to coaching,
 * setupFirstProgram finds and upgrades this same active program rather than creating a second one.
 */
export async function ensureSelfDirectedProgram(userId: string) {
  const existing = await prisma.program.findFirst({
    where: { userId, status: ProgramStatus.ACTIVE },
    include: { metrics: true }
  });
  if (existing) return existing;

  const today = await userTodayDate(userId);
  try {
    await prisma.program.create({
      data: {
        userId,
        name: SELF_DIRECTED_PROGRAM_NAME,
        status: ProgramStatus.ACTIVE,
        mode: ProgramMode.SELF_DIRECTED,
        startDate: today
      }
    });
  } catch (error) {
    // Tolerate a concurrent provision; fall through to re-read the active program.
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) throw error;
  }
  return prisma.program.findFirst({
    where: { userId, status: ProgramStatus.ACTIVE },
    include: { metrics: true }
  });
}

export async function ensureDailyLogByUserId(userId: string, date: string) {
  const program = await prisma.program.findFirst({
    where: { userId, status: ProgramStatus.ACTIVE },
    include: { metrics: true }
  });
  if (!program) return null;
  const day = parseDateParam(date);
  return ensureDailyLog(userId, program, day);
}

export async function ensureTodayDailyLogByUserId(userId: string) {
  const day = await userTodayDate(userId);
  const program = await prisma.program.findFirst({
    where: { userId, status: ProgramStatus.ACTIVE },
    include: { metrics: true }
  });
  if (!program) return null;
  return ensureDailyLog(userId, program, day);
}
