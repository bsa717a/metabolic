import { api } from '../../../services/api';
import type { Food, Meal, MealItem } from '../../../types';

export type DayMeals = { date: string; meals: Meal[] };
export type BadgeTone = 'slate' | 'green' | 'blue' | 'yellow' | 'red';

export type GridRow = {
  mealNumber: number;
  label: string;
  plannedTime?: string | null;
};

export function plannedItemsOf(meal: Meal): MealItem[] {
  return (meal.items ?? []).filter((item) => item.type === 'PLANNED');
}

export function actualItemsOf(meal: Meal): MealItem[] {
  return (meal.items ?? []).filter((item) => item.type === 'ACTUAL');
}

export function extraActualItemsOf(meal: Meal): MealItem[] {
  return actualItemsOf(meal).filter((item) => !item.linkedPlannedItemId);
}

export function isPlannedItemLogged(plannedItem: MealItem, actualItems: MealItem[]): boolean {
  return actualItems.some(
    (item) =>
      item.linkedPlannedItemId === plannedItem.id ||
      (!item.linkedPlannedItemId &&
        item.nameSnapshot === plannedItem.nameSnapshot &&
        Number(item.quantity) === Number(plannedItem.quantity) &&
        (item.foodId ?? null) === (plannedItem.foodId ?? null))
  );
}

export const STATUS_LABEL: Record<string, string> = {
  PLANNED: 'Planned',
  UPCOMING: 'Upcoming',
  EATEN_AS_PLANNED: 'On plan',
  MODIFIED: 'Modified',
  SKIPPED: 'Planned',
  MISSED: 'Missed',
  UNPLANNED: 'Off-plan'
};

export function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status.replaceAll('_', ' ');
}

export function statusTone(status: string): BadgeTone {
  switch (status) {
    case 'EATEN_AS_PLANNED':
      return 'green';
    case 'MODIFIED':
    case 'UNPLANNED':
      return 'blue';
    case 'MISSED':
      return 'red';
    case 'PLANNED':
    case 'UPCOMING':
    case 'SKIPPED':
      return 'yellow';
    default:
      return 'slate';
  }
}

/** Small colored dot color (hex/token) per meal status for compact cell headers. */
export function statusDotClass(status: string): string {
  switch (status) {
    case 'EATEN_AS_PLANNED':
      return 'bg-brand-green';
    case 'MODIFIED':
    case 'UNPLANNED':
      return 'bg-blue-500';
    case 'MISSED':
      return 'bg-red-400';
    case 'PLANNED':
    case 'UPCOMING':
    case 'SKIPPED':
      return 'bg-brand-gold';
    default:
      return 'bg-app-border';
  }
}

export function formatItemLine(item: MealItem): string {
  const qty = Number(item.quantity);
  const qtyLabel = qty === 1 ? '' : `${qty} ${item.unit} `;
  return `${qtyLabel}${item.nameSnapshot}`.trim();
}

export function formatMacrosShort(item: Pick<MealItem, 'calories' | 'protein'>): string {
  return `${Math.round(Number(item.calories))} kcal · ${Math.round(Number(item.protein))}g P`;
}

export function formatMacrosFull(item: Pick<MealItem, 'calories' | 'protein' | 'carbs' | 'fat'>): string {
  return `${Math.round(Number(item.calories))} kcal · ${Math.round(Number(item.protein))}g P · ${Math.round(
    Number(item.carbs)
  )}g C · ${Math.round(Number(item.fat))}g F`;
}

/** Build the stable set of meal rows (by mealNumber) present across the week. */
export function buildGridRows(days: DayMeals[]): GridRow[] {
  const byNumber = new Map<number, GridRow>();
  for (const day of days) {
    for (const meal of day.meals) {
      if (!byNumber.has(meal.mealNumber)) {
        byNumber.set(meal.mealNumber, {
          mealNumber: meal.mealNumber,
          label: meal.name,
          plannedTime: meal.plannedTime
        });
      }
    }
  }
  return [...byNumber.values()].sort((a, b) => a.mealNumber - b.mealNumber);
}

export function findMeal(days: DayMeals[], date: string, mealNumber: number): Meal | undefined {
  return days.find((day) => day.date === date)?.meals.find((meal) => meal.mealNumber === mealNumber);
}

export function dayPlannedKcal(meals: Meal[]): number {
  return meals.reduce((sum, meal) => sum + Number(meal.plannedCalories), 0);
}

export function dayActualKcal(meals: Meal[]): number {
  return meals.reduce((sum, meal) => sum + Number(meal.actualCalories), 0);
}

/** Add a food to a meal as either a PLANNED item (planning) or an ACTUAL item (logging what was eaten). */
export async function addFoodToMeal(
  mealId: string,
  food: Food,
  type: 'PLANNED' | 'ACTUAL' = 'PLANNED'
): Promise<void> {
  await api(`/api/meals/${mealId}/items`, {
    method: 'POST',
    body: JSON.stringify({
      type,
      foodId: food.id,
      nameSnapshot: food.name,
      quantity: Number(food.servingSize) || 1,
      unit: food.servingUnit,
      calories: Number(food.calories),
      protein: Number(food.protein),
      carbs: Number(food.carbs),
      fat: Number(food.fat)
    })
  });
}
