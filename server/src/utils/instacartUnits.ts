export type InstacartMeasurement = {
  quantity: number;
  unit: string;
};

const UNIT_ALIASES: Record<string, string> = {
  serving: 'each',
  servings: 'each',
  item: 'each',
  items: 'each',
  piece: 'each',
  pieces: 'each',
  whole: 'each',
  unit: 'each',
  units: 'each',
  count: 'each',
  lb: 'lb',
  lbs: 'lb',
  pound: 'lb',
  pounds: 'lb',
  oz: 'ounce',
  ounce: 'ounce',
  ounces: 'ounce',
  g: 'gram',
  gs: 'gram',
  gram: 'gram',
  grams: 'gram',
  kg: 'kg',
  kgs: 'kg',
  kilogram: 'kilogram',
  kilograms: 'kilogram',
  cup: 'cup',
  cups: 'cup',
  c: 'cup',
  tbsp: 'tablespoon',
  tbs: 'tablespoon',
  tablespoon: 'tablespoon',
  tablespoons: 'tablespoon',
  tsp: 'teaspoon',
  tspn: 'teaspoon',
  teaspoon: 'teaspoon',
  teaspoons: 'teaspoon',
  ml: 'milliliter',
  mls: 'milliliter',
  milliliter: 'milliliter',
  milliliters: 'milliliter',
  millilitre: 'milliliter',
  millilitres: 'milliliter',
  l: 'liter',
  liter: 'liter',
  litre: 'liter',
  liters: 'liter',
  litres: 'liter',
  gal: 'gallon',
  gals: 'gallon',
  gallon: 'gallon',
  gallons: 'gallon',
  pt: 'pint',
  pts: 'pint',
  pint: 'pint',
  pints: 'pint',
  qt: 'quart',
  qts: 'quart',
  quart: 'quart',
  quarts: 'quart',
  bunch: 'bunch',
  bunches: 'bunch',
  can: 'can',
  cans: 'can',
  package: 'package',
  packages: 'package',
  pkg: 'package',
  head: 'head',
  heads: 'head',
  ear: 'ears',
  ears: 'ears',
  large: 'large',
  lg: 'large',
  lge: 'large',
  lrg: 'large',
  medium: 'medium',
  med: 'medium',
  md: 'medium',
  small: 'small',
  sm: 'small',
  each: 'each',
  'fl oz': 'fl oz ounce',
  floz: 'fl oz ounce',
  'fluid ounce': 'fl oz ounce',
  'fluid ounces': 'fl oz ounce'
};

const LEADING_MEASUREMENT_PATTERN =
  /^(\d+(?:\.\d+)?)\s*(lb|lbs|pound|pounds|oz|ounce|ounces|g|gram|grams|kg|kilogram|kilograms|cup|cups|c|tbsp|tbs|tablespoon|tablespoons|tsp|tspn|teaspoon|teaspoons|ml|milliliter|milliliters|l|liter|liters|litre|litres|gal|gallon|gallons|pt|pint|pints|qt|quart|quarts|dozen|bunch|bunches|can|cans|package|packages|head|heads|ear|ears|fl\s*oz|each)\b/i;

export function normalizeInstacartUnit(rawUnit: string): string {
  const trimmed = rawUnit.trim().toLowerCase();
  if (!trimmed) return 'each';
  return UNIT_ALIASES[trimmed] ?? trimmed;
}

export function normalizeInstacartQuantity(quantity: number, unit: string): InstacartMeasurement {
  const normalizedUnit = normalizeInstacartUnit(unit);
  if (normalizedUnit === 'dozen' || unit.trim().toLowerCase() === 'dozen') {
    return { quantity: Math.max(quantity, 0.01) * 12, unit: 'each' };
  }

  return {
    quantity: Math.max(quantity, 0.01),
    unit: normalizedUnit
  };
}

export function parseLeadingMeasurement(description: string): InstacartMeasurement | null {
  const match = description.trim().match(LEADING_MEASUREMENT_PATTERN);
  if (!match) return null;

  const quantity = Number(match[1]);
  if (!Number.isFinite(quantity) || quantity <= 0) return null;

  return normalizeInstacartQuantity(quantity, match[2]);
}

export function buildInstacartMeasurement(options: {
  groceryDescription: string;
  plannedQuantity: number;
  plannedUnit: string;
}): InstacartMeasurement {
  const parsed = parseLeadingMeasurement(options.groceryDescription);
  if (parsed) return parsed;

  if (options.plannedQuantity > 0 && options.plannedUnit.trim()) {
    return normalizeInstacartQuantity(options.plannedQuantity, options.plannedUnit);
  }

  return { quantity: 1, unit: 'each' };
}
