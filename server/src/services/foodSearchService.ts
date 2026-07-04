import { prisma } from '../db/prisma.js';
import { getAiProvider, type FoodEstimate } from './aiService.js';
import { acceptFoodLookup } from './foodLookupService.js';

function foodNameFilter(query: string) {
  return {
    OR: [
      { name: { contains: query, mode: 'insensitive' as const } },
      { brand: { contains: query, mode: 'insensitive' as const } },
      { aliases: { some: { alias: { contains: query, mode: 'insensitive' as const } } } }
    ]
  };
}

function visibilityFilter(userId: string) {
  return { OR: [{ visibility: 'GLOBAL' as const }, { ownerUserId: userId }] };
}

export type PendingFoodLookup = {
  lookupId: string;
  name: string;
  servingSize: number;
  servingUnit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type FoodSearchResult = {
  local: Awaited<ReturnType<typeof prisma.food.findMany>>;
  queue: Awaited<ReturnType<typeof prisma.food.findMany>>;
  pending: PendingFoodLookup[];
};

export async function searchFoods(userId: string, query: string): Promise<FoodSearchResult> {
  const q = query.trim();
  if (q.length < 2) return { local: [], queue: [], pending: [] };

  const [local, queue, pendingRows] = await Promise.all([
    prisma.food.findMany({
      where: {
        AND: [
          foodNameFilter(q),
          visibilityFilter(userId),
          { NOT: { aiGenerated: true, verified: false } }
        ]
      },
      take: 25,
      orderBy: { name: 'asc' }
    }),
    prisma.food.findMany({
      where: {
        AND: [foodNameFilter(q), visibilityFilter(userId), { aiGenerated: true, verified: false }]
      },
      take: 10,
      orderBy: { createdAt: 'desc' }
    }),
    prisma.aiFoodLookup.findMany({
      where: {
        userId,
        accepted: false,
        foodId: null,
        OR: [
          { normalizedFoodName: { contains: q, mode: 'insensitive' } },
          { inputText: { contains: q, mode: 'insensitive' } }
        ]
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    })
  ]);

  const pending = pendingRows.map((row) => ({
    lookupId: row.id,
    name: row.normalizedFoodName,
    servingSize: 1,
    servingUnit: 'serving',
    calories: Number(row.calories),
    protein: Number(row.protein),
    carbs: Number(row.carbs),
    fat: Number(row.fat)
  }));

  return { local, queue, pending };
}

export type FoodLookupOption = {
  lookupId: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: number;
};

function normalizeForMatch(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function isExactFoodMatch(query: string, estimate: FoodEstimate) {
  const q = normalizeForMatch(query);
  const name = normalizeForMatch(estimate.normalizedFoodName);
  if (!q || !name) return false;
  return name === q || name.startsWith(`${q} `) || name.includes(` ${q} `);
}

export async function lookupFoodOptions(userId: string, query: string) {
  const q = query.trim();
  if (q.length < 2) throw new Error('Enter at least 2 characters to search.');

  const estimates = await getAiProvider().lookupFoodOptions(q);
  const picked =
    estimates.length === 1 && isExactFoodMatch(q, estimates[0]!)
      ? estimates.slice(0, 1)
      : estimates.slice(0, 3);

  const options: FoodLookupOption[] = [];
  for (const estimate of picked) {
    const lookup = await prisma.aiFoodLookup.create({
      data: {
        userId,
        inputText: q,
        normalizedFoodName: estimate.normalizedFoodName,
        calories: estimate.calories,
        protein: estimate.protein,
        carbs: estimate.carbs,
        fat: estimate.fat,
        confidence: estimate.confidence
      }
    });
    options.push({
      lookupId: lookup.id,
      name: estimate.normalizedFoodName,
      calories: estimate.calories,
      protein: estimate.protein,
      carbs: estimate.carbs,
      fat: estimate.fat,
      confidence: estimate.confidence
    });
  }

  return { query: q, options };
}

export async function acceptFoodLookupAsFood(userId: string, lookupId: string) {
  return acceptFoodLookup(userId, lookupId);
}
