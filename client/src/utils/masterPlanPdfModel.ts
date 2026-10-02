import { formatPlanShort, type ExercisePrescription } from './exerciseFormat';
import type { MealPlanLayout } from './mealPlanLayout';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const TRACKER_MEAL_COLUMNS = 4;

/**
 * Reserved for a future per-meal notes feature.
 * This module does not import a notes schema. Pass nothing and the tracker
 * Notes column stays blank and fillable. Pass meal notes or a day note later
 * and the same column fills in.
 */
export type TrackerNotesInput = {
  dayNote?: string | null;
  mealNotes?: ReadonlyArray<{ mealNumber: number; text?: string | null }> | null;
};

export type MasterPlanFoodInput = {
  type?: 'PLANNED' | 'ACTUAL' | string;
  quantity: number;
  unit: string;
  nameSnapshot: string;
};

export type MasterPlanMealInput = {
  mealNumber: number;
  name: string;
  items?: MasterPlanFoodInput[] | null;
};

export type MasterPlanExerciseInput = ExercisePrescription & {
  name: string;
};

export type MasterPlanDayInput = {
  date: string;
  meals?: MasterPlanMealInput[] | null;
  exercises?: MasterPlanExerciseInput[] | null;
  notes?: TrackerNotesInput | null;
};

export type MasterPlanWeekInput = {
  weekNumber: number | null;
  startDate: string;
  days?: MasterPlanDayInput[] | null;
};

export type TrackerRow = {
  day: string;
  date: string;
  exercise: string;
  notes: string;
};

export type MealSlotGroup = {
  /** Null when every day in the week shares this list. */
  label: string | null;
  lines: string[];
};

export type MealSlotSection = {
  mealNumber: number;
  title: string;
  groups: MealSlotGroup[];
};

export type MasterPlanWeekPage = {
  title: string;
  weekOfLabel: string;
  waterGoalLabel: string;
  tracker: TrackerRow[];
  exerciseKey: Array<{ key: string; name: string; prescription: string }>;
  meals: {
    layout: MealPlanLayout;
    slots: MealSlotSection[];
  };
  exercisePlan: Array<{ day: string; line: string }>;
  substitutions: string[];
  reminders: string[];
};

export type MasterPlanDocument = {
  clientName: string;
  layout: MealPlanLayout;
  waterGoalOz: number;
  weeks: MasterPlanWeekPage[];
};

export function trackerNotesText(input?: TrackerNotesInput | null): string {
  if (!input) return '';
  const mealLines = (input.mealNotes ?? [])
    .map((entry) => {
      const text = entry.text?.trim();
      if (!text) return '';
      return `Meal ${entry.mealNumber}: ${text}`;
    })
    .filter(Boolean);
  if (mealLines.length) return mealLines.join(' | ');
  return input.dayNote?.trim() ?? '';
}

export function masterPlanTitle(weekNumber: number | null, clientName: string) {
  const name = clientName.trim() || 'Client';
  const possessive = `${name}'s`;
  if (weekNumber == null) return `${possessive} Master Metabolic Plan`;
  return `Week ${weekNumber} ${possessive} Master Metabolic Plan`;
}

