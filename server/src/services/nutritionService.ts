import { MealItemType, MealStatus, Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { addUtcDays, parseDateParam, toDateKey } from '../utils/dates.js';
import { n } from '../utils/numbers.js';
import { recalculateDailyLogTotals, recalculateMealTotals } from './totalsService.js';
import { ensureDailyLogByUserId } from './dailyLogService.js';
import { notifyMealActivity } from '../gamification/mealActivity.js';

function hasNutritionActivity(meal: { status: string; plannedCalories: unknown; actualCalories: unknown; items: unknown[] }) {
  return meal.items.length > 0 || n(meal.plannedCalories) > 0 || n(meal.actualCalories) > 0 || meal.status !== MealStatus.PLANNED;
}

function mealsForNutritionDisplay<T extends { status: string; plannedCalories: unknown; actualCalories: unknown; items: unknown[] }>(
  meals: T[]
) {
  const activeMeals = meals.filter(hasNutritionActivity);
  return activeMeals.length ? activeMeals : meals;
}

function matchesPlannedActual(
  actual: { type: MealItemType; linkedPlannedItemId: string | null; nameSnapshot: string; quantity: unknown; foodId: string | null },
  planned: { id: string; nameSnapshot: string; quantity: unknown; foodId: string | null }
) {
  return (
    actual.type === MealItemType.ACTUAL &&
    !actual.linkedPlannedItemId &&
    actual.nameSnapshot === planned.nameSnapshot &&
    n(actual.quantity) === n(planned.quantity) &&
    (actual.foodId ?? null) === (planned.foodId ?? null)
  );
}

export async function getMealsForDate(userId: string, date: string) {
  const day = parseDateParam(date);
  const log = await prisma.dailyLog.findUnique({ where: { userId_date: { userId, date: day } } });
  if (!log) return [];
  const meals = await prisma.meal.findMany({
    where: { dailyLogId: log.id },
    include: { items: true },
    orderBy: { mealNumber: 'asc' }
  });
  return mealsForNutritionDisplay(meals);
}

export async function createMeal(userId: string, date: string, data: { name: string; mealNumber: number; plannedTime?: string | null }) {
  const day = parseDateParam(date);
  const log = await prisma.dailyLog.findUniqueOrThrow({ where: { userId_date: { userId, date: day } } });
  const existing = await prisma.meal.findFirst({
    where: { dailyLogId: log.id, mealNumber: data.mealNumber }
  });
  if (existing) return existing;
  return prisma.meal.create({
    data: { dailyLogId: log.id, userId, mealNumber: data.mealNumber, name: data.name, plannedTime: data.plannedTime ?? null }
  });
}

export async function markMealEatenAsPlanned(userId: string, mealId: string) {
  return prisma.$transaction(async (tx) => {
    const meal = await tx.meal.findFirstOrThrow({ where: { id: mealId, userId }, include: { items: true } });
    const planned = meal.items.filter((item) => item.type === MealItemType.PLANNED);
    await tx.mealItem.deleteMany({ where: { mealId, type: MealItemType.ACTUAL } });
    if (planned.length) {
      await tx.mealItem.createMany({
        data: planned.map((item) => ({
          mealId,
          foodId: item.foodId,
          type: MealItemType.ACTUAL,
          linkedPlannedItemId: item.id,
          nameSnapshot: item.nameSnapshot,
          quantity: item.quantity,
          unit: item.unit,
          calories: item.calories,
          protein: item.protein,
          carbs: item.carbs,
          fat: item.fat
        }))
      });
    }
    await tx.meal.update({ where: { id: mealId }, data: { status: MealStatus.EATEN_AS_PLANNED } });
    await recalculateMealTotals(mealId, tx);
    await tx.meal.update({ where: { id: mealId }, data: { status: MealStatus.EATEN_AS_PLANNED } });
    return recalculateDailyLogTotals(meal.dailyLogId, tx);
  }).then(async (result) => {
    await notifyMealActivity(userId, mealId);
    return result;
  });
}

export async function addMealItem(userId: string, mealId: string, data: Record<string, unknown>) {
  const itemType = (data.type as MealItemType | undefined) ?? MealItemType.ACTUAL;
  return prisma.$transaction(async (tx) => {
    const meal = await tx.meal.findFirstOrThrow({ where: { id: mealId, userId } });
    const item = await tx.mealItem.create({
      data: {
        mealId,
        foodId: (data.foodId as string | undefined) ?? null,
        type: itemType,
        nameSnapshot: String(data.nameSnapshot ?? data.name ?? 'Food'),
        quantity: Number(data.quantity ?? 1),
        unit: String(data.unit ?? 'serving'),
        calories: Number(data.calories ?? 0),
        protein: Number(data.protein ?? 0),
        carbs: Number(data.carbs ?? 0),
        fat: Number(data.fat ?? 0)
      }
    });
    await recalculateMealTotals(mealId, tx);
    await recalculateDailyLogTotals(meal.dailyLogId, tx);
    return item;
  }).then(async (item) => {
    if (itemType === MealItemType.ACTUAL) await notifyMealActivity(userId, mealId);
    return item;
  });
}

export async function updateMealItem(userId: string, itemId: string, data: Record<string, unknown>) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.mealItem.findUniqueOrThrow({ where: { id: itemId }, include: { meal: true } });
    if (existing.meal.userId !== userId) throw new Error('Not found');
    const item = await tx.mealItem.update({
      where: { id: itemId },
      data: {
        nameSnapshot: data.nameSnapshot ? String(data.nameSnapshot) : undefined,
        quantity: data.quantity === undefined ? undefined : Number(data.quantity),
        unit: data.unit ? String(data.unit) : undefined,
        calories: data.calories === undefined ? undefined : Number(data.calories),
        protein: data.protein === undefined ? undefined : Number(data.protein),
        carbs: data.carbs === undefined ? undefined : Number(data.carbs),
        fat: data.fat === undefined ? undefined : Number(data.fat)
      }
    });
    await recalculateMealTotals(existing.mealId, tx);
    await recalculateDailyLogTotals(existing.meal.dailyLogId, tx);
    return item;
  });
}

