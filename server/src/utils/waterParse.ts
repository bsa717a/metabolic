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

function looksLikeWaterQuestion(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (normalized.endsWith('?')) return true;
  if (/^(how|what|when|why|where|can|should|do|does|is|are|am)\b/.test(normalized)) return true;
  if (
    /\b(how much|how many|should i|do i need|not sure|wondering|wonder if|need to know|is it enough|is that enough|tell me)\b/.test(
      normalized
    )
  ) {
    return true;
  }
  return false;
}

/** True when the message is clearly a hydration log, not a question about water. */
export function looksLikeWaterLogCommand(text: string): boolean {
  const amount = parseWaterAmountOz(text);
  if (amount == null) return false;
  if (looksLikeWaterQuestion(text)) return false;

  const normalized = text.trim().toLowerCase();
  if (/(\d+(?:\.\d+)?)\s*(?:fl\.?\s*)?(?:oz|ounce|ounces)\b/.test(normalized)) return true;
  if (/\b(\d+(?:\.\d+)?)\s*(?:ml|milliliters?|millilitre?s?|cups?)\b/.test(normalized)) return true;
  if (/\b(glass|glasses|bottle|bottles)\b/.test(normalized)) return true;
  if (/\b(add|log|logged|drank|drink|drinking|had|finished|track)\b/.test(normalized)) return true;
  return false;
}

const OTHER_SMS_ACTION =
  /\b(breakfast|lunch|dinner|snack|meal|food|exercise|workout|walk|run|complete|mark)\b/i;

/** True when the message is only a hydration log — compound requests defer to the agent. */
export function isWaterOnlySmsCommand(text: string): boolean {
  if (!looksLikeWaterLogCommand(text)) return false;

  const normalized = text.trim().toLowerCase();
  if (!/\b(and|also|plus|then)\b/.test(normalized)) return true;

  const segments = normalized.split(/\s+(?:and|also|plus|then)\s+/);
  if (segments.length <= 1) return true;

  return segments.every((segment) => {
    const trimmed = segment.trim();
    if (!trimmed) return true;
    if (parseWaterAmountOz(trimmed) != null) return true;
    return !OTHER_SMS_ACTION.test(trimmed) && !/\b(log|logged|logging|ate|eaten|had)\b/.test(trimmed);
  });
}