export function masterPlanPdfFilename(clientName: string) {
  const slug = clientName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${slug || 'client'}-master-metabolic-plan.pdf`;
}

export function formatPortion(quantity: number, unit: string, name: string) {
  const qty = Number(quantity);
  const amount = Number.isFinite(qty) ? trimNumber(qty) : String(quantity);
  const unitLabel = unit?.trim();
  return [amount, unitLabel, name.trim()].filter(Boolean).join(' ');
}

export function extractDescribedSubstitutions(description?: string | null) {
  if (!description?.trim()) return [];
  const lines: string[] = [];
  const meat = description.match(/Meat substitutions:\s*([^\n]+)/i) ?? description.match(/Meat Subs:\s*([^\n]+)/i);
  const starch = description.match(/Starch substitutions:\s*([^\n]+)/i) ?? description.match(/Starch Subs:\s*([^\n]+)/i);
  if (meat?.[1]?.trim()) lines.push(`Meat: ${meat[1].trim().replace(/[.\s]+$/, '')}.`);
  if (starch?.[1]?.trim()) lines.push(`Starch: ${starch[1].trim().replace(/[.\s]+$/, '')}.`);
  return lines;
}

export function buildSubstitutions(input: {
  dietaryPreferences?: string | null;
  planDescription?: string | null;
}) {
  const lines = extractDescribedSubstitutions(input.planDescription);
  const preferences = input.dietaryPreferences?.trim();
  if (preferences) lines.push(preferences);
  if (lines.length) return lines;
  return [
    'Protein: swap lean meat, fish, or egg whites in the same ounce amount.',
    'Starch: swap rice, potato, oats, or fruit in the same measured amount.'
  ];
}

export function buildReminders(waterGoalOz: number, foodAllergies?: string | null) {
  const goal = Number.isFinite(waterGoalOz) && waterGoalOz > 0 ? Math.round(waterGoalOz) : 64;
  const lines = [
    `Water goal ${goal} oz. Write the ounces you drink in the tracker.`,
    'Record sleep hours in the Sleep column.',
    'Measure portions as written and check off each meal.'
  ];
  const allergies = foodAllergies?.trim();
  if (allergies) lines.unshift(`Allergies: ${allergies}`);
  return lines;
}

export function masterPlanHasContent(doc: MasterPlanDocument) {
  return doc.weeks.some((week) => {
    const hasExercise = week.exercisePlan.some((day) => day.line !== 'Rest');
    const hasMeal = week.meals.slots.some((slot) =>
      slot.groups.some((group) => group.lines.some((line) => line !== 'No foods planned'))
    );
    return hasExercise || hasMeal;
  });
}

export function buildMasterPlanDocument(input: {
  clientName: string;
  layout: MealPlanLayout;
  waterGoalOz: number;
  weeks: MasterPlanWeekInput[];
  dietaryPreferences?: string | null;
  foodAllergies?: string | null;
  planDescription?: string | null;
}): MasterPlanDocument {
  const layout = input.layout === 'horizontal' ? 'horizontal' : 'vertical';
  const waterGoalOz = Number.isFinite(input.waterGoalOz) && input.waterGoalOz > 0 ? Math.round(input.waterGoalOz) : 64;
  const substitutions = buildSubstitutions(input);
  const reminders = buildReminders(waterGoalOz, input.foodAllergies);
  const clientName = input.clientName.trim() || 'Client';

  return {
    clientName,
    layout,
    waterGoalOz,
    weeks: input.weeks.map((week) =>
      buildWeekPage({
        week,
        clientName,
        layout,
        waterGoalOz,
        substitutions,
        reminders
      })
    )
  };
}

function buildWeekPage(input: {
  week: MasterPlanWeekInput;
  clientName: string;
  layout: MealPlanLayout;
  waterGoalOz: number;
  substitutions: string[];
  reminders: string[];
}): MasterPlanWeekPage {
  const days = weekDays(input.week);
  const keyed = assignExerciseKeys(days);
  const slots = mealSlots(days);

  return {
    title: masterPlanTitle(input.week.weekNumber, input.clientName),
    weekOfLabel: `Week of ${formatWeekOf(input.week.startDate)}`,
    waterGoalLabel: `Water goal ${input.waterGoalOz} oz`,
    tracker: days.map((day) => ({
      day: weekdayLabel(day.date),
      date: day.date,
      exercise: exerciseCell(day, keyed),
      notes: trackerNotesText(day.notes)
    })),
    exerciseKey: keyed.entries.map((entry) => ({
      key: entry.key,
      name: entry.name,
      prescription: entry.prescription
    })),
    meals: { layout: input.layout, slots },
    exercisePlan: days.map((day) => ({
      day: weekdayLabel(day.date),
      line: exercisePlanLine(day, keyed)
    })),
    substitutions: input.substitutions,
    reminders: input.reminders
  };
}

type KeyedExercise = { key: string; name: string; prescription: string };

function assignExerciseKeys(days: MasterPlanDayInput[]) {
  const byName = new Map<string, KeyedExercise>();
  const entries: KeyedExercise[] = [];
  for (const day of days) {
    for (const exercise of day.exercises ?? []) {
      const name = exercise.name.trim();
      if (!name || byName.has(name)) continue;
      const key = exerciseKey(entries.length);
      const entry = { key, name, prescription: formatPlanShort(exercise) };
      byName.set(name, entry);
      entries.push(entry);
    }
  }
  return { byName, entries };
}

function exerciseCell(day: MasterPlanDayInput, keyed: { byName: Map<string, KeyedExercise> }) {
  const keys = (day.exercises ?? [])
    .map((exercise) => keyed.byName.get(exercise.name.trim())?.key)
    .filter((key): key is string => Boolean(key));
  return keys.length ? keys.join(', ') : 'Rest';
}

function exercisePlanLine(day: MasterPlanDayInput, keyed: { byName: Map<string, KeyedExercise> }) {
  const parts = (day.exercises ?? [])
    .map((exercise) => {
      const name = exercise.name.trim();
      const key = keyed.byName.get(name)?.key;
      if (!name || !key) return '';
      return `${key} ${name} - ${formatPlanShort(exercise)}`;
    })
    .filter(Boolean);
  return parts.length ? parts.join('; ') : 'Rest';
}

function mealSlots(days: MasterPlanDayInput[]): MealSlotSection[] {
  const highest = days.reduce((max, day) => {
    const dayMax = (day.meals ?? []).reduce((mealMax, meal) => Math.max(mealMax, meal.mealNumber), 0);
    return Math.max(max, dayMax);
  }, 0);
  const count = Math.max(TRACKER_MEAL_COLUMNS, highest);
  return Array.from({ length: count }, (_, index) => {
    const mealNumber = index + 1;
    return {
      mealNumber,
      title: slotTitle(days, mealNumber),
      groups: groupsForSlot(days, mealNumber)
    };
  });
}

function slotTitle(days: MasterPlanDayInput[], mealNumber: number) {
  for (const day of days) {
    const meal = (day.meals ?? []).find((item) => item.mealNumber === mealNumber);
    const name = meal?.name?.trim();
    if (name) return `Meal ${mealNumber} - ${name}`;
  }
  return `Meal ${mealNumber}`;
}

function groupsForSlot(days: MasterPlanDayInput[], mealNumber: number): MealSlotGroup[] {
  const labeled = days.map((day) => {
    const meal = (day.meals ?? []).find((item) => item.mealNumber === mealNumber);
    const lines = portionLines(meal);
    return { day: weekdayLabel(day.date), lines };
  });
  const signatures = new Set(labeled.map((entry) => entry.lines.join('\n')));
  if (signatures.size <= 1) {
    const lines = labeled.find((entry) => entry.lines.length)?.lines ?? [];
    return [{ label: null, lines: lines.length ? lines : ['No foods planned'] }];
  }

  const grouped: Array<{ days: string[]; lines: string[] }> = [];
  for (const entry of labeled) {
    const signature = entry.lines.join('\n');
    const last = grouped[grouped.length - 1];
    if (last && last.lines.join('\n') === signature) last.days.push(entry.day);
    else grouped.push({ days: [entry.day], lines: entry.lines });
  }
  return grouped.map((group) => ({
    label: group.days.join(', '),
    lines: group.lines.length ? group.lines : ['No foods planned']
  }));
}

function portionLines(meal: MasterPlanMealInput | undefined) {
  return (meal?.items ?? [])
    .filter((item) => item.type == null || item.type === 'PLANNED')
    .map((item) => formatPortion(item.quantity, item.unit, item.nameSnapshot))
    .filter(Boolean);
}

function weekDays(week: MasterPlanWeekInput) {
  const start = parseDateKey(week.startDate);
  const byDate = new Map((week.days ?? []).map((day) => [day.date, day]));
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(start, index);
    return byDate.get(date) ?? { date, meals: [], exercises: [] };
  });
}

function exerciseKey(index: number) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (index < alphabet.length) return alphabet[index]!;
  return `E${index + 1}`;
}

function weekdayLabel(date: string) {
  return WEEKDAYS[parseDateKey(date).getUTCDay()] ?? 'Day';
}

function formatWeekOf(startDate: string) {
  return parseDateKey(startDate).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  });
}

function parseDateKey(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(date: Date, days: number) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function trimNumber(value: number) {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}