export async function moveMealItemsToMeal(userId: string, itemIds: string[], targetMealId: string) {
  if (!itemIds.length) throw new Error('No items to move.');

  return prisma.$transaction(async (tx) => {
    const targetMeal = await tx.meal.findFirstOrThrow({ where: { id: targetMealId, userId } });
    const sourceMealIds = new Set<string>();

    for (const itemId of itemIds) {
      const item = await tx.mealItem.findFirstOrThrow({ where: { id: itemId }, include: { meal: true } });
      if (item.meal.userId !== userId) throw new Error('Not found');
      sourceMealIds.add(item.mealId);
      await tx.mealItem.update({ where: { id: itemId }, data: { mealId: targetMealId } });
    }

    for (const sourceMealId of sourceMealIds) {
      await recalculateMealTotals(sourceMealId, tx);
    }
    await recalculateMealTotals(targetMealId, tx);
    await recalculateDailyLogTotals(targetMeal.dailyLogId, tx);
    return targetMeal;
  });
}

export async function deleteMealItem(userId: string, itemId: string) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.mealItem.findUniqueOrThrow({ where: { id: itemId }, include: { meal: true } });
    if (existing.meal.userId !== userId) throw new Error('Not found');
    if (existing.type === MealItemType.PLANNED) {
      await tx.mealItem.deleteMany({ where: { linkedPlannedItemId: itemId } });
    }
    await tx.mealItem.delete({ where: { id: itemId } });
    await recalculateMealTotals(existing.mealId, tx);
    return recalculateDailyLogTotals(existing.meal.dailyLogId, tx);
  });
}

