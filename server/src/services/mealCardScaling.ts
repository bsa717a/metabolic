import { n, round } from '../utils/numbers.js';

/**
 * Portion scaling for meal-card sets. Pure functions — no DB access — so the
 * serve-time endpoint and the save-time materializer share one implementation
 * and the math is unit-testable against the plan doc's worked example.
 *
 * factor = user's meal calorie target / card set's reference calories.
 * Per line: servings = scalable ? baseServings × factor : baseServings,
 * then discrete rounding to unitStep and min/max clamping.
 */

export type ScalableLine = {
  baseServings: unknown;
  scalable: boolean;
  discrete: boolean;
  unitStep: unknown;
  minServings?: unknown | null;
  maxServings?: unknown | null;
};

export type FoodMacros = {
  name: string;
  servingSize: unknown;
  servingUnit: string;
  calories: unknown;
  protein: unknown;
  carbs: unknown;
  fat: unknown;
};

export type ScaledFoodLine = {
  foodId: string;
  name: string;
  /** servings of the Food's servingSize (the scaling unit) */
  servings: number;
  /** quantity in the Food's servingUnit = servings × servingSize (what MealItem stores) */
  quantity: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  free: boolean;
  rounded: boolean;
};

export function scaleFactor(targetCalories: unknown, referenceCalories: unknown): number {
  const target = n(targetCalories);
  const reference = n(referenceCalories);
  if (target <= 0 || reference <= 0) return 1;
  return target / reference;
}

export function resolveServings(line: ScalableLine, factor: number): { servings: number; rounded: boolean } {
  const base = n(line.baseServings);
  if (!line.scalable) return { servings: base, rounded: false };

  let servings = base * factor;
  let rounded = false;

  if (line.discrete) {
    const step = n(line.unitStep) > 0 ? n(line.unitStep) : 1;
    const snapped = Math.max(step, Math.round(servings / step) * step);
    rounded = Math.abs(snapped - servings) > 1e-9;
    servings = snapped;
  }

  const min = line.minServings == null ? null : n(line.minServings);
  const max = line.maxServings == null ? null : n(line.maxServings);
  if (min != null && servings < min) servings = min;
  if (max != null && servings > max) servings = max;

  return { servings: round(servings, 2), rounded };
}

export function scaleOptionFood(
  optionFood: ScalableLine & { foodId: string; food: FoodMacros; isFree?: boolean },
  factor: number
): ScaledFoodLine {
  const { servings, rounded } = resolveServings(optionFood, factor);
  const food = optionFood.food;
  return {
    foodId: optionFood.foodId,
    name: food.name,
    servings,
    quantity: round(servings * n(food.servingSize), 2),
    unit: food.servingUnit,
    calories: round(servings * n(food.calories), 2),
    protein: round(servings * n(food.protein), 2),
    carbs: round(servings * n(food.carbs), 2),
    fat: round(servings * n(food.fat), 2),
    free: optionFood.isFree ?? !optionFood.scalable,
    rounded
  };
}

export function sumLines(lines: ScaledFoodLine[]) {
  return {
    calories: round(lines.reduce((s, l) => s + l.calories, 0), 2),
    protein: round(lines.reduce((s, l) => s + l.protein, 0), 2),
    carbs: round(lines.reduce((s, l) => s + l.carbs, 0), 2),
    fat: round(lines.reduce((s, l) => s + l.fat, 0), 2)
  };
}
