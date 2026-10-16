/**
 * Meal labels from the old app.
 *
 * The meal `name` field is the wrong place to read a label. On imported
 * clients it often holds a height (`5'4"`) or a clock time (`12:30 PM`).
 * Real labels, when the old row has them, live on meal_name / title / label
 * (or a slot word such as Breakfast on type/category). Otherwise keep `name`
 * when it is an actual label. A clock written in `name` decides the new
 * label and replaces the time field. Morning (5:00–10:59) is Breakfast,
 * midday (11:00–13:59) is Lunch, afternoon (14:00–16:59) is Snack. A new
 * import treats every other hour as Dinner and falls back by meal order
 * when there is neither a clock nor a time.
 *
 * The one-off rename script uses planImportedMealRenames. It rewrites a
 * day or plan only when that day or plan already contains a height or a
 * clock. On those, a Meal N placeholder is named from the stored time and
 * that time is not overwritten. Dinner is only 17:00–23:59. A clock outside
 * 5:00–23:59 has no band name. A rename that would repeat a name on that
 * day or plan, ignoring case, is skipped, and so is a name that would
 * contradict the clock. Proper names are never rewritten.
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

/** "Meal 1", "Meal 5", and so on. Not a label the client chose. */
export function isMealPlaceholderName(value: string): boolean {
  return /^Meal \d+$/.test(value.trim());
}

/**
 * A name that must be left alone: Breakfast, Lunch, Snack, Dinner, or any
 * other label that is not a height, a clock, or a "Meal N" placeholder.
 */
export function isProperMealName(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return !isImportedJunkMealName(trimmed) && !isMealPlaceholderName(trimmed);
}

export function plannedTimeFromClockName(value: string): string | null {
  if (!isClockTimeName(value)) return null;
  return parsePlannedTime(normalizeClockText(value));
}

/**
 * Band name for a clock the rename script can apply cleanly.
 * 5:00–10:59 Breakfast, 11:00–13:59 Lunch, 14:00–16:59 Snack, 17:00–23:59 Dinner.
 * Outside that window there is no clean name. 04:30 is not Dinner.
 */
export function cleanMealBandName(value: string | null | undefined): string | null {
  const parsed = parsePlannedTime(value) ?? plannedTimeFromClockName(value ?? '');
  if (!parsed) return null;
  const [hourText, minuteText] = parsed.split(':');
  const minutes = Number(hourText) * 60 + Number(minuteText);
  if (!Number.isFinite(minutes)) return null;
  if (minutes >= 5 * 60 && minutes < 11 * 60) return 'Breakfast';
  if (minutes >= 11 * 60 && minutes < 14 * 60) return 'Lunch';
  if (minutes >= 14 * 60 && minutes < 17 * 60) return 'Snack';
  if (minutes >= 17 * 60 && minutes <= 23 * 60 + 59) return 'Dinner';
  return null;
}

/**
 * Breakfast / Lunch / Snack / Dinner from a clock, not from meal position.
 * Morning is 5:00–10:59, midday 11:00–13:59, afternoon 14:00–16:59.
 * A new import still treats every other parsed hour as Dinner.
 * 9:30am is Breakfast. 3:00pm is Snack.
 */
export function mealNameForPlannedTime(value: string | null | undefined): string | null {
  const parsed = parsePlannedTime(value) ?? plannedTimeFromClockName(value ?? '');
  if (!parsed) return null;
  return cleanMealBandName(parsed) ?? 'Dinner';
}

/**
 * Planned time for a newly imported meal.
 * A clock stored in `name` is the schedule and replaces `time`.
 * Otherwise keep `time`.
 */
