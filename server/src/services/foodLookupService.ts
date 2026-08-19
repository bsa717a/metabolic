import { FoodSource, Visibility, MealItemType, type Role } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { isAdmin } from '../auth/requireRole.js';
import { getAiProvider, type FoodEstimate } from './aiService.js';
import { addMealItem } from './nutritionService.js';
import { n } from '../utils/numbers.js';

export type FoodLookupItem =
  | { source: 'existing'; line: string; food: Awaited<ReturnType<typeof findExistingFood>> & object }
  // `accurate` = from a curated source (the local Food table, seeded by us); false = an LLM estimate (flag as rough).
  | { source: 'ai'; line: string; lookup: { id: string }; estimate: FoodEstimate; accurate: boolean };

export type FoodLookupResult = {
  source: 'existing' | 'ai' | 'mixed';
  items: FoodLookupItem[];
};

function splitFoodLines(input: string) {
  return input
    .split(/\n|,|;|•/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 2);
}

async function findExistingFood(userId: string, query: string) {
  return prisma.food.findFirst({
    where: {
      OR: [
        { name: { contains: query, mode: 'insensitive' } },
        { aliases: { some: { alias: { contains: query, mode: 'insensitive' } } } }
      ],
      AND: [{ OR: [{ visibility: 'GLOBAL' }, { ownerUserId: userId }] }]
    }
  });
}

export async function lookupFood(userId: string, inputText: string): Promise<FoodLookupResult> {
  const lines = splitFoodLines(inputText);
  const items: FoodLookupItem[] = [];
  const needsAi: string[] = [];

  for (const line of lines.length ? lines : [inputText.trim()]) {
    // 1. Local Food table (curated — seeded by us / learned from corrections): trusted, exact, free.
    const food = await findExistingFood(userId, line);
    if (food) {
      items.push({ source: 'existing', line, food });
      continue;
    }

    // 2. LLM fallback — a rough estimate, flagged as such for the user.
    needsAi.push(line);
  }

  if (needsAi.length > 0) {
    const estimates = await getAiProvider().lookupFood(needsAi.join('\n'));
    // Iterate over the estimates, not the input lines: a single line can list several distinct
    // foods (e.g. "three eggs and a half tbsp olive oil"), which the model returns as separate
    // items. When the counts line up we keep the original line text; otherwise we fall back to
    // the estimate's own name so no food is ever silently dropped.
    const aligned = estimates.length === needsAi.length;
    for (let index = 0; index < estimates.length; index++) {
      const estimate = estimates[index]!;
      const line = aligned ? needsAi[index]! : estimate.normalizedFoodName;
      const lookup = await prisma.aiFoodLookup.create({ data: { userId, inputText: line, ...estimate } });
      items.push({ source: 'ai', line, lookup, estimate, accurate: false });
    }
  }

  const hasExisting = items.some((item) => item.source === 'existing');
  const hasAi = items.some((item) => item.source === 'ai');
  const source = hasExisting && hasAi ? 'mixed' : hasExisting ? 'existing' : 'ai';

  return { source, items };
}

/** True when any logged item is an LLM estimate rather than a curated database value. */
export function lookupHasRoughEstimate(result: FoodLookupResult) {
  return result.items.some((item) => item.source === 'ai' && item.accurate === false);
}

export async function lookupFoodFromImage(
  userId: string,
  image: { data: string; mimeType: string },
  inputText = ''
): Promise<FoodLookupResult> {
  const estimates = await getAiProvider().lookupFoodFromImage(image, inputText);
  const items: FoodLookupItem[] = [];

  for (const estimate of estimates) {
    const lookup = await prisma.aiFoodLookup.create({
      data: {
        userId,
        inputText: inputText.trim() || 'uploaded meal photo',
        ...estimate
      }
    });
    items.push({ source: 'ai', line: estimate.normalizedFoodName, lookup, estimate, accurate: false });
  }

  return { source: 'ai', items };
}

export function summarizeFoodLookup(result: FoodLookupResult) {
  const names: string[] = [];
  let calories = 0;
  let protein = 0;

  for (const item of result.items) {
    if (item.source === 'ai') {
      names.push(item.estimate.normalizedFoodName);
      calories += item.estimate.calories;
      protein += item.estimate.protein;
    } else {
      names.push(item.food.name);
      calories += n(item.food.calories);
      protein += n(item.food.protein);
    }
  }

  return { count: names.length, names, calories, protein };
}

export async function acceptFoodLookup(
  userId: string,
  lookupId: string,
  mealId?: string,
  type: MealItemType = MealItemType.ACTUAL,
  actor?: { id: string; role: Role }
) {
  const promoteToGlobal = actor ? isAdmin(actor) : false;

  const food = await prisma.$transaction(async (tx) => {
    const lookup = await tx.aiFoodLookup.findFirstOrThrow({ where: { id: lookupId, userId } });
    if (lookup.accepted && lookup.foodId) {
      const existing = await tx.food.findUniqueOrThrow({ where: { id: lookup.foodId } });
      if (promoteToGlobal && existing.visibility !== Visibility.GLOBAL) {
        return tx.food.update({
          where: { id: existing.id },
          data: { visibility: Visibility.GLOBAL, verified: true, ownerUserId: null }
        });
      }
      return existing;
    }
    const created = await tx.food.create({
      data: {
        name: lookup.normalizedFoodName,
        servingSize: 1,
        servingUnit: 'serving',
        calories: lookup.calories,
        protein: lookup.protein,
        carbs: lookup.carbs,
        fat: lookup.fat,
        source: FoodSource.AI,
        visibility: promoteToGlobal ? Visibility.GLOBAL : Visibility.USER,
        ownerUserId: promoteToGlobal ? null : userId,
        createdById: userId,
        aiGenerated: true,
        verified: promoteToGlobal
      }
    });
    await tx.aiFoodLookup.update({ where: { id: lookupId }, data: { accepted: true, foodId: created.id } });
    return created;
  });

  if (mealId) {
    await addMealItem(userId, mealId, {
      foodId: food.id,
      type,
      nameSnapshot: food.name,
      quantity: 1,
      unit: food.servingUnit,
      calories: n(food.calories),
      protein: n(food.protein),
      carbs: n(food.carbs),
      fat: n(food.fat)
    });
  }

  return food;
}

export async function acceptFoodLookups(
  userId: string,
  lookupIds: string[],
  mealId?: string,
  type: MealItemType = MealItemType.ACTUAL,
  actor?: { id: string; role: Role }
) {
  const foods = [];
  for (const lookupId of lookupIds) {
    foods.push(await acceptFoodLookup(userId, lookupId, mealId, type, actor));
  }
  return foods;
}
