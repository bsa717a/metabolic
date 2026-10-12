/**
 * Display-only portion rounding. Stored quantities stay as logged.
 * Line kcal is scaled by displayed quantity / stored quantity.
 *
 * Library and plan units:
 * - 1/4: cup, pint, quart, gallon, lb
 * - 1/2: tbsp, tsp, oz, fl oz, slice, wrap, tortilla, egg, each, medium,
 *   large, small, whole, fruit, piece, item, stick, bar, cake, wedge,
 *   scoop, avocado, serving, dozen, count
 * - 1: g, ml, olive, cracker, clove, leaf, meal
 * - anything else: nearest 0.1, with a trailing .0 dropped
 */

const UNIT_ALIASES: Record<string, string> = {
  oz: 'oz',
  ounce: 'oz',
  ounces: 'oz',
  tbsp: 'tbsp',
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
  tbs: 'tbsp',
  tsp: 'tsp',
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  cup: 'cup',
  cups: 'cup',
  c: 'cup',
  'fl oz': 'fl oz',
  floz: 'fl oz',
  'fluid ounce': 'fl oz',
  'fluid ounces': 'fl oz',
  lb: 'lb',
  lbs: 'lb',
  pound: 'lb',
  pounds: 'lb',
  g: 'g',
  gram: 'g',
  grams: 'g',
  ml: 'ml',
  milliliter: 'ml',
  milliliters: 'ml',
  pint: 'pint',
  pints: 'pint',
  pt: 'pint',
  quart: 'quart',
  quarts: 'quart',
  qt: 'quart',
  gallon: 'gallon',
  gallons: 'gallon',
  gal: 'gallon',
  leaf: 'leaf',
  leaves: 'leaf',
  dozen: 'dozen',
  dozens: 'dozen'
};

const STEP_BY_UNIT: Record<string, number> = {
  cup: 0.25,
  pint: 0.25,
  quart: 0.25,
  gallon: 0.25,
  lb: 0.25,
  tbsp: 0.5,
  tsp: 0.5,
  oz: 0.5,
  'fl oz': 0.5,
  slice: 0.5,
  wrap: 0.5,
  tortilla: 0.5,
  egg: 0.5,
  each: 0.5,
  medium: 0.5,
  large: 0.5,
  small: 0.5,
  whole: 0.5,
  fruit: 0.5,
  piece: 0.5,
  item: 0.5,
  stick: 0.5,
  bar: 0.5,
  cake: 0.5,
  wedge: 0.5,
  scoop: 0.5,
  avocado: 0.5,
  serving: 0.5,
  dozen: 0.5,
  count: 0.5,
  g: 1,
  ml: 1,
  olive: 1,
  cracker: 1,
  clove: 1,
  leaf: 1,
  meal: 1
};

const UNKNOWN_STEP = 0.1;

function canonicalUnit(unit: string) {
  const normalized = unit.trim().toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ');
  if (!normalized) return '';
  if (UNIT_ALIASES[normalized]) return UNIT_ALIASES[normalized];
  if (normalized.endsWith('s') && normalized.length > 2) {
    const singular = normalized.slice(0, -1);
    if (UNIT_ALIASES[singular]) return UNIT_ALIASES[singular];
    if (STEP_BY_UNIT[singular] != null) return singular;
    return singular;
  }
  return normalized;
}

/** Step size for a displayed portion. Unknown units use a tenth. */
export function portionStep(unit: string, name: string): number {
  const canonical = canonicalUnit(unit);
  const food = name.trim();
  if (!canonical && /\beggs?\b/i.test(food)) return 0.5;
  return STEP_BY_UNIT[canonical] ?? UNKNOWN_STEP;
}

function decimalPlaces(step: number) {
  if (step >= 1) return 0;
  if (step === 0.25) return 2;
  return 1;
}

export function roundPortion(quantity: number, unit: string, name: string) {
  if (!Number.isFinite(quantity)) return quantity;
  const step = portionStep(unit, name);
  const places = decimalPlaces(step);
  return Number((Math.round(quantity / step) * step).toFixed(places));
}

function trimDecimal(value: string) {
  return value.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

export function formatPortionQuantity(quantity: number, unit: string, name: string) {
  const shown = roundPortion(quantity, unit, name);
  const places = decimalPlaces(portionStep(unit, name));
  return trimDecimal(shown.toFixed(places));
}

export function formatPortion(quantity: number, unit: string, name: string) {
  const amount = formatPortionQuantity(quantity, unit, name);
  const label = unit.trim();
  return label ? `${amount} ${label}` : amount;
}

export type PortionMacros = {
  quantity: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

/** Scale stored macros so the kcal matches the rounded portion shown on the card. */
export function displayPortionMacros(
  item: { quantity: number; unit: string; name: string; calories: number; protein: number; carbs: number; fat: number }
): PortionMacros {
  const stored = Number(item.quantity);
  const quantity = roundPortion(stored, item.unit, item.name);
  const factor = stored > 0 && Number.isFinite(stored) ? quantity / stored : 1;
  return {
    quantity,
    calories: Number(item.calories) * factor,
    protein: Number(item.protein) * factor,
    carbs: Number(item.carbs) * factor,
    fat: Number(item.fat) * factor
  };
}
