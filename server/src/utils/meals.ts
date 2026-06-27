export const COMPLETED_MEAL_STATUSES = new Set(['EATEN_AS_PLANNED', 'MODIFIED', 'SKIPPED', 'MISSED']);

export function parsePlannedMinutes(plannedTime: string | null): number | null {
  if (!plannedTime) return null;
  const trimmed = plannedTime.trim();

  const h24 = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (h24) {
    const hour = Number(h24[1]);
    const minute = Number(h24[2]);
    if (hour > 23 || minute > 59) return null;
    return hour * 60 + minute;
  }

  const h12 = trimmed.match(/^(\d{1,2}):(\d{2})\s*([ap]m)$/i);
  if (h12) {
    let hour = Number(h12[1]);
    const minute = Number(h12[2]);
    const meridiem = h12[3].toLowerCase();
    if (hour < 1 || hour > 12 || minute > 59) return null;
    if (meridiem === 'am') {
      if (hour === 12) hour = 0;
    } else if (hour !== 12) {
      hour += 12;
    }
    return hour * 60 + minute;
  }

  return null;
}

/** Canonical HH:MM for storage/API, or null when the value cannot be parsed. */
export function normalizePlannedTimeStorage(plannedTime: string | null | undefined): string | null {
  const minutes = parsePlannedMinutes(plannedTime ?? null);
  if (minutes == null) return null;
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
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
