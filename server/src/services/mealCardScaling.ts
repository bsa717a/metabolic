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
  imageUrl?: string | null;
};

export type ScaledFoodLine = {
  foodId: string;
  optionId?: string;
  name: string;
  imageUrl: string | null;
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
  discrete?: boolean;
  unitStep?: number;
  minServings?: number | null;
  maxServings?: number | null;
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
    imageUrl: food.imageUrl ?? null,
    servings,
    quantity: round(servings * n(food.servingSize), 2),
    unit: food.servingUnit,
    calories: round(servings * n(food.calories), 2),
    protein: round(servings * n(food.protein), 2),
    carbs: round(servings * n(food.carbs), 2),
    fat: round(servings * n(food.fat), 2),
    free: optionFood.isFree ?? !optionFood.scalable,
    rounded,
    discrete: optionFood.discrete,
    unitStep: n(optionFood.unitStep) > 0 ? n(optionFood.unitStep) : 1,
    minServings: optionFood.minServings == null ? null : n(optionFood.minServings),
    maxServings: optionFood.maxServings == null ? null : n(optionFood.maxServings)
  };
}

function scaleExistingLine(line: ScaledFoodLine, factor: number): ScaledFoodLine {
  if (line.free || line.servings <= 0 || line.quantity <= 0) return line;
  const servingSize = line.quantity / line.servings;
  const scaled = scaleOptionFood(
    {
      foodId: line.foodId,
      baseServings: line.servings,
      scalable: true,
      discrete: Boolean(line.discrete),
      unitStep: line.unitStep ?? 1,
      minServings: line.minServings,
      maxServings: line.maxServings,
      food: {
        name: line.name,
        servingSize,
        servingUnit: line.unit,
        calories: line.calories / line.servings,
        protein: line.protein / line.servings,
        carbs: line.carbs / line.servings,
        fat: line.fat / line.servings,
        imageUrl: line.imageUrl
      },
      isFree: false
    },
    factor
  );
  return {
    ...line,
    ...scaled,
    optionId: line.optionId,
    discrete: line.discrete,
    unitStep: line.unitStep,
    minServings: line.minServings,
    maxServings: line.maxServings
  };
}

/**
 * Second pass after reference scaling: shrink/grow the *picked* combo so it
 * actually hits the meal calorie target. Discrete items (eggs, toast) snap
 * to whole units; leftover calorie error is absorbed by continuous lines.
 */
export function rebalanceLinesToTarget(lines: ScaledFoodLine[], targetCalories: unknown): ScaledFoodLine[] {
  const target = n(targetCalories);
  if (target <= 0 || !lines.length) return lines;

  const freeCalories = lines.filter((line) => line.free).reduce((sum, line) => sum + line.calories, 0);
  const scalableCalories = lines
    .filter((line) => !line.free && line.calories > 0)
    .reduce((sum, line) => sum + line.calories, 0);
  if (scalableCalories <= 0) return lines;

  const remaining = target - freeCalories;
  const factor = remaining > 0 ? remaining / scalableCalories : 0;
  const first = lines.map((line) => scaleExistingLine(line, factor));

  const actual = sumLines(first).calories;
  const error = target - actual;
  if (Math.abs(error) < 1) return first;

  const continuousCalories = first
    .filter((line) => !line.free && !line.discrete)
    .reduce((sum, line) => sum + line.calories, 0);
  if (continuousCalories <= 0) return first;

  const adjust = (continuousCalories + error) / continuousCalories;
  if (adjust <= 0) return first;
  return first.map((line) => (line.free || line.discrete ? line : scaleExistingLine(line, adjust)));
}

export function sumLines(lines: ScaledFoodLine[]) {
  return {
    calories: round(lines.reduce((s, l) => s + l.calories, 0), 2),
    protein: round(lines.reduce((s, l) => s + l.protein, 0), 2),
    carbs: round(lines.reduce((s, l) => s + l.carbs, 0), 2),
    fat: round(lines.reduce((s, l) => s + l.fat, 0), 2)
  };
}
