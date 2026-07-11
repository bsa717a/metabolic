/** Agent-facing planned-meal editing: replace the planned items of meals on today or a future day. */
import { prisma } from '../db/prisma.js';
import { MealItemType } from '@prisma/client';
import { ensureDailyLogByUserId } from './dailyLogService.js';
import { createMeal } from './nutritionService.js';
import { recalculateDailyLogTotals, recalculateMealTotals } from './totalsService.js';
import { addUtcDays, parseDateParam, toDateKey, userDayKey } from '../utils/dates.js';
import { round } from '../utils/numbers.js';

export class PlanEditError extends Error {}

export type PlannedMealUpdateItem = {
  name: string;
  quantity: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type PlannedMealUpdate = {
  mealName: string;
  plannedTime?: string;
  items: PlannedMealUpdateItem[];
};

export type ParsedPlannedMealUpdate = {
  date: string;
  meals: PlannedMealUpdate[];
};

const MAX_DAYS_AHEAD = 31;
const MAX_MEALS = 8;
const MAX_ITEMS_PER_MEAL = 15;

function fail(message: string): never {
  throw new PlanEditError(message);
}

function parseNumber(value: unknown, label: string, max: number): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) fail(`${label} must be a non-negative number.`);
  if (num > max) fail(`${label} of ${num} is not realistic for one item.`);
  return round(num, 2);
}

function parseItem(raw: unknown, mealName: string): PlannedMealUpdateItem {
  if (!raw || typeof raw !== 'object') fail(`Each item in ${mealName} must be an object.`);
  const item = raw as Record<string, unknown>;
  const name = typeof item.name === 'string' ? item.name.trim() : '';
  if (!name) fail(`An item in ${mealName} is missing its name.`);
  if (name.length > 120) fail(`Item name "${name.slice(0, 40)}…" is too long.`);

  const quantity = item.quantity === undefined ? 1 : Number(item.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100) {
    fail(`Quantity for "${name}" must be between 0 and 100.`);
  }

  return {
    name,
    quantity: round(quantity, 2),
    unit: typeof item.unit === 'string' && item.unit.trim() ? item.unit.trim().slice(0, 40) : 'serving',
    calories: parseNumber(item.calories, `Calories for "${name}"`, 2000),
    protein: parseNumber(item.protein, `Protein for "${name}"`, 300),
    carbs: parseNumber(item.carbs, `Carbs for "${name}"`, 300),
    fat: parseNumber(item.fat, `Fat for "${name}"`, 300)
  };
}

/** Pure validation of the update_planned_meals tool args. Exported for tests. */
export function parsePlannedMealUpdate(args: Record<string, unknown>, todayKey: string): ParsedPlannedMealUpdate {
  const date = typeof args.date === 'string' ? args.date.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail('date must be a YYYY-MM-DD date.');

  const day = parseDateParam(date);
  const today = parseDateParam(todayKey);
  if (day < today) fail(`I can only change today or future days — ${date} is in the past.`);
  if (day > addUtcDays(today, MAX_DAYS_AHEAD)) fail(`I can only plan up to ${MAX_DAYS_AHEAD} days ahead.`);

  const rawMeals = Array.isArray(args.meals) ? args.meals : null;
  if (!rawMeals?.length) fail('meals must be a non-empty array.');
  if (rawMeals.length > MAX_MEALS) fail(`I can update at most ${MAX_MEALS} meals at once.`);

  const meals = rawMeals.map((rawMeal) => {
    if (!rawMeal || typeof rawMeal !== 'object') fail('Each meal must be an object.');
    const meal = rawMeal as Record<string, unknown>;
    const mealName = typeof meal.mealName === 'string' ? meal.mealName.trim() : '';
    if (!mealName) fail('Each meal needs a mealName.');
    if (mealName.length > 60) fail(`Meal name "${mealName.slice(0, 30)}…" is too long.`);

    let plannedTime: string | undefined;
    if (meal.plannedTime !== undefined && meal.plannedTime !== null) {
      const time = typeof meal.plannedTime === 'string' ? meal.plannedTime.trim() : '';
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
        fail(`plannedTime for ${mealName} must be 24h HH:MM (e.g. "13:00").`);
      }
      plannedTime = time;
    }

    const rawItems = Array.isArray(meal.items) ? meal.items : null;
    if (!rawItems?.length) fail(`${mealName} needs at least one item.`);
    if (rawItems.length > MAX_ITEMS_PER_MEAL) fail(`${mealName} has too many items (max ${MAX_ITEMS_PER_MEAL}).`);

    return {
      mealName,
      plannedTime,
      items: rawItems.map((item) => parseItem(item, mealName))
    };
  });

  const seen = new Set<string>();
  for (const meal of meals) {
    const key = meal.mealName.toLowerCase();
    if (seen.has(key)) fail(`Meal "${meal.mealName}" appears twice in one update.`);
    seen.add(key);
  }

  return { date, meals };
}

