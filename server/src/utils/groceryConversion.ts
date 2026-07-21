const PORTION_UNITS =
  'cup|cups|c|tbsp|tablespoon|tablespoons|tbs|tsp|teaspoon|teaspoons|oz|ounce|ounces|g|gram|grams|ml|lb|lbs|pound|pounds|fl\\s*oz|slice|slices|piece|pieces|clove|cloves';

const PORTION_PREFIX = new RegExp(
  `^\\s*(\\d+\\s*\\/\\s*\\d+|\\d+\\.?\\d*|½|¼|¾)\\s*(${PORTION_UNITS})\\s+(?:of\\s+)?`,
  'i'
);

const PORTION_FROM_NAME = new RegExp(
  `^(\\d+\\s*\\/\\s*\\d+|\\d+\\.?\\d*|½|¼|¾)\\s*(${PORTION_UNITS})\\b`,
  'i'
);

const VOLUME_UNITS = new Set([
  'cup',
  'cups',
  'c',
  'tbsp',
  'tablespoon',
  'tablespoons',
  'tbs',
  'tsp',
  'teaspoon',
  'teaspoons',
  'fl oz',
  'floz',
  'fluid ounce',
  'fluid ounces',
  'pint',
  'pints',
  'pt',
  'quart',
  'quarts',
  'qt',
  'gallon',
  'gallons',
  'gal',
  'ml',
  'milliliter',
  'milliliters',
  'l',
  'liter',
  'liters'
]);

const COUNT_UNITS = new Set([
  'each',
  'piece',
  'pieces',
  'item',
  'items',
  'whole',
  'count',
  'medium',
  'large',
  'small',
  'slice',
  'slices',
  'clove',
  'cloves',
  'egg',
  'eggs'
]);

export type ShoppingListAggregateItem = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  occurrenceCount: number;
};

type CanonicalMerge = {
  mergeKey: string;
  name: string;
  quantity: number;
  unit: string;
};

function parseFraction(value: string) {
  const trimmed = value.trim();
  if (trimmed === '½') return 0.5;
  if (trimmed === '¼') return 0.25;
  if (trimmed === '¾') return 0.75;
  if (trimmed.includes('/')) {
    const [numerator, denominator] = trimmed.split('/').map(Number);
    return denominator ? numerator / denominator : Number(trimmed);
  }
  return Number(trimmed);
}

export function stripPortionFromName(name: string) {
  let cleaned = name.trim();
  while (PORTION_PREFIX.test(cleaned)) {
    cleaned = cleaned.replace(PORTION_PREFIX, '').trim();
  }
  return cleaned || name.trim();
}

function parsePortionFromName(name: string) {
  const match = name.trim().match(PORTION_FROM_NAME);
  if (!match) return null;

  return {
    amount: parseFraction(match[1]),
    unit: match[2].replace(/\s+/g, ' ')
  };
}

function normalizeUnit(unit: string) {
  return unit.toLowerCase().trim().replace(/\./g, '').replace(/\s+/g, ' ');
}

function isServingUnit(unit: string) {
  const normalized = normalizeUnit(unit);
  return normalized === 'serving' || normalized === 'servings' || normalized === 'serving(s)';
}

