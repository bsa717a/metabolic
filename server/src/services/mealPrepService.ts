import { MealItemType, Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import {
  getAiProvider,
  MockAiProvider,
  type EnrichedMealPrepResult,
  type MealPrepBatchInput
} from './aiService.js';
import { parseValidatedDateRange, toDateKey } from '../utils/dates.js';
import { n, round } from '../utils/numbers.js';

export type MealPrepIngredient = {
  name: string;
  totalQuantity: number;
  unit: string;
};

export type MealPrepFreshIngredient = {
  name: string;
  quantityPerServing: number;
  unit: string;
  servingCount: number;
  dates: string[];
};

export type MealPrepBatch = {
  id: string;
  label: string;
  occurrenceCount: number;
  dates: string[];
  cookNow: MealPrepIngredient[];
  addFresh: MealPrepFreshIngredient[];
  container: string;
  reheat: string | null;
  storageNote: string | null;
};

export type MealPrepPlanResult = {
  startDate: string;
  endDate: string;
  plannedDayCount: number;
  batchCount: number;
  containerCount: number;
  intro: string | null;
  enriched: boolean;
  batches: MealPrepBatch[];
  note: string;
};

const BASE_NOTE =
  'Meals are combined into one batch when they share the same card picks or the same meal name. Ingredient amounts are the sum of every planned portion in the batch.';
const ENRICHED_NOTE = ' Container and storage suggestions are AI estimates — adjust to what you have at home.';
const FALLBACK_NOTE = ' Could not reach AI; showing rule-based container suggestions instead.';

/** Ingredients that should be added at serving time rather than batch-cooked days ahead. */
const FRESH_NAME_PATTERN =
  /^(?:(?:fresh|raw)\s+)?(?:[a-z][a-z' -]*\s+dressing|salsa|pico(?: de gallo)?|guacamole|avocado|lettuce|cucumber|fresh herbs?|cilantro|parsley|lemon wedges?|lime wedges?|hot sauce|sour cream|berries|berry|banana|apple slices?|orange slices?|grapes)(?:,\s*(?:sliced|diced|chopped))?$/i;

const FRESH_TEXTURE_TAGS = new Set(['fresh', 'raw', 'crisp']);

export type PlannedMealRow = {
  name: string;
  cardSelections: Prisma.JsonValue;
  dailyLog: { date: Date };
  items: {
    nameSnapshot: string;
    quantity: Prisma.Decimal | number;
    unit: string;
    food: { role: string | null; textureTags: string[]; isFreeFood: boolean } | null;
  }[];
};

function stableCardSelectionsKey(cardSelections: Prisma.JsonValue): string | null {
  if (!cardSelections || typeof cardSelections !== 'object' || Array.isArray(cardSelections)) return null;
  const value = cardSelections as { setId?: unknown; picks?: unknown };
  if (typeof value.setId !== 'string' || !value.picks || typeof value.picks !== 'object') return null;

  const picks = value.picks as Record<string, unknown>;
  const normalized = Object.keys(picks)
    .sort()
    .map((cardId) => {
      const pick = picks[cardId];
      const optionIds = Array.isArray(pick) ? [...pick].sort() : [pick];
      return `${cardId}=${optionIds.join(',')}`;
    })
    .join('|');

  return `card:${value.setId}:${normalized}`;
}

function normalizedNameKey(meal: PlannedMealRow) {
  const name = meal.name.trim().toLowerCase().replace(/\s+/g, ' ');
  // Meal names are often slot names ("Snack", "Lunch") shared by different dishes, so the
  // fallback identity includes WHICH foods are in the meal — but not their quantities, so
  // portion-scaled copies of the same dish still land in one batch.
  const itemSignature = meal.items
    .map((item) => item.nameSnapshot.trim().toLowerCase())
    .sort()
    .join('|');
  return `name:${name}\0${itemSignature}`;
}

function batchKeyForMeal(meal: PlannedMealRow) {
  return stableCardSelectionsKey(meal.cardSelections) ?? normalizedNameKey(meal);
}

function isAddFreshItem(item: PlannedMealRow['items'][number]) {
  if (item.food?.isFreeFood) return true;
  if (item.food?.role === 'FREE' || item.food?.role === 'FRUIT') return true;
  if (item.food?.textureTags.some((tag) => FRESH_TEXTURE_TAGS.has(tag.toLowerCase()))) return true;
  return FRESH_NAME_PATTERN.test(item.nameSnapshot);
}

type IngredientAggregate = {
  name: string;
  unit: string;
  totalQuantity: number;
  itemOccurrences: number;
  dates: Set<string>;
  fresh: boolean;
};

type BatchAggregate = {
  label: string;
  dates: Set<string>;
  occurrenceCount: number;
  ingredients: Map<string, IngredientAggregate>;
};

/** Pure batch construction from planned meal rows — exported for tests. */
export function buildPrepBatches(meals: PlannedMealRow[]) {
  const batches = new Map<string, BatchAggregate>();
  const plannedDates = new Set<string>();

  for (const meal of meals) {
    const dateKey = toDateKey(meal.dailyLog.date);
    plannedDates.add(dateKey);

    const key = batchKeyForMeal(meal);
    const batch = batches.get(key) ?? {
      label: meal.name.trim(),
      dates: new Set<string>(),
      occurrenceCount: 0,
      ingredients: new Map<string, IngredientAggregate>()
    };
    batch.occurrenceCount += 1;
    batch.dates.add(dateKey);

    for (const item of meal.items) {
      const name = item.nameSnapshot.trim();
      const unit = item.unit.trim() || 'serving';
      const ingredientKey = `${name.toLowerCase()}\0${unit.toLowerCase()}`;
      const quantity = n(item.quantity);
      const existing = batch.ingredients.get(ingredientKey);

      if (existing) {
        existing.totalQuantity = round(existing.totalQuantity + quantity, 2);
        existing.itemOccurrences += 1;
        existing.dates.add(dateKey);
        // Fresh wins: if any occurrence resolves to a tagged Food, keep the fresher verdict.
        existing.fresh = existing.fresh || isAddFreshItem(item);
        continue;
      }

      batch.ingredients.set(ingredientKey, {
        name,
        unit,
        totalQuantity: round(quantity, 2),
        itemOccurrences: 1,
        dates: new Set([dateKey]),
        fresh: isAddFreshItem(item)
      });
    }

    batches.set(key, batch);
  }

  const ordered = [...batches.values()]
    .sort(
      (a, b) =>
        b.occurrenceCount - a.occurrenceCount || a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
    )
    .map((batch, index) => {
      const ingredients = [...batch.ingredients.values()].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      );

      return {
        id: String(index),
        label: batch.label,
        occurrenceCount: batch.occurrenceCount,
        dates: [...batch.dates].sort(),
        cookNow: ingredients
          .filter((ingredient) => !ingredient.fresh)
          .map(({ name, totalQuantity, unit }) => ({ name, totalQuantity, unit })),
        addFresh: ingredients
          .filter((ingredient) => ingredient.fresh)
          .map(({ name, totalQuantity, unit, itemOccurrences, dates }) => ({
            name,
            quantityPerServing: round(totalQuantity / itemOccurrences, 2),
            unit,
            servingCount: itemOccurrences,
            dates: [...dates].sort()
          }))
      };
    });

  return { plannedDayCount: plannedDates.size, batches: ordered };
}

async function aggregatePrepBatches(userId: string, startDate: string, endDate: string) {
  const { start, end } = parseValidatedDateRange(startDate, endDate);

  const meals = await prisma.meal.findMany({
    where: {
      userId,
      dailyLog: { date: { gte: start, lte: end } },
      items: { some: { type: MealItemType.PLANNED } }
    },
    select: {
      name: true,
      cardSelections: true,
      dailyLog: { select: { date: true } },
      items: {
        where: { type: MealItemType.PLANNED },
        select: {
          nameSnapshot: true,
          quantity: true,
          unit: true,
          food: { select: { role: true, textureTags: true, isFreeFood: true } }
        }
      }
    }
  });

  const { plannedDayCount, batches } = buildPrepBatches(meals);

  return {
    startDate: toDateKey(start),
    endDate: toDateKey(end),
    plannedDayCount,
    batches
  };
}

export async function getMealPrepPlan(userId: string, startDate: string, endDate: string): Promise<MealPrepPlanResult> {
  const { startDate: resolvedStart, endDate: resolvedEnd, plannedDayCount, batches } = await aggregatePrepBatches(
    userId,
    startDate,
    endDate
  );

  if (!batches.length) {
    return {
      startDate: resolvedStart,
      endDate: resolvedEnd,
      plannedDayCount,
      batchCount: 0,
      containerCount: 0,
      intro: null,
      enriched: false,
      batches: [],
      note: BASE_NOTE
    };
  }

  const enrichInput: MealPrepBatchInput[] = batches.map(({ id, label, occurrenceCount, cookNow, addFresh }) => ({
    id,
    label,
    occurrenceCount,
    cookNow,
    addFresh
  }));

  let enriched: EnrichedMealPrepResult;
  let enrichedFlag = true;
  try {
    enriched = await getAiProvider().enrichMealPrep(enrichInput);
  } catch {
    enriched = await new MockAiProvider().enrichMealPrep(enrichInput);
    enrichedFlag = false;
  }

  const enrichedById = new Map(enriched.batches.map((batch) => [batch.id, batch]));
  const resultBatches: MealPrepBatch[] = batches.map((batch) => {
    const match = enrichedById.get(batch.id);
    return {
      ...batch,
      container: match?.container ?? 'microwave-safe container',
      reheat: match?.reheat ?? null,
      storageNote: match?.storageNote ?? null
    };
  });

  return {
    startDate: resolvedStart,
    endDate: resolvedEnd,
    plannedDayCount,
    batchCount: resultBatches.length,
    containerCount: resultBatches.reduce((sum, batch) => sum + batch.occurrenceCount, 0),
    intro: enriched.intro,
    enriched: enrichedFlag,
    batches: resultBatches,
    note: `${BASE_NOTE}${enrichedFlag ? ENRICHED_NOTE : FALLBACK_NOTE}`
  };
}
