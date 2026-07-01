import { MealItemType, MealStatus, ProgramStatus, type Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { parseDateParam } from '../utils/dates.js';
import { n, round } from '../utils/numbers.js';
import { resolvePlanForDate } from './planResolution.js';
import { ensureDailyLogByUserId } from './dailyLogService.js';
import { recalculateDailyLogTotals, recalculateMealTotals } from './totalsService.js';
import { scaleFactor, scaleOptionFood, sumLines, type ScaledFoodLine } from './mealCardScaling.js';

const cardSetInclude = {
  cards: {
    orderBy: { sortOrder: 'asc' as const },
    include: {
      options: {
        orderBy: { sortOrder: 'asc' as const },
        include: { foods: { include: { food: true } } }
      }
    }
  }
} satisfies Prisma.MealCardSetInclude;

type LoadedCardSet = Prisma.MealCardSetGetPayload<{ include: typeof cardSetInclude }>;

export class MealCardError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * Resolve the card-set-backed meal for a user's date: active program → plan for the
 * date (PlanPeriod carry-forward) → template → the meal with a mealCardSetId.
 */
async function resolveCardMealForDate(userId: string, date: string) {
  const program = await prisma.program.findFirst({
    where: { userId, status: ProgramStatus.ACTIVE },
    select: { id: true, defaultNutritionTemplateId: true, defaultExerciseTemplateId: true }
  });
  if (!program) throw new MealCardError('No active program found', 404);

  const plan = await resolvePlanForDate(program, parseDateParam(date));
  if (!plan.nutritionTemplateId) throw new MealCardError('No nutrition plan for this date', 404);

  const templateMeal = await prisma.nutritionTemplateMeal.findFirst({
    where: { templateId: plan.nutritionTemplateId, mealCardSetId: { not: null } },
    include: { mealCardSet: { include: cardSetInclude } }
  });
  if (!templateMeal?.mealCardSet) throw new MealCardError('No dinner card set on this plan', 404);

  // The scale numerator: the meal's stored target, else scale 1:1 against the reference.
  const targetCalories = templateMeal.calorieTarget != null
    ? n(templateMeal.calorieTarget)
    : n(templateMeal.mealCardSet.referenceCalories);

  return { templateMeal, cardSet: templateMeal.mealCardSet, targetCalories };
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

/** GET payload: the whole scaled card set + any selections already saved for the date. */
export async function getDinnerCardsForDate(userId: string, date: string) {
  const { templateMeal, cardSet, targetCalories } = await resolveCardMealForDate(userId, date);

  const day = parseDateParam(date);
  const log = await prisma.dailyLog.findUnique({ where: { userId_date: { userId, date: day } } });
  const meal = log
    ? await prisma.meal.findFirst({ where: { dailyLogId: log.id, mealNumber: templateMeal.mealNumber } })
    : null;

  return {
    setId: cardSet.id,
    setName: cardSet.name,
    mealNumber: templateMeal.mealNumber,
    mealName: meal?.name ?? templateMeal.name,
    targetCalories: round(targetCalories, 0),
    referenceCalories: n(cardSet.referenceCalories),
    cards: scaledOptionPayload(cardSet, targetCalories),
    savedSelections: (meal?.cardSelections as Record<string, string | string[]> | null) ?? null
  };
}

export type DinnerSelections = Record<string, string | string[]>;

function validateSelections(cardSet: LoadedCardSet, selections: DinnerSelections) {
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
 * Persist the builder's picks for the date: write provenance to Meal.cardSelections and
 * materialize the scaled portions into PLANNED MealItems (macros frozen in — logs stay
 * historically accurate). Existing ACTUAL (logged) items are never touched.
 */
export async function saveDinnerSelections(userId: string, date: string, selections: DinnerSelections) {
  const { templateMeal, cardSet, targetCalories } = await resolveCardMealForDate(userId, date);
  const picked = validateSelections(cardSet, selections);

  const factor = scaleFactor(targetCalories, cardSet.referenceCalories);
  const lines: ScaledFoodLine[] = [];
  for (const card of cardSet.cards) {
    for (const optionId of picked.get(card.id) ?? []) {
      const option = card.options.find((o) => o.id === optionId)!;
      for (const line of option.foods) {
        lines.push(scaleOptionFood({ ...line, food: line.food, isFree: line.food.isFreeFood || !line.scalable }, factor));
      }
    }
  }

  const log = await ensureDailyLogByUserId(userId, date);
  if (!log) throw new MealCardError('No active program found', 404);

  await prisma.$transaction(async (tx) => {
    let meal = await tx.meal.findFirst({ where: { dailyLogId: log.id, mealNumber: templateMeal.mealNumber } });
    if (!meal) {
      meal = await tx.meal.create({
        data: {
          dailyLogId: log.id,
          userId,
          mealNumber: templateMeal.mealNumber,
          name: templateMeal.name,
          plannedTime: templateMeal.plannedTime,
          status: MealStatus.PLANNED
        }
      });
    }

    await tx.mealItem.deleteMany({ where: { mealId: meal.id, type: MealItemType.PLANNED } });
    if (lines.length) {
      await tx.mealItem.createMany({
        data: lines.map((line) => ({
          mealId: meal!.id,
          foodId: line.foodId,
          type: MealItemType.PLANNED,
          nameSnapshot: line.name,
          quantity: line.quantity,
          unit: line.unit,
          calories: line.calories,
          protein: line.protein,
          carbs: line.carbs,
          fat: line.fat
        }))
      });
    }

    await tx.meal.update({
      where: { id: meal.id },
      data: { cardSelections: { setId: cardSet.id, picks: selections } }
    });
    await recalculateMealTotals(meal.id, tx);
    await recalculateDailyLogTotals(log.id, tx);
  });

  return getDinnerCardsForDate(userId, date);
}
