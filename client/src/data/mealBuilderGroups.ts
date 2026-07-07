export type FoodGroup = 'Protein' | 'Fruits' | 'Veggies' | 'Fats' | 'Carbs';

export const FOOD_GROUPS: FoodGroup[] = ['Protein', 'Fruits', 'Veggies', 'Fats', 'Carbs'];

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
