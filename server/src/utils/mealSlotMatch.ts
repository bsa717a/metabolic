import type { MealSlotType } from '@prisma/client';

/** Parse template plannedTime ("18:30", "6:00pm") to a 0–23 hour, or null. */
export function plannedHour(plannedTime: string | null): number | null {
  if (!plannedTime) return null;
  const match = plannedTime.trim().toLowerCase().match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/);
  if (!match) return null;
  let hour = Number(match[1]);
  if (match[3] === 'pm' && hour < 12) hour += 12;
  if (match[3] === 'am' && hour === 12) hour = 0;
  return hour;
}

export function isDinnerMeal(meal: { name: string; plannedTime: string | null }): boolean {
  if (meal.name.toLowerCase().includes('dinner')) return true;
  const hour = plannedHour(meal.plannedTime);
  return hour != null && hour >= 17 && hour < 21;
}

export function matchesMealSlot(meal: { name: string; plannedTime: string | null }, slotType: MealSlotType): boolean {
  const name = meal.name.toLowerCase();
  switch (slotType) {
    case 'BREAKFAST':
      if (name.includes('snack')) return false;
      if (name.includes('breakfast')) return true;
      {
        const hour = plannedHour(meal.plannedTime);
        return hour != null && hour >= 5 && hour < 11;
      }
    case 'SNACK':
      return name.includes('snack');
    case 'LUNCH':
      if (name.includes('snack')) return false;
      if (name.includes('lunch')) return true;
      {
        const hour = plannedHour(meal.plannedTime);
        return hour != null && hour >= 11 && hour < 15;
      }
    case 'DINNER':
      return isDinnerMeal(meal);
    default:
      return false;
  }
}

export function mealMatchesCardSet(
  meal: { name: string; plannedTime: string | null },
  slotType: MealSlotType
): boolean {
  if (slotType === 'DINNER') return isDinnerMeal(meal);
  return matchesMealSlot(meal, slotType) && !isDinnerMeal(meal);
}

export type StructureSlotRef = { mealNumber: number; slotType: MealSlotType };

export function findCardSetForTemplateMeal<T extends { slotType: MealSlotType }>(
  meal: { mealNumber: number; name: string; plannedTime: string | null; mealCardSet?: T | null },
  sets: T[],
  structureSlots?: StructureSlotRef[]
): T | undefined {
  if (meal.mealCardSet) return meal.mealCardSet;
  if (meal.name.toLowerCase().includes('snack')) {
    return sets.find((set) => set.slotType === 'SNACK');
  }
  const byHeuristic = sets.find((set) => mealMatchesCardSet(meal, set.slotType));
  if (byHeuristic) return byHeuristic;
  const structureSlot = structureSlots?.find((slot) => slot.mealNumber === meal.mealNumber);
  if (structureSlot) {
    return sets.find((set) => set.slotType === structureSlot.slotType);
  }
  return undefined;
}
