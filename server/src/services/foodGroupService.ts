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

export function resolveFoodGroup(food: Pick<Food, 'role' | 'protein' | 'carbs' | 'fat'>): FoodGroup {
  if (food.role && ROLE_TO_GROUP[food.role]) {
    return ROLE_TO_GROUP[food.role]!;
  }

  const proteinKcal = n(food.protein) * 4;
  const carbsKcal = n(food.carbs) * 4;
  const fatKcal = n(food.fat) * 9;

  if (proteinKcal >= carbsKcal && proteinKcal >= fatKcal) return 'Protein';
  if (fatKcal >= carbsKcal) return 'Fats';
  return 'Carbs';
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
