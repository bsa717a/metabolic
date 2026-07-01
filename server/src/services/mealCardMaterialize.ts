import { MealItemType, type Prisma } from '@prisma/client';
import { n } from '../utils/numbers.js';
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

export function pickedOptionIds(picks: CardPicks, cardId: string): string[] {
  const raw = picks[cardId];
  return raw == null ? [] : Array.isArray(raw) ? raw : [raw];
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
        lines.push(scaleOptionFood({ ...line, food: line.food, isFree: line.food.isFreeFood || !line.scalable }, factor));
      }
    }
  }
  return lines;
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
  lines: ScaledFoodLine[]
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
  await tx.meal.update({ where: { id: mealId }, data: { cardSelections: { setId, picks } } });
  await recalculateMealTotals(mealId, tx);
}
