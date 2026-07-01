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
 * Resolve every card-set-backed meal for a user's date: active program → plan for the
 * date (PlanPeriod carry-forward) → template → its meals with a mealCardSetId.
 */
async function resolveCardMealsForDate(userId: string, date: string) {
  const program = await prisma.program.findFirst({
    where: { userId, status: ProgramStatus.ACTIVE },
    select: { id: true, defaultNutritionTemplateId: true, defaultExerciseTemplateId: true }
  });
  if (!program) throw new MealCardError('No active program found', 404);

  const plan = await resolvePlanForDate(program, parseDateParam(date));
  if (!plan.nutritionTemplateId) throw new MealCardError('No nutrition plan for this date', 404);

  const templateMeals = await prisma.nutritionTemplateMeal.findMany({
    where: { templateId: plan.nutritionTemplateId, mealCardSetId: { not: null } },
    orderBy: { mealNumber: 'asc' },
    include: { mealCardSet: { include: cardSetInclude } }
  });

  return templateMeals
    .filter((meal) => meal.mealCardSet != null)
    .map((templateMeal) => ({
      templateMeal,
      cardSet: templateMeal.mealCardSet!,
      // The scale numerator: the meal's stored target, else scale 1:1 against the reference.
      targetCalories: templateMeal.calorieTarget != null
        ? n(templateMeal.calorieTarget)
        : n(templateMeal.mealCardSet!.referenceCalories)
    }));
}

async function resolveCardMealForDate(userId: string, date: string, mealNumber: number) {
  const cardMeals = await resolveCardMealsForDate(userId, date);
  const match = cardMeals.find((entry) => entry.templateMeal.mealNumber === mealNumber);
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

  return cardMeals.map(({ templateMeal, cardSet, targetCalories }) => {
    const meal = dayMeals.find((m) => m.mealNumber === templateMeal.mealNumber);
    return {
      setId: cardSet.id,
      setName: cardSet.name,
      slotType: cardSet.slotType,
      mealNumber: templateMeal.mealNumber,
      mealName: meal?.name ?? templateMeal.name,
      targetCalories: round(targetCalories, 0),
      referenceCalories: n(cardSet.referenceCalories),
      cards: scaledOptionPayload(cardSet, targetCalories),
      savedSelections: (meal?.cardSelections as { setId: string; picks: Record<string, string | string[]> } | null) ?? null
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
 * Persist the builder's picks for one meal of the date: write provenance to
 * Meal.cardSelections and materialize the scaled portions into PLANNED MealItems
 * (macros frozen in — logs stay historically accurate). ACTUAL items are never touched.
 */
export async function saveMealSelections(userId: string, date: string, mealNumber: number, selections: MealSelections) {
  const { templateMeal, cardSet, targetCalories } = await resolveCardMealForDate(userId, date, mealNumber);
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

  const payloads = await getMealCardsForDate(userId, date);
  return payloads.find((p) => p.mealNumber === mealNumber) ?? payloads[0];
}
