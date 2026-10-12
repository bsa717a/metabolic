const WHOLE_FRUIT =
  /\b(apples?|bananas?|oranges?|pears?|peaches?|nectarines?|plums?|mangoes?|mangos?|kiwis?|grapefruits?|tangerines?|clementines?|avocados?)\b/i;

function singularUnit(unit: string) {
  const normalized = unit.trim().toLowerCase();
  if (normalized === 'oz' || normalized === 'ounce' || normalized === 'ounces') return 'oz';
  if (normalized.endsWith('s') && normalized.length > 1) return normalized.slice(0, -1);
  return normalized;
}

/** Step size for a displayed portion, or null when the stored quantity should stay as entered. */
export function portionStep(unit: string, name: string): number | null {
  const singular = singularUnit(unit);
  const food = name.trim();
  if (singular === 'oz') return 0.5;
  if (singular === 'cup') return 0.25;
  if (singular === 'slice' || singular === 'wrap' || singular === 'tortilla' || singular === 'egg') return 0.5;
  if (/\beggs?\b/i.test(food) && (singular === 'each' || singular === 'egg' || singular === '')) return 0.5;
  if (/\b(wraps?|tortillas?)\b/i.test(food)) return 0.5;
  if ((singular === 'medium' || singular === 'each' || singular === 'fruit') && WHOLE_FRUIT.test(food)) return 0.5;
  return null;
}

export function roundPortion(quantity: number, unit: string, name: string) {
  const step = portionStep(unit, name);
  if (step == null || !Number.isFinite(quantity)) return quantity;
  const places = step === 0.25 ? 2 : 1;
  return Number((Math.round(quantity / step) * step).toFixed(places));
}

export function formatPortionQuantity(quantity: number, unit: string, name: string) {
  const shown = roundPortion(quantity, unit, name);
  const step = portionStep(unit, name);
  if (step == null) {
    const trimmed = Number(shown.toFixed(3));
    return String(trimmed);
  }
  const places = step === 0.25 ? 2 : 1;
  return shown
    .toFixed(places)
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '');
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
