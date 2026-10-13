/**
 * Shared parsers for legacy daily nutrition/exercise plans.
 *
 * Source tables in the legacy MySQL dump:
 *  - nutritionPrograms.meals    -> JSON `{ "meal":   [ ... ] }`
 *  - exercisePrograms.circuits  -> JSON `{ "circuit":[ ... ] }`
 *
 * Note: legacy item macros are already portion-adjusted (per-line totals), and
 * the multiplier field is misspelled `mulipiler`.
 */

export interface LegacyMealItem {
  name?: string;
  category?: string;
  mulipiler?: string | number;
  portion_name?: string;
  calories?: string | number;
  fats?: string | number;
  carbs?: string | number;
  proteins?: string | number;
}

export interface LegacyMeal {
  mealnum?: number;
  name?: string;
  time?: string;
  notes?: string;
  items?: LegacyMealItem[];
}

export interface LegacyCircuitItem {
  name?: string;
  category?: string;
  sets?: string | number;
  reps?: string | number;
  weight?: string | number;
}

export interface LegacyCircuit {
  circuitnum?: number;
  name?: string;
  time?: string;
  notes?: string;
  items?: LegacyCircuitItem[];
}

export function parseMeals(raw: string | null | undefined): LegacyMeal[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { meal?: LegacyMeal[] };
    return Array.isArray(parsed?.meal) ? parsed.meal : [];
  } catch {
    return [];
  }
}

export function parseCircuits(raw: string | null | undefined): LegacyCircuit[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { circuit?: LegacyCircuit[] };
    return Array.isArray(parsed?.circuit) ? parsed.circuit : [];
  } catch {
    return [];
  }
}

export function mealItems(meal: LegacyMeal): LegacyMealItem[] {
  return (meal.items ?? []).filter((it): it is LegacyMealItem => Boolean(it && it.name && String(it.name).trim()));
}

export function circuitItems(circuit: LegacyCircuit): LegacyCircuitItem[] {
  return (circuit.items ?? []).filter((it): it is LegacyCircuitItem => Boolean(it && it.name && String(it.name).trim()));
}

/** Convert legacy "7:00am" / "7 PM" / "13:30" / "" into 24h "HH:MM", or null. */
export function parsePlannedTime(value: string | null | undefined): string | null {
  const raw = (value ?? '').trim().toLowerCase();
  if (!raw) return null;

  const withMeridiem = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (withMeridiem) {
    let hour = Number(withMeridiem[1]);
    const minute = withMeridiem[2] ? Number(withMeridiem[2]) : 0;
    if (hour < 1 || hour > 12 || minute > 59) return null;
    if (withMeridiem[3] === 'am') hour = hour === 12 ? 0 : hour;
    else hour = hour === 12 ? 12 : hour + 12;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  const h24 = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (h24) {
    const hour = Number(h24[1]);
    const minute = Number(h24[2]);
    if (hour > 23 || minute > 59) return null;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  return null;
}

/** Legacy multiplier ("3", ".50", "0.33") -> positive number (defaults to 1). */
export function parseQuantity(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 1;
  const n = Number(String(value).trim());
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** Sets/reps strings that may be ranges ("10-12", "8 to 10") -> first integer or null. */
export function parseIntLoose(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const m = String(value).match(/\d+/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

/** Weight ("135", "135 lbs", "bodyweight") -> positive number or null. */
export function parseWeight(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const m = String(value).match(/\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Water intake ("100 oz", "100") -> ounces, or null. */
export function parseWaterOz(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = String(value).match(/\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/** Coerce a legacy numeric-ish macro field to a finite number (defaults to 0). */
export function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = Number(String(value).trim());
  return Number.isFinite(n) ? n : 0;
}