export function legacyMealPlannedTime(meal: { name?: string | null; time?: string | null }): string | null {
  const fromName = plannedTimeFromClockName(meal.name ?? '');
  if (fromName) return fromName;
  return parsePlannedTime(meal.time) ?? plannedTimeFromClockName(meal.time ?? '');
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
  if (!trimmed || trimmed.length > 48 || isImportedJunkMealName(trimmed) || isMealPlaceholderName(trimmed)) return null;
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

/**
 * True when the label legacyMealName keeps comes from a real field
 * (meal_name, title, a slot word, or a proper name), not from a clock,
 * a height, or a Meal N placeholder.
 */
export function legacyMealNameLocked(meal: LegacyMealNameSource): boolean {
  const record = meal as LegacyMealNameSource & Record<string, unknown>;
  for (const key of LABEL_FIELDS) {
    if (usableMealLabel(record[key])) return true;
  }
  for (const key of SLOT_FIELDS) {
    if (typeof record[key] !== 'string') continue;
    if (slotLabel(record[key] as string)) return true;
  }
  return Boolean(usableMealLabel(meal.name));
}

export function renameImportedMeal(
  name: string,
  mealNumber: number,
  plannedTime: string | null
): { name: string; plannedTime: string | null } | null {
  if (isProperMealName(name)) return null;
  const currentTime = plannedTime?.trim() || null;
  const fromName = plannedTimeFromClockName(name);
  if (fromName) {
    const nextName = mealNameForPlannedTime(fromName) ?? fallbackMealNameForNumber(mealNumber);
    if (nextName === name.trim() && fromName === currentTime) return null;
    return { name: nextName, plannedTime: fromName };
  }
  if (!isImportedJunkMealName(name) && !isMealPlaceholderName(name)) return null;
  const nextName = mealNameForPlannedTime(currentTime) ?? fallbackMealNameForNumber(mealNumber);
  if (nextName === name.trim()) return null;
  return { name: nextName, plannedTime: currentTime };
}

/** Clients only. Coach, admin, and viewer accounts are left alone. */
export const IMPORTED_MEAL_RENAME_ROLE = 'USER' as const;

export function isImportedMealRenameClient(role: string): boolean {
  return role === IMPORTED_MEAL_RENAME_ROLE;
}

export type ImportedMealSlot = {
  id: string;
  name: string;
  mealNumber: number;
  plannedTime: string | null;
};

export type ImportedMealRename = {
  id: string;
  from: string;
  to: string;
  /** Set only when a clean clock rename replaces the stored time. */
  plannedTime: string | null;
};

function nameKey(value: string): string {
  return value.trim().toLowerCase();
}

function timeSortKey(value: string | null): number {
  const parsed = parsePlannedTime(value) ?? plannedTimeFromClockName(value ?? '');
  if (!parsed) return 24 * 60 + 1;
  const [hourText, minuteText] = parsed.split(':');
  return Number(hourText) * 60 + Number(minuteText);
}

function proposeCleanRename(meal: ImportedMealSlot): ImportedMealRename | null {
  const clock = plannedTimeFromClockName(meal.name);
  if (clock) {
    const band = cleanMealBandName(clock);
    if (!band) return null;
    const current = parsePlannedTime(meal.plannedTime);
    return {
      id: meal.id,
      from: meal.name,
      to: band,
      plannedTime: clock === current ? null : clock
    };
  }
  if (!isHeightMealName(meal.name) && !isMealPlaceholderName(meal.name)) return null;
  const band = cleanMealBandName(meal.plannedTime);
  if (!band) return null;
  return { id: meal.id, from: meal.name, to: band, plannedTime: null };
}

/**
 * Renames for one day or one template plan.
 * A group with no height and no clock is returned unchanged, including Meal N.
 * Proper names stay and reserve their labels, ignoring case. The earlier
 * meal being fixed keeps a free band name. Anything that would duplicate a
 * name or contradict its clock stays as stored. No Late label is invented.
 */
export function planImportedMealRenames(meals: readonly ImportedMealSlot[]): ImportedMealRename[] {
  if (!meals.some((meal) => isImportedJunkMealName(meal.name))) return [];

  const used = new Set<string>();
  for (const meal of meals) {
    if (!isProperMealName(meal.name)) continue;
    const key = nameKey(meal.name);
    if (key) used.add(key);
  }

  const order = meals
    .map((meal, index) => ({ meal, index }))
    .filter(({ meal }) => !isProperMealName(meal.name))
    .sort(
      (a, b) =>
        timeSortKey(plannedTimeFromClockName(a.meal.name) ?? a.meal.plannedTime) -
          timeSortKey(plannedTimeFromClockName(b.meal.name) ?? b.meal.plannedTime) ||
        a.meal.mealNumber - b.meal.mealNumber ||
        a.index - b.index
    );

  const changes = new Map<number, ImportedMealRename>();
  for (const { meal, index } of order) {
    const proposal = proposeCleanRename(meal);
    if (!proposal) continue;
    const key = nameKey(proposal.to);
    if (!key || used.has(key)) continue;
    used.add(key);
    changes.set(index, proposal);
  }

  return meals.flatMap((meal, index) => {
    const change = changes.get(index);
    return change ? [change] : [];
  });
}

export type DayMealLabel = {
  mealNumber: number;
  name: string;
  plannedTime: string | null;
  /** A proper name. It stays, and a meal being fixed yields instead. */
  locked?: boolean;
};

/**
 * Importer-only label when a new import would repeat a band name.
 * The rename script does not call this. It leaves the original name.
 */
function distinctLaterName(preferred: string, used: ReadonlySet<string>): string {
  const base = preferred === 'Dinner' ? 'Late snack' : `Late ${preferred.charAt(0).toLowerCase()}${preferred.slice(1)}`;
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}

/**
 * Names being fixed on one day stay unique, without touching a proper name.
 * Locked meals keep their labels and reserve them. An unlocked meal whose
 * band name is already taken gets the distinct later label instead.
 * Among unlocked meals, the earlier one keeps the band name.
 */
export function uniqueMealNamesForDay<T extends DayMealLabel>(meals: T[]): T[] {
  const used = new Set<string>();
  for (const meal of meals) {
    if (meal.locked) used.add(meal.name);
  }
  const order = meals
    .map((meal, index) => ({ meal, index }))
    .filter(({ meal }) => !meal.locked)
    .sort((a, b) => timeSortKey(a.meal.plannedTime) - timeSortKey(b.meal.plannedTime) || a.meal.mealNumber - b.meal.mealNumber || a.index - b.index);
  const names = meals.map((meal) => meal.name);
  for (const { meal, index } of order) {
    const name = used.has(meal.name) ? distinctLaterName(meal.name, used) : meal.name;
    used.add(name);
    names[index] = name;
  }
  return meals.map((meal, index) => (names[index] === meal.name ? meal : { ...meal, name: names[index] }));
}

/** Copy unique names back onto the original meals. `locked` is not stored on them. */
export function applyUniqueMealNames<T extends DayMealLabel>(meals: T[], locked: readonly boolean[]): T[] {
  const unique = uniqueMealNamesForDay(meals.map((meal, index) => ({ ...meal, locked: locked[index] ?? false })));
  return meals.map((meal, index) => (unique[index].name === meal.name ? meal : { ...meal, name: unique[index].name }));
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
