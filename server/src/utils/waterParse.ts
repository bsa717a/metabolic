const OZ_PER_CUP = 8;
const OZ_PER_ML = 0.033814;
const GLASS_OZ = 8;
const BOTTLE_OZ = 16;

function roundOz(value: number) {
  return Math.max(1, Math.round(value));
}

/** An entry only counts as water if it explicitly references water/hydration. */
const WATER_SIGNAL = /\b(water|hydrate|hydration|hydrated)\b/i;
/** Foods/drinks that contain the word "water" but are not a hydration log. */
const FOOD_WATER_FALSE_POSITIVES = /\b(water chestnuts?|coconut water|water crackers?)\b/i;

export function parseWaterAmountOz(text: string): number | null {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return null;
  // Require an explicit water/hydration signal so food entries are never treated as water.
  if (!WATER_SIGNAL.test(normalized)) return null;
  if (FOOD_WATER_FALSE_POSITIVES.test(normalized)) return null;

  const ozMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(?:fl\.?\s*)?(?:oz|ounce|ounces)\b/);
  if (ozMatch) return roundOz(Number(ozMatch[1]));

  const mlMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(?:ml|milliliters?|millilitre?s?)\b/);
  if (mlMatch) return roundOz(Number(mlMatch[1]) * OZ_PER_ML);

  const cupMatch = normalized.match(/(\d+(?:\.\d+)?)\s*cups?\b/);
  if (cupMatch) return roundOz(Number(cupMatch[1]) * OZ_PER_CUP);

  if (/\b(two|2)\s*(glasses|bottles)\b/.test(normalized)) {
    return /\bbottles?\b/.test(normalized) ? BOTTLE_OZ * 2 : GLASS_OZ * 2;
  }

  // Glass/bottle phrasing must win over a bare number (e.g. "1 glass of water" = 8 oz, not 1).
  if (/\bbottle\b/.test(normalized)) return BOTTLE_OZ;
  if (/\bglass\b/.test(normalized)) return GLASS_OZ;

  const bareNumberMatch = normalized.match(/\b(\d+(?:\.\d+)?)\b/);
  if (bareNumberMatch) return roundOz(Number(bareNumberMatch[1]));

  // Water mentioned with no amount — default to a glass.
  return GLASS_OZ;
}

export function isWaterLogRequest(text: string) {
  return parseWaterAmountOz(text) !== null;
}
