import { MealStatus, ProgramStatus } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { n } from '../utils/numbers.js';
import { getMealStructure, slotTargets } from './targetService.js';
import { recalculateDailyLogTotals } from './totalsService.js';
import {
  cardSetInclude,
  defaultPicksForSet,
  materializeCardMeal,
  scaledLinesForPicks,
  type CardPicks
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
      const picks = standing ? (standing.picks as CardPicks) : defaultPicksForSet(cardSet);
      if (!Object.keys(picks).length) continue;
      await materializeCardMeal(
        tx,
        meal.id,
        cardSet.id,
        picks,
        scaledLinesForPicks(cardSet, slot.calorieTarget, picks)
      );
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
      const sel = meal.cardSelections as { setId: string; picks: CardPicks };
      const set = sets.find((candidate) => candidate.id === sel.setId);
      const slot = slotByNumber.get(meal.mealNumber);
      if (!set || !slot) continue;
      await materializeCardMeal(
        tx,
        meal.id,
        set.id,
        sel.picks,
        scaledLinesForPicks(set, slot.calorieTarget, sel.picks)
      );
    }
    await recalculateDailyLogTotals(dailyLogId, tx);
  });
  return true;
}
