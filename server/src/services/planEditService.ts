/** Agent-facing planned-meal editing: replace the planned items of meals on today or a future day. */
import { prisma } from '../db/prisma.js';
import { MealItemType, Prisma } from '@prisma/client';
import { ensureDailyLogByUserId } from './dailyLogService.js';
import { createMeal } from './nutritionService.js';
import { recalculateDailyLogTotals, recalculateMealTotals } from './totalsService.js';
import { addUtcDays, parseDateParam, toDateKey, userDayKey } from '../utils/dates.js';
import { normalizePlannedTimeStorage } from '../utils/meals.js';
import { round } from '../utils/numbers.js';

export class PlanEditError extends Error {}

export type MealRenameArgs = {
  newName: string;
  currentName?: string;
  date?: string;
  mealId?: string;
};

export type MealRenameFocus = {
  mealName: string;
  mealId?: string;
  date: string;
};

export type MealRenameResult = {
  result: string;
  mealId: string;
  previousName: string;
  newName: string;
  date: string;
};

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
  /** When set, update this meal by id — never create a new meal. */
  mealId?: string;
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

    const mealId = typeof meal.mealId === 'string' && meal.mealId.trim() ? meal.mealId.trim() : undefined;

    return {
      mealName,
      ...(mealId ? { mealId } : {}),
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
    let meal = update.mealId
      ? existingMeals.find((existing) => existing.id === update.mealId)
      : existingMeals.find((existing) => existing.name.trim().toLowerCase() === update.mealName.toLowerCase());
    let created = false;
    if (!meal && update.mealId) {
      fail(`I couldn't find that meal to update on ${formatDayLabel(date)}.`);
    }
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

export type MealTimeChangeArgs = {
  plannedTime: string;
  mealName?: string;
  date?: string;
  mealId?: string;
};

export type MealTimeChangeResult = {
  result: string;
  mealId: string;
  mealName: string;
  previousTime: string | null;
  plannedTime: string;
  date: string;
};

function formatClockLabel(hhmm: string) {
  const [hourStr, minuteStr] = hhmm.split(':');
  let hour = Number(hourStr);
  const minute = Number(minuteStr);
  const meridiem = hour >= 12 ? 'pm' : 'am';
  hour = hour % 12 || 12;
  return minute === 0 ? `${hour}${meridiem}` : `${hour}:${String(minute).padStart(2, '0')}${meridiem}`;
}

/**
 * Updates only plannedTime for one meal. Prefer mealId / meal-edit focus when present.
 */
export async function applyMealTimeChange(
  userId: string,
  timeZone: string | null | undefined,
  args: MealTimeChangeArgs,
  focus?: MealRenameFocus | null
): Promise<MealTimeChangeResult> {
  const plannedTime = normalizePlannedTimeStorage(args.plannedTime);
  if (!plannedTime) fail('I need a valid time like 10am or 10:00.');

  const todayKey = userDayKey(timeZone);
  const today = parseDateParam(todayKey);
  const requestedMealId = (typeof args.mealId === 'string' && args.mealId.trim()) || focus?.mealId || '';

  const byId = requestedMealId
    ? await prisma.meal.findFirst({
        where: { id: requestedMealId, userId },
        select: { id: true, dailyLogId: true, dailyLog: { select: { date: true } } }
      })
    : null;

  const date =
    (byId ? toDateKey(byId.dailyLog.date) : undefined) ||
    (typeof args.date === 'string' && args.date.trim()) ||
    focus?.date ||
    todayKey;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail('date must be a YYYY-MM-DD date.');

  const day = parseDateParam(date);
  if (day < today) fail(`I can only change meal times on today or future days — ${date} is in the past.`);
  if (day > addUtcDays(today, MAX_DAYS_AHEAD)) {
    fail(`I can only change meal times up to ${MAX_DAYS_AHEAD} days ahead.`);
  }

  const log = byId ? { id: byId.dailyLogId } : await ensureDailyLogByUserId(userId, date);
  if (!log) fail('No active program found — the user needs a program before meal times can be changed.');

  const meals = await prisma.meal.findMany({
    where: { dailyLogId: log.id, userId },
    orderBy: { mealNumber: 'asc' }
  });
  if (!meals.length) fail(`There are no meals on ${formatDayLabel(date)} to update.`);

  const currentHint =
    (typeof args.mealName === 'string' && args.mealName.trim()) || focus?.mealName?.trim() || '';
  let target =
    (byId ? meals.find((entry) => entry.id === byId.id) : undefined) ??
    (requestedMealId ? meals.find((entry) => entry.id === requestedMealId) : undefined);

  if (!target && currentHint) {
    const needle = currentHint.toLowerCase();
    target =
      meals.find((entry) => entry.name.trim().toLowerCase() === needle) ??
      meals.find((entry) => entry.name.trim().toLowerCase().includes(needle));
  }
  if (!target && meals.length === 1) target = meals[0];
  if (!target) {
    const list = meals.map((entry) => `${entry.mealNumber}. ${entry.name}`).join(', ');
    fail(`Which meal's time should I change? Your meals on ${formatDayLabel(date)}: ${list}.`);
  }

  const previousTime = target.plannedTime;
  if (previousTime === plannedTime) {
    return {
      result: `"${target.name}" is already set for ${formatClockLabel(plannedTime)} on ${formatDayLabel(date)}.`,
      mealId: target.id,
      mealName: target.name,
      previousTime,
      plannedTime,
      date
    };
  }

  await prisma.meal.update({
    where: { id: target.id },
    data: { plannedTime }
  });

  return {
    result: `Updated "${target.name}" to ${formatClockLabel(plannedTime)} for ${formatDayLabel(date)} (${date}). The meal name and foods are unchanged.`,
    mealId: target.id,
    mealName: target.name,
    previousTime,
    plannedTime,
    date
  };
}

function normalizeMealLabel(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function withAiMealName(cardSelections: unknown, newName: string): Prisma.InputJsonValue | undefined {
  if (!cardSelections || typeof cardSelections !== 'object' || Array.isArray(cardSelections)) return undefined;
  const current = cardSelections as Record<string, unknown>;
  const aiMeal = current.aiMeal;
  if (!aiMeal || typeof aiMeal !== 'object' || Array.isArray(aiMeal)) return undefined;
  return {
    ...current,
    aiMeal: { ...(aiMeal as Record<string, unknown>), name: newName }
  } as Prisma.InputJsonValue;
}

/**
 * Renames one meal on today or a future day. Prefer mealId / meal-edit focus when present.
 * Does not create meals or touch planned/logged foods.
 */
export async function applyMealRename(
  userId: string,
  timeZone: string | null | undefined,
  args: MealRenameArgs,
  focus?: MealRenameFocus | null
): Promise<MealRenameResult> {
  const newName = normalizeMealLabel(args.newName ?? '');
  if (!newName) fail('newName is required.');
  if (newName.length > 60) fail(`Meal name "${newName.slice(0, 30)}…" is too long.`);

  const todayKey = userDayKey(timeZone);
  const today = parseDateParam(todayKey);
  const requestedMealId = (typeof args.mealId === 'string' && args.mealId.trim()) || focus?.mealId || '';

  // Resolve by id first so a stale/wrong client date cannot miss the meal.
  const byId = requestedMealId
    ? await prisma.meal.findFirst({
        where: { id: requestedMealId, userId },
        select: { id: true, dailyLogId: true, dailyLog: { select: { date: true } } }
      })
    : null;

  const date =
    (byId ? toDateKey(byId.dailyLog.date) : undefined) ||
    (typeof args.date === 'string' && args.date.trim()) ||
    focus?.date ||
    todayKey;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail('date must be a YYYY-MM-DD date.');

  const day = parseDateParam(date);
  if (day < today) fail(`I can only rename meals on today or future days — ${date} is in the past.`);
  if (day > addUtcDays(today, MAX_DAYS_AHEAD)) fail(`I can only rename meals up to ${MAX_DAYS_AHEAD} days ahead.`);

  const log = byId
    ? { id: byId.dailyLogId }
    : await ensureDailyLogByUserId(userId, date);
  if (!log) fail('No active program found — the user needs a program before meals can be renamed.');

  const meals = await prisma.meal.findMany({
    where: { dailyLogId: log.id, userId },
    include: { items: { select: { id: true, type: true } } },
    orderBy: { mealNumber: 'asc' }
  });
  if (!meals.length) fail(`There are no meals on ${formatDayLabel(date)} to rename.`);

  const currentHint =
    (typeof args.currentName === 'string' && args.currentName.trim()) ||
    focus?.mealName?.trim() ||
    '';
  let target =
    (byId ? meals.find((entry) => entry.id === byId.id) : undefined) ??
    (requestedMealId ? meals.find((entry) => entry.id === requestedMealId) : undefined);

  if (!target && currentHint) {
    const needle = currentHint.toLowerCase();
    target =
      meals.find((entry) => entry.name.trim().toLowerCase() === needle) ??
      meals.find((entry) => entry.name.trim().toLowerCase().includes(needle));
  }
  if (!target && meals.length === 1) target = meals[0];
  if (!target) {
    const list = meals.map((entry) => `${entry.mealNumber}. ${entry.name}`).join(', ');
    fail(`Which meal should I rename? Your meals on ${formatDayLabel(date)}: ${list}.`);
  }

  const previousName = target.name;
  if (previousName.trim().toLowerCase() === newName.toLowerCase()) {
    return {
      result: `"${previousName}" is already named that on ${formatDayLabel(date)}.`,
      mealId: target.id,
      previousName,
      newName: previousName,
      date
    };
  }

  const conflict = meals.find(
    (entry) => entry.id !== target.id && entry.name.trim().toLowerCase() === newName.toLowerCase()
  );
  let conflictNote = '';
  if (conflict) {
    const conflictHasLogged = conflict.items.some((item) => item.type === MealItemType.ACTUAL);
    if (conflictHasLogged) {
      fail(
        `There's already a meal named "${conflict.name}" on ${formatDayLabel(date)} with food logged. Rename or clear that one first.`
      );
    }
    // Free the name: drop an empty duplicate, otherwise park the other meal as "Meal N".
    if (!conflict.items.length) {
      await prisma.meal.delete({ where: { id: conflict.id } });
      conflictNote = ' Removed an empty duplicate that was already using that name.';
    } else {
      const parkedName = `Meal ${conflict.mealNumber}`;
      await prisma.meal.update({ where: { id: conflict.id }, data: { name: parkedName } });
      conflictNote = ` The other meal using that name is now "${parkedName}" so this rename could complete.`;
    }
  }

  const nextCardSelections = withAiMealName(target.cardSelections, newName);
  await prisma.meal.update({
    where: { id: target.id },
    data: {
      name: newName,
      ...(nextCardSelections ? { cardSelections: nextCardSelections } : {})
    }
  });

  return {
    result: `Renamed "${previousName}" to "${newName}" for ${formatDayLabel(date)} (${date}). Foods and macros are unchanged.${conflictNote}`,
    mealId: target.id,
    previousName,
    newName,
    date
  };
}

// ---------------------------------------------------------------------------
// Granular meal management: add/update/remove a single item, create/delete a
// meal, copy a meal across days. These let the coach maintain a plan without
// replacing a whole meal. Every mutation returns the resulting MealState so the
// model confirms from real data instead of guessing.
// ---------------------------------------------------------------------------

export type MealTargetArgs = {
  mealName?: string;
  mealId?: string;
  date?: string;
};

export type MealStateItem = {
  itemId: string;
  name: string;
  quantity: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type MealState = {
  mealId: string;
  mealName: string;
  date: string;
  plannedTime: string | null;
  items: MealStateItem[];
  totals: { calories: number; protein: number; carbs: number; fat: number };
};

function dec(value: Prisma.Decimal | number | null | undefined): number {
  if (value == null) return 0;
  return round(Number(value), 2);
}

/** Loads the current PLANNED state of a meal for tool responses. */
export async function loadMealState(mealId: string, date: string): Promise<MealState> {
  const meal = await prisma.meal.findUniqueOrThrow({
    where: { id: mealId },
    include: {
      items: {
        where: { type: MealItemType.PLANNED },
        orderBy: { createdAt: 'asc' },
        select: { id: true, nameSnapshot: true, quantity: true, unit: true, calories: true, protein: true, carbs: true, fat: true }
      }
    }
  });
  const items: MealStateItem[] = meal.items.map((item) => ({
    itemId: item.id,
    name: item.nameSnapshot,
    quantity: dec(item.quantity),
    unit: item.unit,
    calories: dec(item.calories),
    protein: dec(item.protein),
    carbs: dec(item.carbs),
    fat: dec(item.fat)
  }));
  return {
    mealId: meal.id,
    mealName: meal.name,
    date,
    plannedTime: meal.plannedTime,
    items,
    totals: {
      calories: Math.round(items.reduce((sum, item) => sum + item.calories, 0)),
      protein: Math.round(items.reduce((sum, item) => sum + item.protein, 0)),
      carbs: Math.round(items.reduce((sum, item) => sum + item.carbs, 0)),
      fat: Math.round(items.reduce((sum, item) => sum + item.fat, 0))
    }
  };
}

type MealWithItems = Prisma.MealGetPayload<{ include: { items: true } }>;

/**
 * Resolves the target meal for a granular edit. Mirrors applyMealRename/applyMealTimeChange:
 * prefer mealId, then meal-edit focus, then a name hint, then the only meal on the day.
 */
async function findTargetMeal(
  userId: string,
  timeZone: string | null | undefined,
  args: MealTargetArgs,
  focus?: MealRenameFocus | null
): Promise<{ meal: MealWithItems; date: string; logId: string }> {
  const todayKey = userDayKey(timeZone);
  const today = parseDateParam(todayKey);
  const requestedMealId = (typeof args.mealId === 'string' && args.mealId.trim()) || focus?.mealId || '';

  const byId = requestedMealId
    ? await prisma.meal.findFirst({
        where: { id: requestedMealId, userId },
        select: { id: true, dailyLogId: true, dailyLog: { select: { date: true } } }
      })
    : null;

  const date =
    (byId ? toDateKey(byId.dailyLog.date) : undefined) ||
    (typeof args.date === 'string' && args.date.trim()) ||
    focus?.date ||
    todayKey;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail('date must be a YYYY-MM-DD date.');

  const day = parseDateParam(date);
  if (day < today) fail(`I can only change today or future days — ${date} is in the past.`);
  if (day > addUtcDays(today, MAX_DAYS_AHEAD)) fail(`I can only manage meals up to ${MAX_DAYS_AHEAD} days ahead.`);

  const log = byId ? { id: byId.dailyLogId } : await ensureDailyLogByUserId(userId, date);
  if (!log) fail('No active program found — the user needs a program before meals can be managed.');

  const meals = await prisma.meal.findMany({
    where: { dailyLogId: log.id, userId },
    include: { items: true },
    orderBy: { mealNumber: 'asc' }
  });
  if (!meals.length) fail(`There are no meals on ${formatDayLabel(date)} yet.`);

  const hint = (typeof args.mealName === 'string' && args.mealName.trim()) || focus?.mealName?.trim() || '';
  let target =
    (byId ? meals.find((entry) => entry.id === byId.id) : undefined) ??
    (requestedMealId ? meals.find((entry) => entry.id === requestedMealId) : undefined);
  if (!target && hint) {
    const needle = hint.toLowerCase();
    target =
      meals.find((entry) => entry.name.trim().toLowerCase() === needle) ??
      meals.find((entry) => entry.name.trim().toLowerCase().includes(needle));
  }
  if (!target && meals.length === 1) target = meals[0];
  if (!target) {
    const list = meals.map((entry) => `${entry.mealNumber}. ${entry.name}`).join(', ');
    fail(`Which meal on ${formatDayLabel(date)}? Options: ${list}.`);
  }

  return { meal: target, date, logId: log.id };
}

/** Finds a single PLANNED item within a meal by id or a name hint. */
function matchPlannedItem(meal: MealWithItems, itemId?: string, nameHint?: string) {
  const planned = meal.items.filter((item) => item.type === MealItemType.PLANNED);
  if (!planned.length) fail(`"${meal.name}" has no planned foods to change.`);
  if (itemId) {
    const byId = planned.find((item) => item.id === itemId);
    if (byId) return byId;
  }
  const hint = (nameHint ?? '').trim().toLowerCase();
  if (hint) {
    const exact = planned.find((item) => item.nameSnapshot.trim().toLowerCase() === hint);
    if (exact) return exact;
    const partial = planned.filter((item) => item.nameSnapshot.trim().toLowerCase().includes(hint));
    if (partial.length === 1) return partial[0];
    if (partial.length > 1) {
      fail(`More than one item in "${meal.name}" matches "${nameHint}". Which one? ${partial.map((item) => item.nameSnapshot).join(', ')}.`);
    }
  }
  const list = planned.map((item) => item.nameSnapshot).join(', ');
  fail(`Which item in "${meal.name}"? Options: ${list}.`);
}

/** Pulls one item's fields from tool args, accepting either a nested `item` object or flat fields. */
function parseSingleItem(args: Record<string, unknown>, mealName: string): PlannedMealUpdateItem {
  const raw = args.item && typeof args.item === 'object' ? (args.item as Record<string, unknown>) : args;
  return parseItem(raw, mealName);
}

/** Adds one PLANNED item to an existing meal. */
export async function applyAddMealItem(
  userId: string,
  timeZone: string | null | undefined,
  args: Record<string, unknown>,
  focus?: MealRenameFocus | null
): Promise<MealState & { result: string }> {
  const { meal, date } = await findTargetMeal(userId, timeZone, args as MealTargetArgs, focus);
  const plannedCount = meal.items.filter((item) => item.type === MealItemType.PLANNED).length;
  if (plannedCount >= MAX_ITEMS_PER_MEAL) fail(`"${meal.name}" already has the max ${MAX_ITEMS_PER_MEAL} items.`);
  const item = parseSingleItem(args, meal.name);

  await prisma.$transaction(async (tx) => {
    await tx.mealItem.create({
      data: {
        mealId: meal.id,
        type: MealItemType.PLANNED,
        nameSnapshot: item.name,
        quantity: item.quantity,
        unit: item.unit,
        calories: item.calories,
        protein: item.protein,
        carbs: item.carbs,
        fat: item.fat
      }
    });
    await recalculateMealTotals(meal.id, tx);
    await recalculateDailyLogTotals(meal.dailyLogId, tx);
  });

  const state = await loadMealState(meal.id, date);
  return {
    ...state,
    result: `Added ${item.name} to "${meal.name}" for ${formatDayLabel(date)}. "${meal.name}" now has ${state.items.length} item${state.items.length === 1 ? '' : 's'}, ~${state.totals.calories} kcal / ${state.totals.protein}g protein.`
  };
}

/** Updates one PLANNED item's name/quantity/macros in place. */
export async function applyUpdateMealItem(
  userId: string,
  timeZone: string | null | undefined,
  args: Record<string, unknown>,
  focus?: MealRenameFocus | null
): Promise<MealState & { result: string }> {
  const { meal, date } = await findTargetMeal(userId, timeZone, args as MealTargetArgs, focus);
  const itemId = typeof args.itemId === 'string' && args.itemId.trim() ? args.itemId.trim() : undefined;
  const itemName = typeof args.itemName === 'string' ? args.itemName : (typeof args.currentItemName === 'string' ? args.currentItemName : undefined);
  const existing = matchPlannedItem(meal, itemId, itemName);

  const data: Prisma.MealItemUpdateInput = {};
  if (typeof args.name === 'string' && args.name.trim()) data.nameSnapshot = args.name.trim().slice(0, 120);
  if (args.quantity !== undefined) {
    const quantity = Number(args.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100) fail('quantity must be between 0 and 100.');
    data.quantity = round(quantity, 2);
  }
  if (typeof args.unit === 'string' && args.unit.trim()) data.unit = args.unit.trim().slice(0, 40);
  if (args.calories !== undefined) data.calories = parseNumber(args.calories, 'Calories', 2000);
  if (args.protein !== undefined) data.protein = parseNumber(args.protein, 'Protein', 300);
  if (args.carbs !== undefined) data.carbs = parseNumber(args.carbs, 'Carbs', 300);
  if (args.fat !== undefined) data.fat = parseNumber(args.fat, 'Fat', 300);
  if (Object.keys(data).length === 0) fail('Tell me what to change on that item (name, quantity, or macros).');

  await prisma.$transaction(async (tx) => {
    await tx.mealItem.update({ where: { id: existing.id }, data });
    await recalculateMealTotals(meal.id, tx);
    await recalculateDailyLogTotals(meal.dailyLogId, tx);
  });

  const state = await loadMealState(meal.id, date);
  return {
    ...state,
    result: `Updated ${existing.nameSnapshot} in "${meal.name}" for ${formatDayLabel(date)}. "${meal.name}" is now ~${state.totals.calories} kcal / ${state.totals.protein}g protein.`
  };
}

/** Removes one PLANNED item from a meal. */
export async function applyRemoveMealItem(
  userId: string,
  timeZone: string | null | undefined,
  args: Record<string, unknown>,
  focus?: MealRenameFocus | null
): Promise<MealState & { result: string }> {
  const { meal, date } = await findTargetMeal(userId, timeZone, args as MealTargetArgs, focus);
  const itemId = typeof args.itemId === 'string' && args.itemId.trim() ? args.itemId.trim() : undefined;
  const itemName = typeof args.itemName === 'string' ? args.itemName : undefined;
  const existing = matchPlannedItem(meal, itemId, itemName);

  await prisma.$transaction(async (tx) => {
    await tx.mealItem.deleteMany({ where: { linkedPlannedItemId: existing.id } });
    await tx.mealItem.delete({ where: { id: existing.id } });
    await recalculateMealTotals(meal.id, tx);
    await recalculateDailyLogTotals(meal.dailyLogId, tx);
  });

  const state = await loadMealState(meal.id, date);
  return {
    ...state,
    result: `Removed ${existing.nameSnapshot} from "${meal.name}" for ${formatDayLabel(date)}. ${state.items.length ? `"${meal.name}" now has ${state.items.length} item${state.items.length === 1 ? '' : 's'}, ~${state.totals.calories} kcal.` : `"${meal.name}" has no planned foods now.`}`
  };
}

export type CreateMealArgs = {
  mealName: string;
  date?: string;
  plannedTime?: string;
  items?: unknown;
};

/** Creates a new meal slot on a day, optionally seeding its planned items. */
export async function applyCreateMeal(
  userId: string,
  timeZone: string | null | undefined,
  args: Record<string, unknown>
): Promise<MealState & { result: string }> {
  const mealName = typeof args.mealName === 'string' ? args.mealName.trim() : '';
  if (!mealName) fail('mealName is required to create a meal.');
  if (mealName.length > 60) fail(`Meal name "${mealName.slice(0, 30)}…" is too long.`);

  const todayKey = userDayKey(timeZone);
  const today = parseDateParam(todayKey);
  const date = (typeof args.date === 'string' && args.date.trim()) || todayKey;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail('date must be a YYYY-MM-DD date.');
  const day = parseDateParam(date);
  if (day < today) fail(`I can only add meals on today or future days — ${date} is in the past.`);
  if (day > addUtcDays(today, MAX_DAYS_AHEAD)) fail(`I can only add meals up to ${MAX_DAYS_AHEAD} days ahead.`);

  const log = await ensureDailyLogByUserId(userId, date);
  if (!log) fail('No active program found — the user needs a program before meals can be added.');

  const existing = await prisma.meal.findMany({ where: { dailyLogId: log.id }, orderBy: { mealNumber: 'asc' } });
  if (existing.some((meal) => meal.name.trim().toLowerCase() === mealName.toLowerCase())) {
    fail(`There's already a meal named "${mealName}" on ${formatDayLabel(date)}.`);
  }
  if (existing.length >= MAX_MEALS) fail(`${formatDayLabel(date)} already has the max ${MAX_MEALS} meals.`);

  let plannedTime: string | undefined;
  if (typeof args.plannedTime === 'string' && args.plannedTime.trim()) {
    plannedTime = normalizePlannedTimeStorage(args.plannedTime) ?? undefined;
    if (!plannedTime) fail('I need a valid time like 10am or 10:00.');
  }

  const rawItems = Array.isArray(args.items) ? args.items : [];
  if (rawItems.length > MAX_ITEMS_PER_MEAL) fail(`A meal can have at most ${MAX_ITEMS_PER_MEAL} items.`);
  const items = rawItems.map((item) => parseItem(item, mealName));

  const nextMealNumber = (existing.at(-1)?.mealNumber ?? 0) + 1;
  const meal = await createMeal(userId, date, { name: mealName, mealNumber: nextMealNumber, plannedTime: plannedTime ?? null });

  if (items.length) {
    await prisma.$transaction(async (tx) => {
      await tx.mealItem.createMany({
        data: items.map((item) => ({
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
  }

  const state = await loadMealState(meal.id, date);
  return {
    ...state,
    result: `Added a new meal "${mealName}"${plannedTime ? ` at ${formatClockLabel(plannedTime)}` : ''} to ${formatDayLabel(date)}${items.length ? ` with ${items.length} item${items.length === 1 ? '' : 's'} (~${state.totals.calories} kcal / ${state.totals.protein}g protein)` : ' (no foods yet)'}.`
  };
}

export type DeleteMealResult = {
  result: string;
  mealId: string;
  mealName: string;
  date: string;
};

/** Deletes a meal slot on a day. Refuses when the meal has logged (ACTUAL) food. */
export async function applyDeleteMeal(
  userId: string,
  timeZone: string | null | undefined,
  args: Record<string, unknown>,
  focus?: MealRenameFocus | null
): Promise<DeleteMealResult> {
  const { meal, date } = await findTargetMeal(userId, timeZone, args as MealTargetArgs, focus);
  if (meal.items.some((item) => item.type === MealItemType.ACTUAL)) {
    fail(`"${meal.name}" has logged food on ${formatDayLabel(date)}, so I won't delete it. Clear the logged items first if you really want it gone.`);
  }
  const mealName = meal.name;
  await prisma.$transaction(async (tx) => {
    await tx.meal.delete({ where: { id: meal.id } });
    await recalculateDailyLogTotals(meal.dailyLogId, tx);
  });
  return {
    result: `Deleted "${mealName}" from ${formatDayLabel(date)} (${date}).`,
    mealId: meal.id,
    mealName,
    date
  };
}

export type CopyMealResult = {
  result: string;
  mealName: string;
  sourceDate: string;
  targetDates: string[];
};

/** Copies a meal's planned items to one or more other days (e.g. "make lunch the same all week"). */
export async function applyCopyMealToDays(
  userId: string,
  timeZone: string | null | undefined,
  args: Record<string, unknown>,
  focus?: MealRenameFocus | null
): Promise<CopyMealResult> {
  const { meal, date: sourceDate } = await findTargetMeal(userId, timeZone, args as MealTargetArgs, focus);
  const planned = meal.items.filter((item) => item.type === MealItemType.PLANNED);
  if (!planned.length) fail(`"${meal.name}" has no planned foods to copy.`);

  const rawTargets = Array.isArray(args.targetDates) ? args.targetDates : [];
  const targetDates = Array.from(
    new Set(
      rawTargets
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && value !== sourceDate)
    )
  );
  if (!targetDates.length) fail('Give me the target days to copy this meal to (YYYY-MM-DD).');
  if (targetDates.length > MAX_DAYS_AHEAD) fail(`I can copy to at most ${MAX_DAYS_AHEAD} days at once.`);

  const items: PlannedMealUpdateItem[] = planned.map((item) => ({
    name: item.nameSnapshot,
    quantity: dec(item.quantity),
    unit: item.unit,
    calories: dec(item.calories),
    protein: dec(item.protein),
    carbs: dec(item.carbs),
    fat: dec(item.fat)
  }));

  const done: string[] = [];
  for (const targetDate of targetDates) {
    await applyPlannedMealUpdate(userId, timeZone, {
      date: targetDate,
      meals: [
        {
          mealName: meal.name,
          ...(meal.plannedTime ? { plannedTime: meal.plannedTime } : {}),
          items
        }
      ]
    });
    done.push(targetDate);
  }

  return {
    result: `Copied "${meal.name}" (${items.length} item${items.length === 1 ? '' : 's'}) from ${formatDayLabel(sourceDate)} to ${done.map((d) => formatDayLabel(d)).join(', ')}.`,
    mealName: meal.name,
    sourceDate,
    targetDates: done
  };
}
