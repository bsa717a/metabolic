/** An entry only counts as water if it explicitly references water/hydration. */
const WATER_SIGNAL = /\b(water|hydrate|hydration|hydrated)\b/i;
/** Foods/drinks that contain the word "water" but are not a hydration log. */
const FOOD_WATER_FALSE_POSITIVES = /\b(water chestnuts?|coconut water|water crackers?)\b/i;

export function isWaterLogRequest(text: string) {
  const trimmed = text.trim();
  if (!trimmed || trimmed.includes('\n')) return false;
  if (FOOD_WATER_FALSE_POSITIVES.test(trimmed)) return false;
  return WATER_SIGNAL.test(trimmed);
}
