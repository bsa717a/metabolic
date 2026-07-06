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
  applyQuantityOverrides,
  parseStoredPicks,
  serializeStoredPicks,
  type CardPicks,
  type LoadedCardSet,
  type QuantityOverrides
} from './mealCardMaterialize.js';
import { getMealStructure, slotMacroTargets, slotTargets } from './targetService.js';
import { findCardSetForTemplateMeal } from '../utils/mealSlotMatch.js';

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
  targetProtein: number;
  targetCarbs: number;
  targetFat: number;
};

function mealMacroTargets(
  mealNumber: number,
  targetCalories: number,
  structure: Awaited<ReturnType<typeof getMealStructure>>,
  dayTargets: { protein: number; carbs: number; fat: number } | null,
  template: { calorieTarget: unknown; proteinTarget: unknown; carbTarget: unknown; fatTarget: unknown } | null
) {
  const slot = structure.slots.find((entry) => entry.mealNumber === mealNumber);
  if (dayTargets && slot) {
    return slotMacroTargets(slot.sharePct, dayTargets, structure);
  }
  if (template && n(template.calorieTarget) > 0) {
    const ratio = targetCalories / n(template.calorieTarget);
    return {
      protein: Math.round(n(template.proteinTarget) * ratio),
      carbs: Math.round(n(template.carbTarget) * ratio),
      fat: Math.round(n(template.fatTarget) * ratio)
    };
  }
  return { protein: 0, carbs: 0, fat: 0 };
}

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
    const [templateMeals, sets, structure, period, log] = await Promise.all([
      prisma.nutritionTemplateMeal.findMany({
        where: { templateId: plan.nutritionTemplateId },
        orderBy: { mealNumber: 'asc' },
        include: {
          mealCardSet: { include: cardSetInclude },
          template: { select: { calorieTarget: true, proteinTarget: true, carbTarget: true, fatTarget: true } }
        }
      }),
      prisma.mealCardSet.findMany({ orderBy: { createdAt: 'asc' }, include: cardSetInclude }),
      getMealStructure(),
      prisma.planPeriod.findFirst({
        where: { programId: program.id, effectiveDate: { lte: day }, calorieTarget: { not: null } },
        orderBy: { effectiveDate: 'desc' },
        select: { calorieTarget: true, proteinTarget: true, carbTarget: true, fatTarget: true }
      }),
      prisma.dailyLog.findUnique({ where: { userId_date: { userId, date: day } }, select: { id: true } })
    ]);
    const structureSlots = structure.slots;
    const slotCalories = period
      ? new Map(slotTargets(n(period.calorieTarget), structure).map((slot) => [slot.mealNumber, slot.calorieTarget]))
      : null;
    const dayTargets = period
      ? {
          protein: Math.round(n(period.proteinTarget)),
          carbs: Math.round(n(period.carbTarget)),
          fat: Math.round(n(period.fatTarget))
        }
      : null;

    const resolved: ResolvedCardSlot[] = templateMeals.flatMap((templateMeal) => {
      const cardSet = findCardSetForTemplateMeal(templateMeal, sets, structureSlots);
      if (!cardSet) return [];
      const targetCalories = slotCalories?.get(templateMeal.mealNumber) ?? cardMealTarget(templateMeal, cardSet);
      const macros = mealMacroTargets(
        templateMeal.mealNumber,
        targetCalories,
        structure,
        dayTargets,
        templateMeal.template ?? null
      );
      return [
        {
          mealNumber: templateMeal.mealNumber,
          name: templateMeal.name,
          plannedTime: templateMeal.plannedTime,
          cardSet,
          targetCalories,
          targetProtein: macros.protein,
          targetCarbs: macros.carbs,
          targetFat: macros.fat
        }
      ];
    });

    if (log) {
      const dayMeals = await prisma.meal.findMany({
        where: { dailyLogId: log.id },
        select: { mealNumber: true, name: true, plannedTime: true }
      });
      const covered = new Set(resolved.map((slot) => slot.mealNumber));
      for (const dayMeal of dayMeals) {
        if (covered.has(dayMeal.mealNumber)) continue;
        const cardSet = findCardSetForTemplateMeal(
          { ...dayMeal, mealCardSet: null },
          sets,
          structureSlots
        );
        if (!cardSet) continue;
        const targetCalories = slotCalories?.get(dayMeal.mealNumber) ?? n(cardSet.referenceCalories);
        const macros = mealMacroTargets(dayMeal.mealNumber, targetCalories, structure, dayTargets, null);
        resolved.push({
          mealNumber: dayMeal.mealNumber,
          name: dayMeal.name,
          plannedTime: dayMeal.plannedTime,
          cardSet,
          targetCalories,
          targetProtein: macros.protein,
          targetCarbs: macros.carbs,
          targetFat: macros.fat
        });
        covered.add(dayMeal.mealNumber);
      }
    }

    return resolved.sort((a, b) => a.mealNumber - b.mealNumber);
  }

  const period = await prisma.planPeriod.findFirst({
    where: { programId: program.id, effectiveDate: { lte: day }, calorieTarget: { not: null } },
    orderBy: { effectiveDate: 'desc' },
    select: { calorieTarget: true, proteinTarget: true, carbTarget: true, fatTarget: true }
  });
  if (!period) throw new MealCardError('No nutrition plan for this date', 404);

  const [structure, sets] = await Promise.all([
    getMealStructure(),
    prisma.mealCardSet.findMany({ orderBy: { createdAt: 'asc' }, include: cardSetInclude })
  ]);
  const dayTargets = {
    protein: Math.round(n(period.proteinTarget)),
    carbs: Math.round(n(period.carbTarget)),
    fat: Math.round(n(period.fatTarget))
  };
  const slots = slotTargets(n(period.calorieTarget), structure);
  return slots.flatMap((slot) => {
    const cardSet = sets.find((set) => set.slotType === slot.slotType);
    if (!cardSet) return [];
    const macros = slotMacroTargets(slot.sharePct, dayTargets, structure);
    return [
      {
        mealNumber: slot.mealNumber,
        name: slot.name,
        plannedTime: slot.plannedTime,
        cardSet,
        targetCalories: slot.calorieTarget,
        targetProtein: macros.protein,
        targetCarbs: macros.carbs,
        targetFat: macros.fat
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

export type DailyMacroTargets = { calories: number; protein: number; carbs: number; fat: number };

/** Daily macro targets for a date — daily log first, then the active plan period. */
export async function resolveDailyMacroTargets(userId: string, date: string): Promise<DailyMacroTargets | null> {
  const day = parseDateParam(date);
  const log = await prisma.dailyLog.findUnique({
    where: { userId_date: { userId, date: day } },
    select: { calorieTarget: true, proteinTarget: true, carbTarget: true, fatTarget: true }
  });
  if (log && n(log.calorieTarget) > 0) {
    return {
      calories: Math.round(n(log.calorieTarget)),
      protein: Math.round(n(log.proteinTarget)),
      carbs: Math.round(n(log.carbTarget)),
      fat: Math.round(n(log.fatTarget))
    };
  }

  const program = await prisma.program.findFirst({
    where: { userId, status: ProgramStatus.ACTIVE },
    select: { id: true }
  });
  if (!program) return null;

  const period = await prisma.planPeriod.findFirst({
    where: { programId: program.id, effectiveDate: { lte: day }, calorieTarget: { not: null } },
    orderBy: { effectiveDate: 'desc' },
    select: { calorieTarget: true, proteinTarget: true, carbTarget: true, fatTarget: true }
  });
  if (!period || n(period.calorieTarget) <= 0) return null;

  return {
    calories: Math.round(n(period.calorieTarget)),
    protein: Math.round(n(period.proteinTarget)),
    carbs: Math.round(n(period.carbTarget)),
    fat: Math.round(n(period.fatTarget))
  };
}

/** GET payload: every card-backed meal's scaled set + any selections saved for the date. */
export async function getMealCardsForDate(userId: string, date: string) {
  const cardMeals = await resolveCardMealsForDate(userId, date);
  if (!cardMeals.length) throw new MealCardError('No card sets on this plan', 404);

  const day = parseDateParam(date);
  const dailyTargets = await resolveDailyMacroTargets(userId, date);
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
    const daySaved = meal?.cardSelections as
      | { setId: string; picks: CardPicks; quantities?: QuantityOverrides }
      | null
      | undefined;
    const standing = userPicks.find((p) => p.cardSetId === slot.cardSet.id && p.mealNumber === slot.mealNumber);
    const standingParsed = standing ? parseStoredPicks(standing.picks) : null;
    const saved =
      daySaved ??
      (standingParsed
        ? {
            setId: slot.cardSet.id,
            picks: standingParsed.picks,
            ...(standingParsed.quantities ? { quantities: standingParsed.quantities } : {})
          }
        : null);
    return {
      setId: slot.cardSet.id,
      setName: slot.cardSet.name,
      slotType: slot.cardSet.slotType,
      mealNumber: slot.mealNumber,
      mealName: meal?.name ?? slot.name,
      targetCalories: round(slot.targetCalories, 0),
      targetProtein: slot.targetProtein,
      targetCarbs: slot.targetCarbs,
      targetFat: slot.targetFat,
      referenceCalories: n(slot.cardSet.referenceCalories),
      dailyTargets,
      cards: scaledOptionPayload(slot.cardSet, slot.targetCalories),
      savedSelections: saved
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
export async function saveMealSelections(
  userId: string,
  date: string,
  mealNumber: number,
  selections: MealSelections,
  quantities?: QuantityOverrides
) {
  const slot = await resolveCardMealForDate(userId, date, mealNumber);
  validateSelections(slot.cardSet, selections);

  let lines = scaledLinesForPicks(slot.cardSet, slot.targetCalories, selections);
  if (quantities && Object.keys(quantities).length) {
    lines = applyQuantityOverrides(lines, quantities);
  }

  const log = await ensureDailyLogByUserId(userId, date);
  if (!log) throw new MealCardError('No active program found', 404);

  await prisma.$transaction(async (tx) => {
    await tx.userMealCardPicks.upsert({
      where: {
        userId_cardSetId_mealNumber: { userId, cardSetId: slot.cardSet.id, mealNumber: slot.mealNumber }
      },
      create: {
        userId,
        cardSetId: slot.cardSet.id,
        mealNumber: slot.mealNumber,
        picks: serializeStoredPicks(selections, quantities)
      },
      update: { picks: serializeStoredPicks(selections, quantities) }
    });

    const meal = await ensureMealRow(tx, log.id, userId, slot);
    await materializeCardMeal(tx, meal.id, slot.cardSet.id, selections, lines, quantities);
    await recalculateDailyLogTotals(log.id, tx);
  });

  const appliedDays = await applyPicksToFutureLogs(
    userId,
    parseDateParam(date),
    mealNumber,
    slot.cardSet.id,
    selections,
    quantities
  );

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
  picks: CardPicks,
  quantities?: QuantityOverrides
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

    let lines = scaledLinesForPicks(slot.cardSet, slot.targetCalories, picks);
    if (quantities && Object.keys(quantities).length) {
      lines = applyQuantityOverrides(lines, quantities);
    }
    await prisma.$transaction(async (tx) => {
      const meal = await ensureMealRow(tx, log.id, userId, slot!);
      await materializeCardMeal(tx, meal.id, cardSetId, picks, lines, quantities);
      await recalculateDailyLogTotals(log.id, tx);
    });
    applied += 1;
  }
  return applied;
}
