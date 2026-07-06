import { MealItemType, MealStatus, ProgramStatus } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { n } from '../utils/numbers.js';
import { getMealStructure, slotTargets } from './targetService.js';
import { recalculateDailyLogTotals, recalculateMealTotals } from './totalsService.js';
import {
  cardSetInclude,
  defaultPicksForSet,
  materializeCardMeal,
  scaledLinesForPicks,
  applyQuantityOverrides,
  parseStoredPicks,
  type CardPicks,
  type QuantityOverrides
} from './mealCardMaterialize.js';

/**
 * Formula-era day materialization for templateless plans: build the day's meals from
 * the canonical meal structure, splitting the PlanPeriod's frozen day target across
 * slots and filling each from the card system (standing picks → set defaults).
 * Returns false when the program has no frozen-target period (caller falls back).
 */
export async function applyStructureMealsToLog(userId: string, dailyLogId: string, day: Date): Promise<boolean> {
  const program = await prisma.program.findFirst({
    where: { userId, status: ProgramStatus.ACTIVE },
    select: { id: true }
  });
  if (!program) return false;

  const period = await prisma.planPeriod.findFirst({
    where: { programId: program.id, effectiveDate: { lte: day }, calorieTarget: { not: null } },
    orderBy: { effectiveDate: 'desc' },
    select: { calorieTarget: true }
  });
  if (!period) return false;

  const [structure, sets, standingPicks] = await Promise.all([
    getMealStructure(),
    prisma.mealCardSet.findMany({ orderBy: { createdAt: 'asc' }, include: cardSetInclude }),
    prisma.userMealCardPicks.findMany({ where: { userId } })
  ]);
  const slots = slotTargets(n(period.calorieTarget), structure);

  await prisma.$transaction(async (tx) => {
    await tx.meal.deleteMany({ where: { dailyLogId } });
    for (const slot of slots) {
      const meal = await tx.meal.create({
        data: {
          dailyLogId,
          userId,
          mealNumber: slot.mealNumber,
          name: slot.name,
          plannedTime: slot.plannedTime,
          status: MealStatus.PLANNED
        }
      });
      const cardSet = sets.find((set) => set.slotType === slot.slotType);
      if (!cardSet) continue;
      const standing = standingPicks.find((p) => p.cardSetId === cardSet.id && p.mealNumber === slot.mealNumber);
      const { picks, quantities } = standing ? parseStoredPicks(standing.picks) : { picks: defaultPicksForSet(cardSet) };
      if (!Object.keys(picks).length) continue;
      let lines = scaledLinesForPicks(cardSet, slot.calorieTarget, picks);
      if (quantities && Object.keys(quantities).length) lines = applyQuantityOverrides(lines, quantities);
      await materializeCardMeal(tx, meal.id, cardSet.id, picks, lines, quantities);
    }
    await tx.dailyLog.update({ where: { id: dailyLogId }, data: { mealsPlanned: slots.length } });
    await recalculateDailyLogTotals(dailyLogId, tx);
  });
  return true;
}

/** Re-scale card-backed meals on a legacy template log to the week's frozen slot targets. */
export async function resyncCardMealsToFrozenPeriod(userId: string, dailyLogId: string, day: Date): Promise<boolean> {
  const program = await prisma.program.findFirst({
    where: { userId, status: ProgramStatus.ACTIVE },
    select: { id: true }
  });
  if (!program) return false;

  const period = await prisma.planPeriod.findFirst({
    where: { programId: program.id, effectiveDate: { lte: day }, calorieTarget: { not: null } },
    orderBy: { effectiveDate: 'desc' },
    select: { calorieTarget: true }
  });
  if (!period) return false;

  const [structure, sets] = await Promise.all([
    getMealStructure(),
    prisma.mealCardSet.findMany({ include: cardSetInclude })
  ]);
  const slotByNumber = new Map(slotTargets(n(period.calorieTarget), structure).map((slot) => [slot.mealNumber, slot]));

  const meals = await prisma.meal.findMany({
    where: { dailyLogId },
    select: { id: true, mealNumber: true, cardSelections: true }
  });

  const cardMeals = meals.filter((meal) => {
    const sel = meal.cardSelections as { setId?: string; picks?: CardPicks } | null;
    return Boolean(sel?.setId && sel.picks && Object.keys(sel.picks).length);
  });
  if (!cardMeals.length) return false;

  await prisma.$transaction(async (tx) => {
    for (const meal of cardMeals) {
      const sel = meal.cardSelections as { setId: string; picks: CardPicks; quantities?: QuantityOverrides };
      const set = sets.find((candidate) => candidate.id === sel.setId);
      const slot = slotByNumber.get(meal.mealNumber);
      if (!set || !slot) continue;
      let lines = scaledLinesForPicks(set, slot.calorieTarget, sel.picks);
      if (sel.quantities && Object.keys(sel.quantities).length) {
        lines = applyQuantityOverrides(lines, sel.quantities);
      }
      await materializeCardMeal(tx, meal.id, set.id, sel.picks, lines, sel.quantities);
    }
    await recalculateDailyLogTotals(dailyLogId, tx);
  });
  return true;
}

/**
 * Scale a day's PLANNED meal items in place to hit a calorie target, preserving the
 * existing per-item distribution. ACTUAL (logged) items are never touched, so this is
 * safe to run on a day the user has already logged food to. Intended for fixed-item
 * template days where card re-scaling (resyncCardMealsToFrozenPeriod) doesn't apply.
 * Returns false when there are no scalable planned calories to work from.
 */
export async function rescalePlannedMealsToCalories(dailyLogId: string, targetCalories: number): Promise<boolean> {
  if (targetCalories <= 0) return false;

  const meals = await prisma.meal.findMany({
    where: { dailyLogId },
    include: { items: true }
  });

  const plannedItems = meals.flatMap((meal) => meal.items.filter((item) => item.type === MealItemType.PLANNED));
  const currentCalories = plannedItems.reduce((sum, item) => sum + n(item.calories), 0);
  if (currentCalories <= 0) return false;

  const factor = targetCalories / currentCalories;
  if (!Number.isFinite(factor) || factor <= 0) return false;

  await prisma.$transaction(async (tx) => {
    for (const item of plannedItems) {
      await tx.mealItem.update({
        where: { id: item.id },
        data: {
          quantity: n(item.quantity) * factor,
          calories: n(item.calories) * factor,
          protein: n(item.protein) * factor,
          carbs: n(item.carbs) * factor,
          fat: n(item.fat) * factor
        }
      });
    }
    for (const meal of meals) {
      await recalculateMealTotals(meal.id, tx);
    }
    await recalculateDailyLogTotals(dailyLogId, tx);
  });
  return true;
}
