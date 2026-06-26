import type { Meal } from '../types';

// Parsing for the dashboard "add food" box. The first line is often a meal/time directive rather
// than a food — e.g. "I had a meal 5 at 6pm", "Lunch:", "for dinner", "1. Breakfast". We detect the
// target meal from it and strip the directive so it never gets logged as a phantom food. We only
// strip what we confidently recognize, so real foods like "breakfast burrito" or "1/4 cup rice" stay.

const MEAL_NAMES = ['breakfast', 'brunch', 'lunch', 'dinner', 'snack'] as const;
const MEAL_NAME_GROUP = MEAL_NAMES.join('|');

// "meal 5", "meal #5", "meal number 5", "to meal 2"
const MEAL_NUMBER_RE = /\bmeal\s*(?:#|number|no\.?)?\s*(\d{1,2})\b/i;
// leading "1. Breakfast" / "2) Lunch"
const LEADING_NUMBER_RE = /^(\d+)\s*[).:-]?\s*(.+)$/;
// "first snack" ... "fifth snack"
const ORDINAL_SNACK_RE = /^(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th)\s+snack\s*[).:-]?$/i;
// connector + meal name: "for lunch", "at dinner", "to my breakfast"
const CONNECTOR_MEAL_RE = new RegExp(`\\b(?:for|at|to|into|on|as)\\s+(?:my\\s+|the\\s+)?(${MEAL_NAME_GROUP})\\b`, 'i');
// meal name then a clock time: "dinner at 7pm"
const MEAL_THEN_TIME_RE = new RegExp(`\\b(${MEAL_NAME_GROUP})\\s+(?:at|around|@)?\\s*(?=\\d{1,2}\\s*(?:a\\.?m\\.?|p\\.?m\\.?)|\\d{1,2}:\\d{2})`, 'i');
// meal name as a labelled prefix: "Lunch:" / "Dinner -"
const MEAL_PREFIX_RE = new RegExp(`^(${MEAL_NAME_GROUP})\\s*[:\\-–]`, 'i');
// a clock time, requiring am/pm, a colon, or noon/midnight so bare numbers aren't treated as times
const TIME_RE = /\b(\d{1,2}):(\d{2})\s*(a\.?m\.?|p\.?m\.?)?|\b(\d{1,2})\s*(a\.?m\.?|p\.?m\.?)\b|\b(noon|midnight)\b/i;
const TIME_STRIP_RE = new RegExp(TIME_RE.source, 'gi');
// time in a directive context ("at 6pm", "around noon", "@7")
const AT_TIME_RE = new RegExp(`\\b(?:at|around|@)\\s*(?:${TIME_RE.source})`, 'i');

const FILLER_RE =
  /\b(i\s+had|i\s+ate|i\s+just\s+had|i\s+have|just\s+had|had|ate|eat(?:ing)?|log(?:ged)?|for|to|into|on|at|around|about|a|an|my|the|this|that|of)\b/gi;

function mealHintIndex(value: string): number | null {
  const map: Record<string, number> = { first: 0, '1st': 0, second: 1, '2nd': 1, third: 2, '3rd': 2, fourth: 3, '4th': 3, fifth: 4, '5th': 4 };
  if (value.toLowerCase() in map) return map[value.toLowerCase()]!;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed - 1 : null;
}

function timeToMinutes(text: string): number | null {
  const lower = text.toLowerCase();
  if (/\bnoon\b/.test(lower)) return 12 * 60;
  if (/\bmidnight\b/.test(lower)) return 0;
  const ampm = lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/);
  if (ampm) {
    let hour = Number(ampm[1]) % 12;
    if (ampm[3]!.startsWith('p')) hour += 12;
    return hour * 60 + (ampm[2] ? Number(ampm[2]) : 0);
  }
  const hhmm = lower.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (hhmm) return Number(hhmm[1]) * 60 + Number(hhmm[2]);
  return null;
}

function mealByPlannedTime(meals: Meal[], minutes: number): Meal | undefined {
  let best: Meal | undefined;
  let bestDiff = Infinity;
  for (const meal of meals) {
    const m = meal.plannedTime?.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) continue;
    const diff = Math.abs(Number(m[1]) * 60 + Number(m[2]) - minutes);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = meal;
    }
  }
  return best;
}

