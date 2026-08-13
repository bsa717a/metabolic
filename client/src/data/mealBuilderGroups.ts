export type FoodGroup = 'Protein' | 'Fruits' | 'Veggies' | 'Fats' | 'Carbs';

export const FOOD_GROUPS: FoodGroup[] = ['Protein', 'Fruits', 'Veggies', 'Fats', 'Carbs'];

// Maps builder food groups onto the roles that `foodEmoji` uses as its icon fallback.
export const GROUP_EMOJI_ROLE: Record<FoodGroup, string> = {
  Protein: 'PROTEIN',
  Fruits: 'FRUIT',
  Veggies: 'VEGETABLE',
  Fats: 'FAT',
  Carbs: 'CARB'
};

export const GROUP_COLORS: Record<FoodGroup, { bg: string; text: string; border: string; chip: string }> = {
  Protein: { bg: '#fde8ec', text: '#b4233a', border: '#f5a3b5', chip: '#e74c5e' },
  Fruits: { bg: '#fff4e5', text: '#9a5b00', border: '#f5c77a', chip: '#f59e0b' },
  Veggies: { bg: '#e8f7ee', text: '#1a6b3c', border: '#8fd4a8', chip: '#22c55e' },
  Fats: { bg: '#fef9e5', text: '#7a5c00', border: '#f0d56a', chip: '#ca8a04' },
  Carbs: { bg: '#e8f0fd', text: '#1e4a8a', border: '#93b8f5', chip: '#3b82f6' }
};

export const DAILY_GOALS = {
  calories: 2050,
  protein: 205,
  carbs: 200,
  fat: 60
} as const;

export type BuilderFood = {
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

export type FoodsByGroup = Record<FoodGroup, BuilderFood[]>;

export type AddedFoodEntry = {
  instanceId: string;
  foodId: string;
  name: string;
  servingUnit: string;
  quantity: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type MacroTotals = { calories: number; protein: number; carbs: number; fat: number };

export function emptyFoodsByGroup(): Record<FoodGroup, AddedFoodEntry[]> {
  return { Protein: [], Fruits: [], Veggies: [], Fats: [], Carbs: [] };
}

export function sortGroups(groups: FoodGroup[]): FoodGroup[] {
  return FOOD_GROUPS.filter((group) => groups.includes(group));
}

export function sumMacros(entries: AddedFoodEntry[]): MacroTotals {
  return entries.reduce(
    (sum, item) => ({
      calories: sum.calories + item.calories,
      protein: sum.protein + item.protein,
      carbs: sum.carbs + item.carbs,
      fat: sum.fat + item.fat
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

export function mealTotals(foods: Record<FoodGroup, AddedFoodEntry[]>): MacroTotals {
  return FOOD_GROUPS.reduce(
    (sum, group) => {
      const groupTotals = sumMacros(foods[group]);
      return {
        calories: sum.calories + groupTotals.calories,
        protein: sum.protein + groupTotals.protein,
        carbs: sum.carbs + groupTotals.carbs,
        fat: sum.fat + groupTotals.fat
      };
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

export function emptyFoodsByGroupCatalog(): FoodsByGroup {
  return {
    Protein: [],
    Fruits: [],
    Veggies: [],
    Fats: [],
    Carbs: []
  };
}

/** Client-side mirror of server `resolveFoodGroup` when a food has no role. */
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

export function resolveFoodGroupFromMacros(item: { protein: number; carbs: number; fat: number }): FoodGroup {
  const proteinKcal = item.protein * 4;
  const carbsKcal = item.carbs * 4;
  const fatKcal = item.fat * 9;
  if (proteinKcal >= carbsKcal && proteinKcal >= fatKcal) return 'Protein';
  if (fatKcal >= carbsKcal) return 'Fats';
  return 'Carbs';
}

export function buildFoodGroupLookup(catalog: FoodsByGroup): Map<string, FoodGroup> {
  const lookup = new Map<string, FoodGroup>();
  for (const group of FOOD_GROUPS) {
    for (const food of catalog[group]) {
      lookup.set(food.id, group);
    }
  }
  return lookup;
}

export type DayPlanMealInput = {
  mealNumber: number;
  name: string;
  plannedCalories: number;
  items: Array<{
    id: string;
    type: 'PLANNED' | 'ACTUAL';
    foodId?: string | null;
    nameSnapshot: string;
    quantity: number;
    unit: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  }>;
};

/** Hydrate Day Builder meals from an existing day's meals. Returns null when the day has no meals. */
export function mealsFromDayPlan(
  dayMeals: DayPlanMealInput[],
  catalog: FoodsByGroup,
  dailyCalorieGoal = DAILY_GOALS.calories
) {
  if (!dayMeals.length) return null;

  const catalogByFoodId = buildFoodGroupLookup(catalog);
  const totalDayCalories =
    dayMeals.reduce((sum, meal) => sum + Number(meal.plannedCalories), 0) || dailyCalorieGoal;

  return dayMeals.map((meal) => {
    const foods = emptyFoodsByGroup();
    const activeGroups = new Set<FoodGroup>();

    for (const item of meal.items.filter((entry) => entry.type === 'PLANNED')) {
      const catalogGroup = item.foodId ? catalogByFoodId.get(item.foodId) : undefined;
      const group =
        catalogGroup ??
        resolveFoodGroupFromName(item.nameSnapshot) ??
        resolveFoodGroupFromMacros({
          protein: Number(item.protein),
          carbs: Number(item.carbs),
          fat: Number(item.fat)
        });
      activeGroups.add(group);
      foods[group].push({
        instanceId: item.id,
        foodId: item.foodId ?? '',
        name: item.nameSnapshot,
        servingUnit: item.unit,
        quantity: Number(item.quantity) || 1,
        calories: Number(item.calories),
        protein: Number(item.protein),
        carbs: Number(item.carbs),
        fat: Number(item.fat)
      });
    }

    const rawPercent =
      totalDayCalories > 0 ? Math.round((Number(meal.plannedCalories) / totalDayCalories) * 100) : Math.round(100 / dayMeals.length);

    return {
      id: crypto.randomUUID(),
      mealNumber: meal.mealNumber,
      name: meal.name,
      percentOfDay: rawPercent > 0 ? rawPercent : Math.max(1, Math.round(100 / dayMeals.length)),
      groups: activeGroups.size > 0 ? sortGroups([...activeGroups]) : [...FOOD_GROUPS],
      foods,
      editing: false
    };
  });
}