function normalizeCleanName(name: string) {
  return stripPortionFromName(name).toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Whole shell eggs only — not egg whites, eggplant, substitutes, etc. */
export function isWholeEggFood(name: string) {
  const cleaned = normalizeCleanName(name);
  if (!cleaned) return false;
  if (/white|plant|noodle|roll|wash|substitute|liquid|beater|eggplant|drop/.test(cleaned)) return false;
  return /^(large |medium |small |jumbo |grade [a-z] )?eggs?$/.test(cleaned);
}

function resolvePlannedAmount(name: string, quantity: number, unit: string) {
  const cleanName = stripPortionFromName(name);

  if (isServingUnit(unit)) {
    const portion = parsePortionFromName(name);
    if (portion) {
      return {
        amount: quantity * portion.amount,
        unit: portion.unit,
        cleanName
      };
    }
  }

  return { amount: quantity, unit, cleanName };
}

function toCups(quantity: number, unit: string) {
  const normalized = normalizeUnit(unit);
  if (!normalized || isServingUnit(normalized)) return null;

  switch (normalized) {
    case 'cup':
    case 'cups':
    case 'c':
      return quantity;
    case 'tbsp':
    case 'tablespoon':
    case 'tablespoons':
    case 'tbs':
      return quantity / 16;
    case 'tsp':
    case 'teaspoon':
    case 'teaspoons':
      return quantity / 48;
    case 'fl oz':
    case 'floz':
    case 'fluid ounce':
    case 'fluid ounces':
      return quantity / 8;
    case 'pint':
    case 'pints':
    case 'pt':
      return quantity * 2;
    case 'quart':
    case 'quarts':
    case 'qt':
      return quantity * 4;
    case 'gallon':
    case 'gallons':
    case 'gal':
      return quantity * 16;
    case 'ml':
    case 'milliliter':
    case 'milliliters':
      return quantity / 236.588;
    case 'l':
    case 'liter':
    case 'liters':
      return quantity * 4.227;
    case 'oz':
    case 'ounce':
    case 'ounces':
      return quantity / 8;
    default:
      return null;
  }
}

function toPounds(quantity: number, unit: string) {
  const normalized = normalizeUnit(unit);
  switch (normalized) {
    case 'lb':
    case 'lbs':
    case 'pound':
    case 'pounds':
      return quantity;
    case 'oz':
    case 'ounce':
    case 'ounces':
      return quantity / 16;
    case 'g':
    case 'gram':
    case 'grams':
      return quantity / 453.592;
    case 'kg':
    case 'kilogram':
    case 'kilograms':
      return quantity * 2.205;
    default:
      return null;
  }
}

function toFluidOunces(quantity: number, unit: string) {
  const cups = toCups(quantity, unit);
  if (cups !== null) return cups * 8;
  const pounds = toPounds(quantity, unit);
  if (pounds !== null && /oil|vinegar|dressing|sauce/.test(unit)) return null;
  return null;
}

function isLiquidFood(name: string) {
  return /milk|juice|water|broth|stock|cream|coffee|tea|wine|vinegar|oil|sauce|dressing|beverage|drink|soda|beer|yogurt|kefir|smoothie/.test(
    name.toLowerCase()
  );
}

function isLikelyLiquid(name: string, unit: string) {
  if (isLiquidFood(name)) return true;
  return VOLUME_UNITS.has(normalizeUnit(unit));
}

function formatLiquidPackages(cups: number, cleanName: string) {
  if (cups <= 0) return cleanName;
  if (cups <= 4) return `1 quart ${cleanName}`;
  if (cups <= 8) return `1 half gallon ${cleanName}`;
  if (cups <= 16) return `1 gallon ${cleanName}`;

  const gallons = Math.ceil(cups / 16);
  return `${gallons} gallon${gallons === 1 ? '' : 's'} ${cleanName}`;
}

function formatWeightPackages(pounds: number, cleanName: string) {
  const rounded = Math.max(0.5, Math.ceil(pounds * 2) / 2);
  if (rounded === 1) return `1 lb ${cleanName}`;
  return `${rounded} lb ${cleanName}`;
}

function formatEggPackages(amount: number, unit: string) {
  const normalized = normalizeUnit(unit);
  let eggCount = Math.max(1, Math.ceil(amount));

  if (normalized === 'dozen' || normalized === 'dozens') {
    eggCount = Math.max(1, Math.ceil(amount * 12));
  }

  if (eggCount >= 12) {
    const dozens = Math.ceil(eggCount / 12);
    return dozens === 1 ? '1 dozen eggs' : `${dozens} dozen eggs`;
  }

  return eggCount === 1 ? '1 egg' : `${eggCount} eggs`;
}

function formatCountPackages(amount: number, cleanName: string) {
  const count = Math.max(1, Math.ceil(amount));
  if (count === 1) return cleanName;
  return `${count} ${cleanName}`;
}

function formatBreadPackages(slices: number, cleanName: string) {
  const loaves = Math.max(1, Math.ceil(slices / 12));
  if (loaves === 1) return `1 loaf ${cleanName}`;
  return `${loaves} loaves ${cleanName}`;
}

function formatOilPackage(amount: number, unit: string, cleanName: string) {
  const flOz = toFluidOunces(amount, unit);
  if (flOz !== null && flOz > 0) {
    return flOz <= 8 ? `1 bottle ${cleanName}` : `1 bottle ${cleanName}`;
  }
  return `1 bottle ${cleanName}`;
}

function formatDryGoods(cups: number, cleanName: string, name: string) {
  const pounds = Math.max(1, Math.ceil(cups / 2));
  const container = /bean|lentil|chickpea/.test(name.toLowerCase()) ? 'can(s)' : 'lb bag';
  return `${pounds} ${container} ${cleanName}`;
}

function formatProduce(amount: number, unit: string, cleanName: string, name: string) {
  const lower = name.toLowerCase();
  const pounds = toPounds(amount, unit);

  if (pounds !== null) {
    return formatWeightPackages(pounds, cleanName);
  }

  const cups = toCups(amount, unit);
  if (cups !== null && !COUNT_UNITS.has(normalizeUnit(unit))) {
    if (/spinach|lettuce|greens|kale|arugula/.test(lower)) {
      const bags = Math.max(1, Math.ceil(cups / 4));
      return bags === 1 ? `1 bag ${cleanName}` : `${bags} bags ${cleanName}`;
    }
    return formatWeightPackages(Math.max(0.5, Math.ceil(cups / 2)), cleanName);
  }

  if (/banana|apple|avocado|onion|garlic|lemon|lime|orange|potato/.test(lower)) {
    return formatCountPackages(amount, cleanName);
  }

  return formatCountPackages(Math.max(1, Math.ceil(amount)), cleanName);
}

function formatButterPackages(amount: number, unit: string, cleanName: string) {
  // US stick = 8 tbsp = 1/2 cup = 4 oz
  const cups = toCups(amount, unit);
  let sticks: number | null = null;
  if (cups !== null) {
    sticks = cups * 2;
  } else {
    const pounds = toPounds(amount, unit);
    if (pounds !== null) sticks = pounds * 4;
  }

  if (sticks === null) return null;

  const count = Math.max(1, Math.ceil(sticks));
  if (count >= 4) {
    const pounds = Math.ceil(count / 4);
    return pounds === 1 ? `1 lb ${cleanName}` : `${pounds} lb ${cleanName}`;
  }
  return count === 1 ? `1 stick ${cleanName}` : `${count} sticks ${cleanName}`;
}

function formatPantryPackage(amount: number, unit: string, cleanName: string, name: string) {
  const lower = name.toLowerCase();
  const normalizedUnit = normalizeUnit(unit);

  if (/protein(\s+powder)?|whey|casein/.test(lower)) {
    const scoops =
      normalizedUnit === 'scoop' || normalizedUnit === 'scoops'
        ? amount
        : isServingUnit(unit)
          ? amount
          : null;
    if (scoops !== null) {
      const containers = Math.max(1, Math.ceil(scoops / 30));
      return containers === 1 ? `1 container ${cleanName}` : `${containers} containers ${cleanName}`;
    }
  }

  if (/cracker/.test(lower)) {
    const count =
      COUNT_UNITS.has(normalizedUnit) || normalizedUnit === 'cracker' || normalizedUnit === 'crackers'
        ? amount
        : null;
    if (count !== null || isServingUnit(unit)) {
      // Typical cracker box ~40–50 pieces; round up so the shopper has enough.
      const boxes = Math.max(1, Math.ceil((count ?? amount) / 45));
      return boxes === 1 ? `1 box ${cleanName}` : `${boxes} boxes ${cleanName}`;
    }
  }

  if (/\bolives?\b/.test(lower)) {
    const cups = toCups(amount, unit);
    if (cups !== null) {
      // Typical can holds ~1.5–2 cups drained olives.
      const cans = Math.max(1, Math.ceil(cups / 2));
      return cans === 1 ? `1 can ${cleanName}` : `${cans} cans ${cleanName}`;
    }
    if (COUNT_UNITS.has(normalizedUnit) || isServingUnit(unit)) {
      return `1 can ${cleanName}`;
    }
  }

  if (/peanut butter|almond butter|cashew butter|nut butter/.test(lower)) {
    return `1 jar ${cleanName}`;
  }

  if (/rice|oats|pasta|quinoa|bean|lentil|flour|sugar|cereal/.test(lower)) {
    const cups = toCups(amount, unit);
    if (cups !== null) return formatDryGoods(cups, cleanName, name);
    const pounds = toPounds(amount, unit);
    if (pounds !== null) return formatWeightPackages(pounds, cleanName);
    if (isServingUnit(unit)) {
      return `1 lb bag ${cleanName}`;
    }
  }

  return null;
}

function toEggCount(amount: number, unit: string) {
  const normalized = normalizeUnit(unit);
  if (normalized === 'dozen' || normalized === 'dozens') {
    return amount * 12;
  }
  return amount;
}

function canonicalizeForMerge(item: { name: string; quantity: number; unit: string }): CanonicalMerge {
  const resolved = resolvePlannedAmount(item.name, item.quantity, item.unit);
  const clean = normalizeCleanName(item.name);

  if (isWholeEggFood(item.name) || isWholeEggFood(resolved.cleanName)) {
    return {
      mergeKey: 'eggs',
      name: 'eggs',
      quantity: toEggCount(resolved.amount, resolved.unit),
      unit: 'egg'
    };
  }

  const cups = toCups(resolved.amount, resolved.unit);
  if (cups !== null && isLikelyLiquid(resolved.cleanName, resolved.unit)) {
    return {
      mergeKey: `${clean}\0volume`,
      name: resolved.cleanName,
      quantity: cups,
      unit: 'cup'
    };
  }

  const pounds = toPounds(resolved.amount, resolved.unit);
  if (pounds !== null) {
    return {
      mergeKey: `${clean}\0weight`,
      name: resolved.cleanName,
      quantity: pounds,
      unit: 'lb'
    };
  }

  const normalizedUnit = normalizeUnit(resolved.unit);
  if (COUNT_UNITS.has(normalizedUnit)) {
    return {
      mergeKey: `${clean}\0count`,
      name: resolved.cleanName,
      quantity: resolved.amount,
      unit: normalizedUnit === 'eggs' ? 'egg' : normalizedUnit.replace(/s$/, '') || resolved.unit
    };
  }

  return {
    mergeKey: `${clean}\0${normalizedUnit || 'unit'}`,
    name: resolved.cleanName,
    quantity: resolved.amount,
    unit: resolved.unit
  };
}

function roundQuantity(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * Merge same foods that differ only by convertible units (e.g. 6 eggs + 2 dozen eggs).
 * Re-assigns ids to 0..n-1 for downstream AI enrichment.
 */
export function consolidateShoppingListItems(items: ShoppingListAggregateItem[]): ShoppingListAggregateItem[] {
  const grouped = new Map<string, ShoppingListAggregateItem>();

  for (const item of items) {
    const canonical = canonicalizeForMerge(item);
    const existing = grouped.get(canonical.mergeKey);

    if (existing) {
      existing.quantity = roundQuantity(existing.quantity + canonical.quantity);
      existing.occurrenceCount += item.occurrenceCount;
      continue;
    }

    grouped.set(canonical.mergeKey, {
      id: '',
      name: canonical.name,
      quantity: roundQuantity(canonical.quantity),
      unit: canonical.unit,
      occurrenceCount: item.occurrenceCount
    });
  }

  return [...grouped.values()]
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) ||
        a.unit.localeCompare(b.unit, undefined, { sensitivity: 'base' })
    )
    .map((item, index) => ({ ...item, id: String(index) }));
}