export async function setPlannedItemLogged(userId: string, plannedItemId: string, logged: boolean) {
  return prisma.$transaction(async (tx) => {
    const planned = await tx.mealItem.findUniqueOrThrow({
      where: { id: plannedItemId },
      include: { meal: { include: { items: true } } }
    });
    if (planned.meal.userId !== userId || planned.type !== MealItemType.PLANNED) throw new Error('Not found');

    const existingActual = planned.meal.items.find(
      (item) => item.type === MealItemType.ACTUAL && item.linkedPlannedItemId === plannedItemId
    );
    const matchingUnlinkedActual = planned.meal.items.find((item) => matchesPlannedActual(item, planned));

    if (logged) {
      if (existingActual) {
        // already linked
      } else if (matchingUnlinkedActual) {
        await tx.mealItem.update({
          where: { id: matchingUnlinkedActual.id },
          data: { linkedPlannedItemId: planned.id }
        });
      } else {
        await tx.mealItem.create({
          data: {
            mealId: planned.mealId,
            foodId: planned.foodId,
            type: MealItemType.ACTUAL,
            linkedPlannedItemId: planned.id,
            nameSnapshot: planned.nameSnapshot,
            quantity: planned.quantity,
            unit: planned.unit,
            calories: planned.calories,
            protein: planned.protein,
            carbs: planned.carbs,
            fat: planned.fat
          }
        });
      }
    } else {
      const toRemove = existingActual ?? matchingUnlinkedActual;
      if (toRemove) await tx.mealItem.delete({ where: { id: toRemove.id } });
    }

    await recalculateMealTotals(planned.mealId, tx);
    await recalculateDailyLogTotals(planned.meal.dailyLogId, tx);

    const meal = await tx.meal.findFirstOrThrow({ where: { id: planned.mealId }, include: { items: true } });
    const plannedCount = meal.items.filter((item) => item.type === MealItemType.PLANNED).length;
    const loggedCount = meal.items.filter(
      (item) => item.type === MealItemType.ACTUAL && item.linkedPlannedItemId
    ).length;
    const hasUnlinkedActual = meal.items.some(
      (item) => item.type === MealItemType.ACTUAL && !item.linkedPlannedItemId
    );

    let status: MealStatus = MealStatus.PLANNED;
    if (plannedCount > 0 && loggedCount === plannedCount && !hasUnlinkedActual) {
      status = MealStatus.EATEN_AS_PLANNED;
    } else if (meal.items.some((item) => item.type === MealItemType.ACTUAL)) {
      status = MealStatus.MODIFIED;
    }

    await tx.meal.update({ where: { id: planned.mealId }, data: { status } });
    return { meal, logged };
  }).then(async ({ meal }) => {
    await notifyMealActivity(userId, meal.id);
    return meal;
  });
}

