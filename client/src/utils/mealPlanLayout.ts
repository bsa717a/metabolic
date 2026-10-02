export const MEAL_PLAN_LAYOUTS = ['vertical', 'horizontal'] as const;
export type MealPlanLayout = (typeof MEAL_PLAN_LAYOUTS)[number];

export const MEAL_PLAN_LAYOUT_STORAGE_KEY = 'metabolic.mealPlanLayout';

export function parseMealPlanLayout(value: string | null | undefined): MealPlanLayout {
  return value === 'horizontal' ? 'horizontal' : 'vertical';
}

export function readStoredMealPlanLayout(): MealPlanLayout {
  try {
    return parseMealPlanLayout(window.localStorage.getItem(MEAL_PLAN_LAYOUT_STORAGE_KEY));
  } catch {
    return 'vertical';
  }
}

export function writeStoredMealPlanLayout(layout: MealPlanLayout) {
  try {
    window.localStorage.setItem(MEAL_PLAN_LAYOUT_STORAGE_KEY, layout);
  } catch {
    // Private mode or a full store should not block the in-memory choice.
  }
}