function mealByName(meals: Meal[], name: string): Meal | undefined {
  const lower = name.toLowerCase();
  return meals.find((meal) => meal.name.toLowerCase() === lower) ?? meals.find((meal) => meal.name.toLowerCase().includes(lower));
}

function cleanResidual(text: string): string {
  return text
    .replace(FILLER_RE, ' ')
    .replace(/[).:,;–-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

type Directive = { meal?: Meal; residual: string; consumed: boolean };

/** Pull a meal/time target out of the first line, returning the leftover food text (if any). */
export function extractMealDirective(line: string, meals: Meal[]): Directive {
  if (!line.trim()) return { residual: '', consumed: false };
  const lower = line.toLowerCase();

  const ordinal = lower.match(ORDINAL_SNACK_RE);
  if (ordinal) {
    const snacks = meals.filter((meal) => meal.name.toLowerCase().includes('snack'));
    const idx = mealHintIndex(ordinal[1]!);
    return { meal: idx == null ? undefined : snacks[idx], residual: '', consumed: true };
  }

  const leading = lower.match(LEADING_NUMBER_RE);
  if (leading) {
    const num = Number(leading[1]);
    const label = leading[2]?.trim() ?? '';
    const byNumber = meals.find((meal) => meal.mealNumber === num);
    if ((byNumber && byNumber.name.toLowerCase() === label) || (MEAL_NAMES as readonly string[]).includes(label)) {
      return { meal: byNumber, residual: '', consumed: true };
    }
  }

  let meal: Meal | undefined;
  let residual = line;
  let consumed = false;

  const strip = (re: RegExp) => {
    residual = residual.replace(re, ' ');
  };

  const numMatch = line.match(MEAL_NUMBER_RE);
  if (numMatch) {
    meal = meals.find((m) => m.mealNumber === Number(numMatch[1]));
    strip(MEAL_NUMBER_RE);
    consumed = true;
  }

  if (!meal) {
    const prefix = line.match(MEAL_PREFIX_RE);
    const connector = line.match(CONNECTOR_MEAL_RE);
    const mealThenTime = line.match(MEAL_THEN_TIME_RE);
    if (prefix) {
      meal = mealByName(meals, prefix[1]!);
      strip(MEAL_PREFIX_RE);
      consumed = true;
    } else if (connector) {
      meal = mealByName(meals, connector[1]!);
      strip(CONNECTOR_MEAL_RE);
      consumed = true;
    } else if (mealThenTime) {
      meal = mealByName(meals, mealThenTime[1]!);
      strip(MEAL_THEN_TIME_RE);
      consumed = true;
    } else if ((MEAL_NAMES as readonly string[]).includes(lower)) {
      meal = mealByName(meals, lower);
      return { meal, residual: '', consumed: true };
    }
  }

  const minutes = timeToMinutes(line);
  if (minutes != null && !meal && AT_TIME_RE.test(line)) {
    meal = mealByPlannedTime(meals, minutes);
    consumed = true;
  }

  if (!consumed) return { residual: line, consumed: false };

  // Confirmed directive line — strip any leftover time tokens and connectors before cleaning.
  if (minutes != null) {
    residual = residual.replace(/\b(?:at|around|@)\b/gi, ' ').replace(TIME_STRIP_RE, ' ');
  }
  return { meal, residual: cleanResidual(residual), consumed: true };
}

function selectSnackFallback(meals: Meal[]): Meal | undefined {
  const snacks = meals.filter((meal) => meal.name.toLowerCase().includes('snack'));
  if (snacks.length) return new Date().getHours() < 12 ? snacks[0] : snacks[1] ?? snacks[0];
  return meals[0];
}

export function parseFoodEntry(meals: Meal[], input: string, expandedMealId: string | null) {
  const lines = input
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const { meal, residual, consumed } = extractMealDirective(lines[0] ?? '', meals);
  const foodLines = consumed ? (residual ? [residual, ...lines.slice(1)] : lines.slice(1)) : lines;
  const foodText = foodLines.join('\n').trim();

  const expandedMeal = expandedMealId ? meals.find((m) => m.id === expandedMealId) : undefined;
  return { targetMeal: meal ?? expandedMeal ?? selectSnackFallback(meals), foodText };
}