function formatFromResolvedAmount(name: string, amount: number, unit: string, cleanName: string) {
  const lower = name.toLowerCase();
  const normalizedUnit = normalizeUnit(unit);

  if (isWholeEggFood(name) || isWholeEggFood(cleanName)) {
    return formatEggPackages(amount, unit);
  }

  if (/bread|baguette|sourdough|bagel|muffin|roll|bun|toast/.test(lower) && (normalizedUnit === 'slice' || normalizedUnit === 'slices')) {
    return formatBreadPackages(amount, cleanName);
  }

  if (/oil|vinegar|dressing/.test(lower) && (VOLUME_UNITS.has(normalizedUnit) || normalizedUnit.includes('oz'))) {
    return formatOilPackage(amount, unit, cleanName);
  }

  if (/\bbutter\b/.test(lower) && !/peanut|almond|cashew|nut butter/.test(lower)) {
    const butter = formatButterPackages(amount, unit, cleanName);
    if (butter) return butter;
  }

  if (/cheese|cream cheese/.test(lower)) {
    const pounds = toPounds(amount, unit);
    if (pounds !== null) {
      return formatWeightPackages(pounds, cleanName);
    }
  }

  if (/chicken|turkey|beef|steak|salmon|fish|shrimp|pork|sausage|bacon|ground/.test(lower)) {
    const pounds = toPounds(amount, unit) ?? (isServingUnit(unit) ? amount * 0.25 : null);
    if (pounds !== null) {
      return formatWeightPackages(pounds, cleanName);
    }
  }

  const pantry = formatPantryPackage(amount, unit, cleanName, name);
  if (pantry) return pantry;

  if (/spinach|lettuce|broccoli|asparagus|pepper|tomato|onion|garlic|avocado|banana|apple|berry|fruit|veget|carrot|celery|zucchini|mushroom|cucumber/.test(lower)) {
    return formatProduce(amount, unit, cleanName, name);
  }

  const cups = toCups(amount, unit);
  if (cups !== null && isLikelyLiquid(name, unit)) {
    return formatLiquidPackages(cups, cleanName);
  }

  const pounds = toPounds(amount, unit);
  if (pounds !== null) {
    return formatWeightPackages(pounds, cleanName);
  }

  if (COUNT_UNITS.has(normalizedUnit)) {
    return formatCountPackages(amount, cleanName);
  }

  if (cups !== null) {
    return formatLiquidPackages(cups, cleanName);
  }

  return `${amount} ${unit} ${cleanName}`.trim();
}

