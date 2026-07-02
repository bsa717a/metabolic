import { MealStatus, ProgramStatus } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { parseDateParam, toDateKey } from '../utils/dates.js';
import { n, round } from '../utils/numbers.js';
import { resolvePlanForDate } from './planResolution.js';
import { ensureDailyLogByUserId } from './dailyLogService.js';
import { recalculateDailyLogTotals } from './totalsService.js';
import { scaleFactor, scaleOptionFood, sumLines } from './mealCardScaling.js';
import {
  cardMealTarget,
  cardSetInclude,
  materializeCardMeal,
  scaledLinesForPicks,
  type CardPicks,
  type LoadedCardSet
} from './mealCardMaterialize.js';
import { getMealStructure, slotTargets } from './targetService.js';

const DAY_MS = 86400000;
/** How far forward a builder save propagates to already-materialized days. */
const FORWARD_APPLY_DAYS = 14;

export class MealCardError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export type ResolvedCardSlot = {
  mealNumber: number;
  name: string;
  plannedTime: string | null;
  cardSet: LoadedCardSet;
  targetCalories: number;
};

/**
 * Resolve every card-backed meal slot for a user's date. Two sources:
 *  - legacy: the plan's template meals carrying a mealCardSetId;
 *  - formula era (templateless plan): the canonical meal structure split over the
 *    PlanPeriod's frozen day target, each slot backed by a card set of its slotType.
 */
async function resolveCardMealsForDate(userId: string, date: string): Promise<ResolvedCardSlot[]> {
  const program = await prisma.program.findFirst({
    where: { userId, status: ProgramStatus.ACTIVE },
    select: { id: true, defaultNutritionTemplateId: true, defaultExerciseTemplateId: true }
  });
  if (!program) throw new MealCardError('No active program found', 404);

  const day = parseDateParam(date);
  const plan = await resolvePlanForDate(program, day);

  if (plan.nutritionTemplateId) {
    const templateMeals = await prisma.nutritionTemplateMeal.findMany({
      where: { templateId: plan.nutritionTemplateId, mealCardSetId: { not: null } },
      orderBy: { mealNumber: 'asc' },
      include: { mealCardSet: { include: cardSetInclude } }
    });
    return templateMeals
      .filter((meal) => meal.mealCardSet != null)
      .map((templateMeal) => ({
        mealNumber: templateMeal.mealNumber,
        name: templateMeal.name,
        plannedTime: templateMeal.plannedTime,
        cardSet: templateMeal.mealCardSet!,
        // The scale numerator: the meal's stored target, else scale 1:1 against the reference.
        targetCalories: cardMealTarget(templateMeal, templateMeal.mealCardSet!)
      }));
  }

  const period = await prisma.planPeriod.findFirst({
    where: { programId: program.id, effectiveDate: { lte: day }, calorieTarget: { not: null } },
    orderBy: { effectiveDate: 'desc' },
    select: { calorieTarget: true }
  });
  if (!period) throw new MealCardError('No nutrition plan for this date', 404);

  const [structure, sets] = await Promise.all([
    getMealStructure(),
    prisma.mealCardSet.findMany({ orderBy: { createdAt: 'asc' }, include: cardSetInclude })
  ]);
  const slots = slotTargets(n(period.calorieTarget), structure);
  return slots.flatMap((slot) => {
    const cardSet = sets.find((set) => set.slotType === slot.slotType);
    if (!cardSet) return [];
    return [
      {
        mealNumber: slot.mealNumber,
        name: slot.name,
        plannedTime: slot.plannedTime,
        cardSet,
        targetCalories: slot.calorieTarget
      }
    ];
  });
}

async function resolveCardMealForDate(userId: string, date: string, mealNumber: number) {
  const cardMeals = await resolveCardMealsForDate(userId, date);
  const match = cardMeals.find((entry) => entry.mealNumber === mealNumber);
  if (!match) throw new MealCardError('No card set for this meal', 404);
  return match;
}

function scaledOptionPayload(cardSet: LoadedCardSet, targetCalories: number) {
  const factor = scaleFactor(targetCalories, cardSet.referenceCalories);
  return cardSet.cards.map((card) => ({
    id: card.id,
    role: card.role,
    name: card.name,
    pickRule: card.pickRule,
    required: card.required,
    maxSelect: card.maxSelect,
    sortOrder: card.sortOrder,
    options: card.options.map((option) => {
      const foods = option.foods.map((line) =>
        scaleOptionFood({ ...line, food: line.food, isFree: line.food.isFreeFood || !line.scalable }, factor)
      );
      return {
        id: option.id,
        name: option.name,
        description: option.description,
        icon: option.icon,
        isDefault: option.isDefault,
        sortOrder: option.sortOrder,
        foods,
        totals: sumLines(foods)
      };
    })
  }));
}

/** GET payload: every card-backed meal's scaled set + any selections saved for the date. */
export async function getMealCardsForDate(userId: string, date: string) {
  const cardMeals = await resolveCardMealsForDate(userId, date);
  if (!cardMeals.length) throw new MealCardError('No card sets on this plan', 404);

  const day = parseDateParam(date);
  const log = await prisma.dailyLog.findUnique({ where: { userId_date: { userId, date: day } } });
  const dayMeals = log
    ? await prisma.meal.findMany({ where: { dailyLogId: log.id }, select: { mealNumber: true, name: true, cardSelections: true } })
    : [];

  const userPicks = await prisma.userMealCardPicks.findMany({
    where: { userId, cardSetId: { in: cardMeals.map((c) => c.cardSet.id) } }
  });

  return cardMeals.map((slot) => {
    const meal = dayMeals.find((m) => m.mealNumber === slot.mealNumber);
    // Day-specific provenance wins; otherwise the user's standing picks for this slot.
    const daySaved = meal?.cardSelections as { setId: string; picks: CardPicks } | null | undefined;
    const standing = userPicks.find((p) => p.cardSetId === slot.cardSet.id && p.mealNumber === slot.mealNumber);
    return {
      setId: slot.cardSet.id,
      setName: slot.cardSet.name,
      slotType: slot.cardSet.slotType,
      mealNumber: slot.mealNumber,
      mealName: meal?.name ?? slot.name,
      targetCalories: round(slot.targetCalories, 0),
      referenceCalories: n(slot.cardSet.referenceCalories),
      cards: scaledOptionPayload(slot.cardSet, slot.targetCalories),
      savedSelections:
        daySaved ?? (standing ? { setId: slot.cardSet.id, picks: standing.picks as CardPicks } : null)
    };
  });
}