export async function copyMealFromPreviousDay(userId: string, mealId: string) {
  return prisma.$transaction(async (tx) => {
    const meal = await tx.meal.findFirstOrThrow({
      where: { id: mealId, userId },
      include: { dailyLog: true }
    });

    const priorLog = await tx.dailyLog.findFirst({
      where: { userId, date: { lt: meal.dailyLog.date } },
      orderBy: { date: 'desc' },
      include: { meals: { where: { mealNumber: meal.mealNumber }, include: { items: true } } }
    });

    if (!priorLog?.meals[0]) throw new Error('No prior meal found to copy');

    const sourceMeal = priorLog.meals[0];
    const plannedItems = sourceMeal.items.filter((item) => item.type === MealItemType.PLANNED);

    await tx.mealItem.deleteMany({ where: { mealId, type: MealItemType.PLANNED } });

    if (plannedItems.length) {
      await tx.mealItem.createMany({
        data: plannedItems.map((item) => ({
          mealId,
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
      });
    }

    await recalculateMealTotals(mealId, tx);
    return tx.meal.findFirstOrThrow({ where: { id: mealId }, include: { items: true } });
  });
}

const MAX_COPY_FORWARD_DAYS = 31;

type SourceMealCopy = {
  mealNumber: number;
  name: string;
  plannedTime: string | null;
  plannedItems: Array<{
    foodId: string | null;
    nameSnapshot: string;
    quantity: Prisma.Decimal;
    unit: string;
    calories: Prisma.Decimal;
    protein: Prisma.Decimal;
    carbs: Prisma.Decimal;
    fat: Prisma.Decimal;
  }>;
};

async function getSourceMealsForCopy(userId: string, sourceDate: string): Promise<SourceMealCopy[]> {
  const sourceDay = parseDateParam(sourceDate);
  const sourceLog = await prisma.dailyLog.findUnique({
    where: { userId_date: { userId, date: sourceDay } },
    include: { meals: { include: { items: true }, orderBy: { mealNumber: 'asc' } } }
  });

  if (!sourceLog || !sourceLog.meals.length) {
    throw new Error('There is no plan on the selected day to copy.');
  }

  return sourceLog.meals.map((meal) => ({
    mealNumber: meal.mealNumber,
    name: meal.name,
    plannedTime: meal.plannedTime,
    plannedItems: meal.items
      .filter((item) => item.type === MealItemType.PLANNED)
      .map((item) => ({
        foodId: item.foodId,
        nameSnapshot: item.nameSnapshot,
        quantity: item.quantity,
        unit: item.unit,
        calories: item.calories,
        protein: item.protein,
        carbs: item.carbs,
        fat: item.fat
      }))
  }));
}

async function applySourceMealsToDailyLog(
  userId: string,
  log: NonNullable<Awaited<ReturnType<typeof ensureDailyLogByUserId>>>,
  sourceMeals: SourceMealCopy[],
  dayTransactionTimeoutMs: number
) {
  await prisma.$transaction(
    async (tx) => {
      for (const source of sourceMeals) {
        let target = await tx.meal.findFirst({
          where: { dailyLogId: log.id, mealNumber: source.mealNumber }
        });
        if (!target) {
          target = await tx.meal.create({
            data: {
              dailyLogId: log.id,
              userId,
              mealNumber: source.mealNumber,
              name: source.name,
              plannedTime: source.plannedTime,
              status: MealStatus.PLANNED
            }
          });
        }

        await tx.mealItem.deleteMany({ where: { mealId: target.id, type: MealItemType.PLANNED } });
        if (source.plannedItems.length) {
          await tx.mealItem.createMany({
            data: source.plannedItems.map((item) => ({
              mealId: target!.id,
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
          });
        }

        await recalculateMealTotals(target.id, tx);
      }

      await recalculateDailyLogTotals(log.id, tx);
    },
    { maxWait: 10_000, timeout: dayTransactionTimeoutMs }
  );
}

export async function clearDayPlannedFoods(userId: string, date: string) {
  const log = await ensureDailyLogByUserId(userId, date);
  if (!log) throw new Error('No active program found. Visit the dashboard first or contact your coach.');

  const meals = await prisma.meal.findMany({ where: { dailyLogId: log.id } });
  const dayTransactionTimeoutMs = Math.min(60_000, 10_000 + meals.length * 500);

  await prisma.$transaction(
    async (tx) => {
      for (const meal of meals) {
        await tx.mealItem.deleteMany({ where: { mealId: meal.id, type: MealItemType.PLANNED } });
        await recalculateMealTotals(meal.id, tx);
      }
      await recalculateDailyLogTotals(log.id, tx);
    },
    { maxWait: 10_000, timeout: dayTransactionTimeoutMs }
  );
}

/**
 * Copies a source day's planned foods into each of the next `days` days. For every target day we
 * match meals by mealNumber, replace that meal's PLANNED items with the source day's (leaving any
 * logged ACTUAL items untouched), and recalculate totals. Target days are created/seeded as needed.
 */
export async function copyDayPlanForward(userId: string, sourceDate: string, days: number) {
  if (!Number.isInteger(days) || days < 1 || days > MAX_COPY_FORWARD_DAYS) {
    throw new Error(`Number of days must be between 1 and ${MAX_COPY_FORWARD_DAYS}.`);
  }

  const sourceMeals = await getSourceMealsForCopy(userId, sourceDate);
  const sourceDay = parseDateParam(sourceDate);
  const targetDateKeys = Array.from({ length: days }, (_, index) => toDateKey(addUtcDays(sourceDay, index + 1)));

  const targetLogs: NonNullable<Awaited<ReturnType<typeof ensureDailyLogByUserId>>>[] = [];
  for (const targetKey of targetDateKeys) {
    const log = await ensureDailyLogByUserId(userId, targetKey);
    if (!log) {
      throw new Error('No active program found. Visit the dashboard first or contact your coach.');
    }
    targetLogs.push(log);
  }

  const dayTransactionTimeoutMs = Math.min(60_000, 10_000 + sourceMeals.length * 500);

  for (const log of targetLogs) {
    await applySourceMealsToDailyLog(userId, log, sourceMeals, dayTransactionTimeoutMs);
  }

  return { copiedDays: days, targetDates: targetDateKeys };
}

export async function copyDayPlanToDates(
  userId: string,
  sourceDate: string,
  targetDates: string[],
  options: { clearDates?: string[]; clearUncheckedDays?: boolean; weekDates?: string[] } = {}
) {
  const targets = [...new Set(targetDates.filter((date) => date !== sourceDate))];

  const clearDates =
    options.clearDates ??
    (options.clearUncheckedDays && options.weekDates?.length
      ? options.weekDates.filter((date) => date !== sourceDate && !targets.includes(date))
      : []);

  if (!targets.length && !clearDates.length) {
    throw new Error('Select days to copy to, or enable clearing rest days.');
  }

  const sourceMeals = targets.length ? await getSourceMealsForCopy(userId, sourceDate) : [];
  if (targets.length && !sourceMeals.length) {
    throw new Error('There is no plan on this day to copy. Add meals first, or only clear rest days.');
  }

  const dayTransactionTimeoutMs = Math.min(60_000, 10_000 + sourceMeals.length * 500);

  for (const targetKey of targets) {
    const log = await ensureDailyLogByUserId(userId, targetKey);
    if (!log) {
      throw new Error('No active program found. Visit the dashboard first or contact your coach.');
    }
    await applySourceMealsToDailyLog(userId, log, sourceMeals, dayTransactionTimeoutMs);
  }

  for (const date of [...new Set(clearDates)]) {
    await clearDayPlannedFoods(userId, date);
  }

  return { copiedDays: targets.length, targetDates: targets, clearedDays: clearDates.length };
}

const APPLY_FORWARD_DAYS = 14;
const DAY_MS = 86400000;

/**
 * "Changing a meal sets it from that day forward" — the same rule card builds and AI
 * meals follow, for manual edits: copy this meal's PLANNED items over the same-numbered
 * meal on future days (14-day horizon). Days where that meal already has logged
 * (ACTUAL) food are left alone, and card provenance is cleared on overwritten meals
 * since their contents no longer come from card picks.
 */
export async function applyMealForward(userId: string, mealId: string) {
  const source = await prisma.meal.findFirstOrThrow({
    where: { id: mealId, userId },
    include: { dailyLog: true, items: { where: { type: MealItemType.PLANNED } } }
  });

  const fromDay = source.dailyLog.date;
  const horizon = new Date(fromDay.getTime() + APPLY_FORWARD_DAYS * DAY_MS);
  const futureLogs = await prisma.dailyLog.findMany({
    where: { userId, date: { gt: fromDay, lte: horizon } },
    orderBy: { date: 'asc' },
    select: { id: true }
  });

  let applied = 0;
  for (const log of futureLogs) {
    await prisma.$transaction(async (tx) => {
      let target = await tx.meal.findFirst({ where: { dailyLogId: log.id, mealNumber: source.mealNumber } });
      if (target) {
        const actuals = await tx.mealItem.count({ where: { mealId: target.id, type: MealItemType.ACTUAL } });
        if (actuals > 0) return;
      } else {
        target = await tx.meal.create({
          data: {
            dailyLogId: log.id,
            userId,
            mealNumber: source.mealNumber,
            name: source.name,
            plannedTime: source.plannedTime,
            status: MealStatus.PLANNED
          }
        });
      }
      await tx.mealItem.deleteMany({ where: { mealId: target.id, type: MealItemType.PLANNED } });
      if (source.items.length) {
        await tx.mealItem.createMany({
          data: source.items.map((item) => ({
            mealId: target!.id,
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
        });
      }
      await tx.meal.update({
        where: { id: target.id },
        data: { name: source.name, plannedTime: source.plannedTime, cardSelections: Prisma.JsonNull }
      });
      await recalculateMealTotals(target.id, tx);
      await recalculateDailyLogTotals(log.id, tx);
      applied += 1;
    });
  }
  return { appliedDays: applied };
}
