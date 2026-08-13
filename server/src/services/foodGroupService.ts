import type { Food, MealCardRole } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { n } from '../utils/numbers.js';

export type FoodGroup = 'Protein' | 'Fruits' | 'Veggies' | 'Fats' | 'Carbs';

export const FOOD_GROUPS: FoodGroup[] = ['Protein', 'Fruits', 'Veggies', 'Fats', 'Carbs'];

export type GroupedFood = {
  id: string;
  name: string;
  servingSize: number;
  servingUnit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  brand?: string | null;
  group: FoodGroup;
};

export type FoodsByGroup = Record<FoodGroup, GroupedFood[]>;

const ROLE_TO_GROUP: Partial<Record<MealCardRole, FoodGroup>> = {
  PROTEIN: 'Protein',
  FRUIT: 'Fruits',
  VEGETABLE: 'Veggies',
  FAT: 'Fats',
  CARB: 'Carbs'
};

function visibilityFilter(userId: string) {
  return { OR: [{ visibility: 'GLOBAL' as const }, { ownerUserId: userId }] };
}

/** Catalog prefixes and whole-food proteins whose fat calories would otherwise win. */
export function resolveFoodGroupFromName(name: string): FoodGroup | null {
  const n = name.trim();
  if (/^(fruit|berries)\b/i.test(n)) return 'Fruits';
  if (/^(vegetable|squash)\b/i.test(n)) return 'Veggies';

  if (/^(fish|seafood)\b/i.test(n)) return 'Protein';
  if (/\b(salmon|tuna|tilapia|shrimp|scallop|cod|halibut|trout)\b/i.test(n)) return 'Protein';
  if (/\beggs?\b/i.test(n) && !/noodle|plant/i.test(n)) return 'Protein';
  if (/\b(tofu|tempeh|tempah)\b/i.test(n)) return 'Protein';
  if (/\b(ground beef|chuck roast|hamburger|hot dog)\b/i.test(n)) return 'Protein';
  if (/^(ham|pork bacon|pork sausage)\b/i.test(n)) return 'Protein';
  if (/\b(turkey sausage|pork sausage|sausage link)\b/i.test(n)) return 'Protein';
  if (/^roasted chicken\b/i.test(n)) return 'Protein';
  if (/\bvegan protein\b/i.test(n)) return 'Protein';
  if (/\bprotein (bar|powder)\b/i.test(n)) return 'Protein';
  if (/^bar-/i.test(n)) return 'Protein';
  if (/\bcottage cheese\b/i.test(n)) return 'Protein';
  if (/\b(string cheese|babybel)\b/i.test(n)) return 'Protein';
  if (/\byogurt\b/i.test(n) && !/coconut|sauce/i.test(n)) return 'Protein';
  return null;
}

export function resolveFoodGroupFromMacros(food: { protein: unknown; carbs: unknown; fat: unknown }): FoodGroup {
  const proteinKcal = n(food.protein) * 4;
  const carbsKcal = n(food.carbs) * 4;
  const fatKcal = n(food.fat) * 9;

  if (proteinKcal >= carbsKcal && proteinKcal >= fatKcal) return 'Protein';
  if (fatKcal >= carbsKcal) return 'Fats';
  return 'Carbs';
}

export function resolveFoodGroup(
  food: Pick<Food, 'role' | 'protein' | 'carbs' | 'fat'> & { name?: string | null }
): FoodGroup {
  if (food.role && ROLE_TO_GROUP[food.role]) {
    return ROLE_TO_GROUP[food.role]!;
  }
  const fromName = food.name ? resolveFoodGroupFromName(food.name) : null;
  if (fromName) return fromName;
  return resolveFoodGroupFromMacros(food);
}

function serializeFood(food: Food, group: FoodGroup): GroupedFood {
  return {
    id: food.id,
    name: food.name,
    servingSize: n(food.servingSize),
    servingUnit: food.servingUnit,
    calories: n(food.calories),
    protein: n(food.protein),
    carbs: n(food.carbs),
    fat: n(food.fat),
    brand: food.brand,
    group
  };
}

function emptyGroups(): FoodsByGroup {
  return {
    Protein: [],
    Fruits: [],
    Veggies: [],
    Fats: [],
    Carbs: []
  };
}

export async function getFoodsByGroup(userId: string): Promise<FoodsByGroup> {
  const foods = await prisma.food.findMany({
    where: {
      AND: [
        visibilityFilter(userId),
        { NOT: { aiGenerated: true, verified: false } }
      ]
    },
    orderBy: { name: 'asc' }
  });

  const grouped = emptyGroups();
  for (const food of foods) {
    const group = resolveFoodGroup(food);
    grouped[group].push(serializeFood(food, group));
  }

  return grouped;
}