function formatDayLabel(date: string) {
  const parsed = parseDateParam(date);
  return parsed.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/**
 * Replaces the PLANNED items of the named meals on the given day. Meals are matched by
 * case-insensitive name; unmatched names become new meals. Logged (ACTUAL) food is never touched.
 */
export async function applyPlannedMealUpdate(
  userId: string,
  timeZone: string | null | undefined,
  args: Record<string, unknown>
): Promise<string> {
  const todayKey = userDayKey(timeZone);
  const { date, meals } = parsePlannedMealUpdate(args, todayKey);

  const log = await ensureDailyLogByUserId(userId, date);
  if (!log) fail('No active program found — the user needs a program before meals can be planned.');

  const existingMeals = await prisma.meal.findMany({
    where: { dailyLogId: log.id },
    orderBy: { mealNumber: 'asc' }
  });
  let nextMealNumber = (existingMeals.at(-1)?.mealNumber ?? 0) + 1;

  const summaries: string[] = [];
  for (const update of meals) {
    let meal = existingMeals.find((existing) => existing.name.trim().toLowerCase() === update.mealName.toLowerCase());
    let created = false;
    if (!meal) {
      meal = await createMeal(userId, date, {
        name: update.mealName,
        mealNumber: nextMealNumber,
        plannedTime: update.plannedTime ?? null
      });
      nextMealNumber += 1;
      created = true;
    }

    await prisma.$transaction(async (tx) => {
      await tx.meal.findFirstOrThrow({ where: { id: meal.id, userId } });
      await tx.mealItem.deleteMany({ where: { mealId: meal.id, type: MealItemType.PLANNED } });
      await tx.meal.update({
        where: { id: meal.id },
        data: {
          name: update.mealName,
          ...(update.plannedTime ? { plannedTime: update.plannedTime } : {})
        }
      });
      await tx.mealItem.createMany({
        data: update.items.map((item) => ({
          mealId: meal.id,
          type: MealItemType.PLANNED,
          nameSnapshot: item.name,
          quantity: item.quantity,
          unit: item.unit,
          calories: item.calories,
          protein: item.protein,
          carbs: item.carbs,
          fat: item.fat
        }))
      });
      await recalculateMealTotals(meal.id, tx);
      await recalculateDailyLogTotals(log.id, tx);
    });

    const kcal = Math.round(update.items.reduce((sum, item) => sum + item.calories, 0));
    const protein = Math.round(update.items.reduce((sum, item) => sum + item.protein, 0));
    summaries.push(
      `${update.mealName}${created ? ' (new)' : ''}: ${update.items.length} item${update.items.length === 1 ? '' : 's'}, ~${kcal} kcal / ${protein}g protein`
    );
  }

  return `Updated ${formatDayLabel(date)} (${toDateKey(parseDateParam(date))}): ${summaries.join('; ')}. Only planned items changed — nothing already logged was touched.`;
}
