export const COMPLETED_MEAL_STATUSES = new Set(['EATEN_AS_PLANNED', 'SKIPPED', 'MISSED']);

export function parsePlannedMinutes(plannedTime: string | null): number | null {
  if (!plannedTime) return null;
  const match = plannedTime.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

type MealSlot = {
  mealNumber: number;
  name: string;
  plannedTime: string | null;
  status: string;
};

/**
 * Picks the meal the user should focus on next. Prefers the earliest incomplete
 * meal whose planned time is still upcoming; when earlier slots were missed,
 * returns the next upcoming incomplete meal (not breakfast at 07:30 at 2pm).
 */
export function resolveNextMeal<T extends MealSlot>(meals: T[], minutesOfDay?: number): T | undefined {
  const incomplete = meals.filter((meal) => !COMPLETED_MEAL_STATUSES.has(meal.status));
  if (!incomplete.length) return undefined;
  if (minutesOfDay == null) return incomplete[0];

  const ranked = incomplete.map((meal) => ({
    meal,
    minutes: parsePlannedMinutes(meal.plannedTime)
  }));

  const upcoming = ranked
    .filter(({ minutes }) => minutes == null || minutes >= minutesOfDay)
    .sort((a, b) => {
      if (a.minutes == null && b.minutes == null) return a.meal.mealNumber - b.meal.mealNumber;
      if (a.minutes == null) return 1;
      if (b.minutes == null) return -1;
      return a.minutes - b.minutes || a.meal.mealNumber - b.meal.mealNumber;
    });

  if (upcoming.length) return upcoming[0]!.meal;

  const past = ranked
    .filter(({ minutes }) => minutes != null && minutes < minutesOfDay)
    .sort((a, b) => b.minutes! - a.minutes! || b.meal.mealNumber - a.meal.mealNumber);

  return past[0]?.meal ?? incomplete[0];
}
