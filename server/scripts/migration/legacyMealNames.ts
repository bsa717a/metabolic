/**
 * Meal labels from the old app.
 *
 * The meal `name` field is the wrong place to read a label. On imported
 * clients it often holds a height (`5'4"`) or a clock time (`12:30 PM`).
 * Real labels, when the old row has them, live on meal_name / title / label
 * (or a slot word such as Breakfast on type/category). Otherwise keep `name`
 * when it is an actual label. A clock time names the meal by time of day
 * (morning Breakfast, midday Lunch, afternoon Snack, evening Dinner).
 * With no clock, fall back to Breakfast, Lunch, Snack, Dinner by meal order.
 */
import { parsePlannedTime } from './legacyPlanParse.js';

const FALLBACK_MEAL_NAMES = ['Breakfast', 'Lunch', 'Snack', 'Dinner'] as const;

const LABEL_FIELDS = ['meal_name', 'mealName', 'mealname', 'title', 'label'] as const;
const SLOT_FIELDS = ['type', 'category'] as const;

const HEIGHT_RE =
  /^\d{1,2}\s*'\s*\d{0,2}\s*(?:''|"|”|″)?$|^\d{1,2}\s*(?:ft|feet)\s*\d{0,2}\s*(?:in|inches)?$/i;

export function isHeightMealName(value: string): boolean {
  const normalized = value
    .trim()
    .replace(/[\u2032\u2018\u2019\u00b4`]/g, "'")
    .replace(/[\u2033\u201c\u201d]/g, '"');
  return HEIGHT_RE.test(normalized);
}

export function normalizeClockText(value: string): string {
  return value.trim().toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ');
}

export function isClockTimeName(value: string): boolean {
  const normalized = normalizeClockText(value);
  if (!normalized) return false;
  if (/^\d{1,2}(?::\d{2})?\s*(?:am|pm)$/.test(normalized)) return true;
  if (/^\d{1,2}:\d{2}$/.test(normalized)) {
    const [hour, minute] = normalized.split(':').map(Number);
    return hour <= 23 && minute <= 59;
  }
  return false;
}

/** A stored meal name that is a height or a clock time, not a meal label. */
export function isImportedJunkMealName(value: string): boolean {
  const trimmed = value.trim();
  return Boolean(trimmed) && (isHeightMealName(trimmed) || isClockTimeName(trimmed));
}

export function plannedTimeFromClockName(value: string): string | null {
  if (!isClockTimeName(value)) return null;
  return parsePlannedTime(normalizeClockText(value));
}

/**
 * Breakfast / Lunch / Snack / Dinner from a clock, not from meal position.
 * Morning is 5:00–10:59, midday 11:00–13:59, afternoon 14:00–16:59, and
 * every other hour is evening. 9:30am is Breakfast. 3:00pm is Snack.
 * A parsed time never comes back as Meal 5 or Meal 6.
 */
export function mealNameForPlannedTime(value: string | null | undefined): string | null {
  const parsed = parsePlannedTime(value) ?? plannedTimeFromClockName(value ?? '');
  if (!parsed) return null;
  const [hourText, minuteText] = parsed.split(':');
  const minutes = Number(hourText) * 60 + Number(minuteText);
  if (!Number.isFinite(minutes)) return null;
  if (minutes >= 5 * 60 && minutes < 11 * 60) return 'Breakfast';
  if (minutes >= 11 * 60 && minutes < 14 * 60) return 'Lunch';
  if (minutes >= 14 * 60 && minutes < 17 * 60) return 'Snack';
  return 'Dinner';
}

/**
 * Planned time for a newly imported meal.
 * Prefer `time`. When that field is empty, a clock stored in `name`
 * (for example "12:30 PM") is still the schedule and must survive the
 * rename to Breakfast / Lunch / Snack / Dinner.
 */
export function legacyMealPlannedTime(meal: { name?: string | null; time?: string | null }): string | null {
  const fromTime = parsePlannedTime(meal.time) ?? plannedTimeFromClockName(meal.time ?? '');
  if (fromTime) return fromTime;
  return plannedTimeFromClockName(meal.name ?? '');
}

function slotLabel(value: string): string | null {
  switch (value.trim().toLowerCase()) {
    case 'breakfast':
      return 'Breakfast';
    case 'lunch':
      return 'Lunch';
    case 'snack':
    case 'snacks':
      return 'Snack';
    case 'dinner':
      return 'Dinner';
    default:
      return null;
  }
}

function usableMealLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (!trimmed || trimmed.length > 48 || isImportedJunkMealName(trimmed)) return null;
  return trimmed;
}

export function fallbackMealName(orderIndex: number): string {
  if (orderIndex >= 0 && orderIndex < FALLBACK_MEAL_NAMES.length) return FALLBACK_MEAL_NAMES[orderIndex];
  return `Meal ${orderIndex + 1}`;
}

/** 1-based meal number → Breakfast, Lunch, Snack, Dinner, then Meal N. */
export function fallbackMealNameForNumber(mealNumber: number): string {
  const index = Number.isInteger(mealNumber) && mealNumber >= 1 ? mealNumber - 1 : 0;
  return fallbackMealName(index);
}

export type LegacyMealNameSource = {
  mealnum?: number | null;
  name?: string | null;
  time?: string | null;
};

function orderIndex(meal: LegacyMealNameSource, fallbackIndex: number): number {
  const mealNumber = Number(meal.mealnum);
  if (Number.isInteger(mealNumber) && mealNumber >= 1) return mealNumber - 1;
  return fallbackIndex;
}

/** Label to store for one old-app meal. `fallbackIndex` is its position in the meal list. */
export function legacyMealName(meal: LegacyMealNameSource, fallbackIndex: number): string {
  const record = meal as LegacyMealNameSource & Record<string, unknown>;
  for (const key of LABEL_FIELDS) {
    const label = usableMealLabel(record[key]);
    if (label) return slotLabel(label) ?? label;
  }
  for (const key of SLOT_FIELDS) {
    if (typeof record[key] !== 'string') continue;
    const slot = slotLabel(record[key] as string);
    if (slot) return slot;
  }
  const fromName = usableMealLabel(meal.name);
  if (fromName) return slotLabel(fromName) ?? fromName;
  const fromClock = mealNameForPlannedTime(legacyMealPlannedTime(meal));
  if (fromClock) return fromClock;
  return fallbackMealName(orderIndex(meal, fallbackIndex));
}

export function renameImportedMeal(
  name: string,
  mealNumber: number,
  plannedTime: string | null
): { name: string; plannedTime: string | null } | null {
  if (!isImportedJunkMealName(name)) return null;
  const currentTime = plannedTime?.trim() || null;
  const clock = currentTime ?? plannedTimeFromClockName(name);
  const nextName = mealNameForPlannedTime(clock) ?? fallbackMealNameForNumber(mealNumber);
  const nextTime = currentTime ?? plannedTimeFromClockName(name);
  if (nextName === name.trim() && nextTime === currentTime) return null;
  return { name: nextName, plannedTime: nextTime };
}

/** Clients who own the plan. The coach who created the template is not an owner. */
export function templateClientIds(input: {
  programUserIds: string[];
  planPeriodUserIds: string[];
  clientIds: ReadonlySet<string>;
}): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const id of [...input.programUserIds, ...input.planPeriodUserIds]) {
    if (!input.clientIds.has(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/** Dry-run line. A clock that moves out of the name is called out. */
export function describeMealRename(from: string, to: string, plannedTime: string | null): string {
  const rename = `${JSON.stringify(from)} → ${to}`;
  return plannedTime ? `${rename}, time → ${plannedTime}` : rename;
}
