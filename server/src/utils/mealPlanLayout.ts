export const MEAL_PLAN_LAYOUTS = ['vertical', 'horizontal'] as const;
export type MealPlanLayoutSlug = (typeof MEAL_PLAN_LAYOUTS)[number];

export function mealPlanLayoutToSlug(value: string | null | undefined): MealPlanLayoutSlug {
  return value === 'HORIZONTAL' || value === 'horizontal' ? 'horizontal' : 'vertical';
}

export function mealPlanLayoutToPrisma(value: string | null | undefined): 'VERTICAL' | 'HORIZONTAL' {
  return mealPlanLayoutToSlug(value) === 'horizontal' ? 'HORIZONTAL' : 'VERTICAL';
}
