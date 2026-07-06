import { MealItemType, type Prisma } from '@prisma/client';
import { n, round } from '../utils/numbers.js';
import { scaleFactor, scaleOptionFood, type ScaledFoodLine } from './mealCardScaling.js';
import { recalculateMealTotals } from './totalsService.js';

/**
 * Shared card-meal materialization, dependency-light so both the builder save path
 * (mealCardService) and new-day template application (nutritionTemplateApply) can use
 * it without an import cycle.
 */

export const cardSetInclude = {
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

export type LoadedCardSet = Prisma.MealCardSetGetPayload<{ include: typeof cardSetInclude }>;

export type CardPicks = Record<string, string | string[]>;
export type QuantityOverrides = Record<string, number>;

/** UserMealCardPicks.picks is either flat CardPicks or { picks, quantities? }. */
export function parseStoredPicks(raw: unknown): { picks: CardPicks; quantities?: QuantityOverrides } {
  if (!raw || typeof raw !== 'object') return { picks: {} };
  const record = raw as Record<string, unknown>;
  if (record.picks && typeof record.picks === 'object' && !Array.isArray(record.picks)) {
    return {
      picks: record.picks as CardPicks,
      quantities: record.quantities as QuantityOverrides | undefined
    };
  }
  return { picks: raw as CardPicks };
}

export function serializeStoredPicks(picks: CardPicks, quantities?: QuantityOverrides) {
  if (quantities && Object.keys(quantities).length) return { picks, quantities };
  return picks;
}

export function foodQuantityOverrideKey(optionId: string, foodId: string) {
  return `${optionId}:${foodId}`;
}

export function pickedOptionIds(picks: CardPicks, cardId: string): string[] {
  const raw = picks[cardId];
  return raw == null ? [] : Array.isArray(raw) ? raw : [raw];
}

/** The set's authored defaults — what a no-picks user gets (the menu's "house meal"). */
export function defaultPicksForSet(cardSet: LoadedCardSet): CardPicks {
  const picks: CardPicks = {};
  for (const card of cardSet.cards) {
    const def = card.options.find((option) => option.isDefault) ?? (card.required ? card.options[0] : undefined);
    if (!def) continue;
    picks[card.id] = card.maxSelect > 1 ? [def.id] : def.id;
  }
  return picks;
}

/** Scale the picked options' foods to the meal's calorie target. Unknown ids are skipped. */
export function scaledLinesForPicks(cardSet: LoadedCardSet, targetCalories: number, picks: CardPicks): ScaledFoodLine[] {
  const factor = scaleFactor(targetCalories, cardSet.referenceCalories);
  const lines: ScaledFoodLine[] = [];
  for (const card of cardSet.cards) {
    for (const optionId of pickedOptionIds(picks, card.id)) {
      const option = card.options.find((o) => o.id === optionId);
      if (!option) continue;
      for (const line of option.foods) {
        lines.push({
          ...scaleOptionFood({ ...line, food: line.food, isFree: line.food.isFreeFood || !line.scalable }, factor),
          optionId
        });
      }
    }
  }
  return lines;
}

/** Scale line macros when the user edits a food quantity in the builder. */
export function applyQuantityOverrides(lines: ScaledFoodLine[], overrides: QuantityOverrides): ScaledFoodLine[] {
  if (!Object.keys(overrides).length) return lines;
  return lines.map((line) => {
    const keyed = line.optionId ? foodQuantityOverrideKey(line.optionId, line.foodId) : line.foodId;
    const override = overrides[keyed] ?? overrides[line.foodId];
    if (override == null || override <= 0 || line.quantity <= 0) return line;
    const factor = override / line.quantity;
    return {
      ...line,
      quantity: round(override, 2),
      servings: round(line.servings * factor, 2),
      calories: round(line.calories * factor, 2),
      protein: round(line.protein * factor, 2),
      carbs: round(line.carbs * factor, 2),
      fat: round(line.fat * factor, 2)
    };
  });
}

export function cardMealTarget(templateMeal: { calorieTarget: unknown | null }, cardSet: { referenceCalories: unknown }) {
  return templateMeal.calorieTarget != null ? n(templateMeal.calorieTarget) : n(cardSet.referenceCalories);
}

/**
 * Replace a meal's PLANNED items with the picks' scaled lines and stamp provenance.
 * ACTUAL (logged) items are never touched.
 */
export async function materializeCardMeal(
  tx: Prisma.TransactionClient,
  mealId: string,
  setId: string,
  picks: CardPicks,
  lines: ScaledFoodLine[],
  quantities?: QuantityOverrides
) {
  await tx.mealItem.deleteMany({ where: { mealId, type: MealItemType.PLANNED } });
  if (lines.length) {
    await tx.mealItem.createMany({
      data: lines.map((line) => ({
        mealId,
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
    where: { id: mealId },
    data: { cardSelections: { setId, picks, ...(quantities && Object.keys(quantities).length ? { quantities } : {}) } }
  });
  await recalculateMealTotals(mealId, tx);
}
