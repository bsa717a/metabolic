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

function clampHydrationGoalOz(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded < 1 || rounded > 512) return null;
  return rounded;
}

/** Recent chat is about setting/changing a daily water goal (not logging a drink). */
export function isHydrationGoalThread(messages: Array<{ content: string }>): boolean {
  const recent = messages
    .slice(-6)
    .map((message) => message.content)
    .join('\n');
  return /(?:hydration|water)\s*goal|(?:daily|typical)\s*(?:water|intake)|typical.*(?:oz|ounce)|about\s+\d+\s*oz|tell me.*(?:goal|ounces)|set.*(?:goal|target).*(?:water|hydration)|new\s*(?:goal|target)|change.*(?:water|hydration)|(?:your|current)\s*goal\s*is\s*\d+\s*oz|how\s+(?:do|can)\s+i.*(?:change|set).*(?:water|hydration)|how\s+much.*(?:water|hydration).*should\s+i\s+drink/i.test(
    recent
  );
}

/** Parse a daily water goal in oz from chat — not a one-off drink log. */
export function parseHydrationGoalOz(
  text: string,
  options?: { allowBareNumber?: boolean }
): number | null {
  const trimmed = text.trim();
  if (!trimmed || looksLikeWaterLogCommand(trimmed)) return null;

  const normalized = trimmed.toLowerCase();

  const goalVerbMatch = normalized.match(
    /(?:set|make|change|update|switch|move|raise|lower|increase|decrease|want|need|try|do|go\s+with|let'?s\s+(?:do|go\s+with|make)|please\s+set)\s*(?:it\s+to\s+|my\s+(?:water|hydration)?\s*(?:goal|target)\s+(?:to\s+)?)?(\d+(?:\.\d+)?)\s*(?:fl\.?\s*)?(?:oz|ounce|ounces)?\b/
  );
  if (goalVerbMatch) return clampHydrationGoalOz(Number(goalVerbMatch[1]));

  const ozMatch = normalized.match(
    /\b(\d+(?:\.\d+)?)\s*(?:fl\.?\s*)?(?:oz|ounce|ounces)\b(?:\s*(?:per\s+day|daily|a\s+day|for\s+my\s+(?:goal|target)|goal|target))?/
  );
  if (ozMatch && !/\b(drank|drink|log|logged|had|add|glass|bottle|cup)\b/.test(normalized)) {
    return clampHydrationGoalOz(Number(ozMatch[1]));
  }

  if (options?.allowBareNumber) {
    if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
      return clampHydrationGoalOz(Number(trimmed));
    }
    const numbers = [...normalized.matchAll(/\b(\d+(?:\.\d+)?)\b/g)].map((match) => Number(match[1]));
    const plausible = numbers.filter((value) => value >= 1 && value <= 512);
    if (plausible.length === 1) return clampHydrationGoalOz(plausible[0]!);
  }

  return null;
}