export type MealSelections = Record<string, string | string[]>;

function validateSelections(cardSet: LoadedCardSet, selections: MealSelections) {
  const picked = new Map<string, string[]>();
  for (const card of cardSet.cards) {
    const raw = selections[card.id];
    const ids = raw == null ? [] : Array.isArray(raw) ? raw : [raw];
    const valid = new Set(card.options.map((o) => o.id));
    for (const id of ids) {
      if (!valid.has(id)) throw new MealCardError(`Unknown option for card "${card.name}"`);
    }
    if (card.required && ids.length === 0) throw new MealCardError(`"${card.name}" needs a selection`);
    if (ids.length > card.maxSelect) throw new MealCardError(`"${card.name}" allows at most ${card.maxSelect}`);
    picked.set(card.id, ids);
  }
  const knownCards = new Set(cardSet.cards.map((c) => c.id));
  for (const cardId of Object.keys(selections)) {
    if (!knownCards.has(cardId)) throw new MealCardError('Unknown card in selections');
  }
  return picked;
}

/**
 * Persist the builder's picks for one meal: they become the user's standing selection
 * for this card set, materialized into the chosen day AND every already-materialized
 * future day (within the horizon) whose plan uses the same card set. Days not yet
 * created pick the standing selection up at materialization time. Macros are frozen
 * into PLANNED MealItems (logs stay historically accurate); ACTUAL items untouched.
 */
export async function saveMealSelections(userId: string, date: string, mealNumber: number, selections: MealSelections) {
  const slot = await resolveCardMealForDate(userId, date, mealNumber);
  validateSelections(slot.cardSet, selections);

  const lines = scaledLinesForPicks(slot.cardSet, slot.targetCalories, selections);

  const log = await ensureDailyLogByUserId(userId, date);
  if (!log) throw new MealCardError('No active program found', 404);

  await prisma.$transaction(async (tx) => {
    await tx.userMealCardPicks.upsert({
      where: {
        userId_cardSetId_mealNumber: { userId, cardSetId: slot.cardSet.id, mealNumber: slot.mealNumber }
      },
      create: { userId, cardSetId: slot.cardSet.id, mealNumber: slot.mealNumber, picks: selections },
      update: { picks: selections }
    });

    const meal = await ensureMealRow(tx, log.id, userId, slot);
    await materializeCardMeal(tx, meal.id, slot.cardSet.id, selections, lines);
    await recalculateDailyLogTotals(log.id, tx);
  });

  const appliedDays = await applyPicksToFutureLogs(userId, parseDateParam(date), mealNumber, slot.cardSet.id, selections);

  const payloads = await getMealCardsForDate(userId, date);
  const payload = payloads.find((p) => p.mealNumber === mealNumber) ?? payloads[0];
  return { ...payload, appliedDays };
}

type TemplateMealRow = { mealNumber: number; name: string; plannedTime: string | null };

async function ensureMealRow(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  dailyLogId: string,
  userId: string,
  templateMeal: TemplateMealRow
) {
  const existing = await tx.meal.findFirst({ where: { dailyLogId, mealNumber: templateMeal.mealNumber } });
  if (existing) return existing;
  return tx.meal.create({
    data: {
      dailyLogId,
      userId,
      mealNumber: templateMeal.mealNumber,
      name: templateMeal.name,
      plannedTime: templateMeal.plannedTime,
      status: MealStatus.PLANNED
    }
  });
}

/** Re-materialize the same picks into existing future daily logs using the same card set. */
async function applyPicksToFutureLogs(
  userId: string,
  fromDay: Date,
  mealNumber: number,
  cardSetId: string,
  picks: CardPicks
) {
  const horizon = new Date(fromDay.getTime() + FORWARD_APPLY_DAYS * DAY_MS);
  const futureLogs = await prisma.dailyLog.findMany({
    where: { userId, date: { gt: fromDay, lte: horizon } },
    orderBy: { date: 'asc' },
    select: { id: true, date: true }
  });

  let applied = 0;
  for (const log of futureLogs) {
    // Re-resolve the slot for that date (template or structure source alike) and
    // apply only while the same card set still backs this meal number.
    let slot: ResolvedCardSlot | undefined;
    try {
      const slots = await resolveCardMealsForDate(userId, toDateKey(log.date));
      slot = slots.find((s) => s.mealNumber === mealNumber && s.cardSet.id === cardSetId);
    } catch {
      continue;
    }
    if (!slot) continue;

    const lines = scaledLinesForPicks(slot.cardSet, slot.targetCalories, picks);
    await prisma.$transaction(async (tx) => {
      const meal = await ensureMealRow(tx, log.id, userId, slot!);
      await materializeCardMeal(tx, meal.id, cardSetId, picks, lines);
      await recalculateDailyLogTotals(log.id, tx);
    });
    applied += 1;
  }
  return applied;
}