export function formatGroceryDescription(name: string, quantity: number, unit: string) {
  const resolved = resolvePlannedAmount(name, quantity, unit);
  return formatFromResolvedAmount(name, resolved.amount, resolved.unit, resolved.cleanName);
}

export function isPoorGroceryDescription(
  description: string,
  item: { name: string; quantity: number; unit: string }
) {
  const lower = description.toLowerCase();
  const rawFallback = `${item.quantity} ${item.unit} ${item.name}`.trim().toLowerCase();
  if (lower === rawFallback) return true;

  if (/grocery portion\(s\)/i.test(description)) return true;

  if (/\d+\s+(carton|cartons|package|packages|can\(s\)|lb bag)\s+.*\b(\d+\s*(cup|cups|tbsp|tsp|oz|g|ml|lb|serving))/i.test(description)) {
    return true;
  }

  if (/^\d+\s+cartons?\s+/i.test(description) && isServingUnit(item.unit)) {
    return true;
  }

  const resolved = resolvePlannedAmount(item.name, item.quantity, item.unit);
  if (isServingUnit(item.unit) && parsePortionFromName(item.name)) {
    const expected = formatGroceryDescription(item.name, item.quantity, item.unit).toLowerCase();
    if (lower !== expected && (/^\d+\s+(grocery portion|carton|serving)/i.test(description) || /^\d+\.?\d*\s+cup(s)?\s+/i.test(description))) {
      return true;
    }
  }

  return false;
}
