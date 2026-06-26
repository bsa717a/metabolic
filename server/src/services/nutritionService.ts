import { MealItemType, MealStatus } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { parseDateParam } from '../utils/dates.js';
import { n } from '../utils/numbers.js';
import { recalculateDailyLogTotals, recalculateMealTotals } from './totalsService.js';
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

export async function createMeal(userId: string, date: string, data: { name: string; mealNumber: number; plannedTime?: string }) {
  const day = parseDateParam(date);
  const log = await prisma.dailyLog.findUniqueOrThrow({ where: { userId_date: { userId, date: day } } });
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
