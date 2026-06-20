/** Pure SMS food-logging parsers — no I/O, safe to unit test. */

export const MEAL_NAME_PATTERN = /\b(breakfast|lunch|dinner|snack|brunch)\b/i;

const FOOD_SIGNAL_PATTERN =
  /\b(eat|ate|eaten|eating|food|meal|breakfast|brunch|lunch|dinner|snack|hungry|craving|crave|order|ordering|ordered|restaurant|menu|calories?|protein|carbs?|macros?|pizza|burger|salad|sandwich|sub|bowl|taco|burrito|sushi|steak|chicken|beef|fish|rice|pasta|eggs?|oatmeal|smoothie|shake|coffee|latte|dessert|cook|cooking|recipe|drink|drinks|grab|grabbed|peanuts?|nuts?|almonds?|yogurt|toast|bacon|sausage|waffle|pancake|fruit|veggies?|vegetables?|salmon|tuna|shrimp|turkey|pork|lamb|cheese|milk|bread|wrap|soup|chips?|cookie|brownie|ice cream|protein bar|bar)\b/i;
const PAST_FOOD_PATTERN =
  /\b(i\s+)?(just\s+)?(ate|had|grabbed|finished|devoured|demolished|chowed|scarfed|ordered|got|drank)\b/i;
export const SUGGESTION_PATTERN =
  /\b(what (?:can|should|do|could) i (?:eat|order|get|have|make)|what (?:can|should|do) you (?:suggest|recommend)|what do you (?:suggest|recommend)|where (?:can|should) i|any (?:suggestions?|ideas?|recommendations?)|should i (?:get|order|eat|have)|good options?|what'?s good|recommend|suggest)\b/i;
const AT_VENUE_PATTERN =
  /\b(i'?m|im|we'?re|were)\s+(at|going to|heading to|headed to|about to|thinking (?:about|of))\b/i;
export const META_CORRECTION_PATTERN =
  /\b(why (?:would|did)|that'?s wrong|wrong meal|not (?:for )?(?:lunch|breakfast|dinner|snack)|i said|you logged|should(?:n't| not) have|i meant|you put (?:that|it)|mislogged|should(?:'ve| have) been|should be|belongs in|move (?:that|it)|put (?:that|it) (?:on|in|to))\b/i;
export const MACRO_STATUS_PATTERN =
  /\b(what'?s left|remaining today|left today|how am i doing)\b|\b(how many|how much)\s+(calories?|protein|carbs?|macros?)\b|\b(calories?|protein|carbs?|macros?)\s+(left|remaining|do i have)\b|\bcalories?\s+remaining\b/i;

export type SmsFoodAction =
  | { intent: 'LOG_FOOD'; foodText: string; mealName?: string }
  | { intent: 'LOG_PHOTO_ESTIMATE'; mealName?: string }
  | { intent: 'MEAL_CORRECTION'; targetMealName: string }
  | { intent: 'MACRO_STATUS' }
  | { intent: null };

export type FreeformFoodRoute = 'LOG_FOOD' | 'MEAL_SUGGESTION' | null;

export function parseMealName(text: string) {
  const match = text.match(MEAL_NAME_PATTERN);
  return match?.[1];
}

/** Prefer the meal tied to for/to/at, or the one named in a correction — not the first word match. */
export function parseTargetMealFromText(text: string): string | undefined {
  const explicit = [...text.matchAll(/\b(?:for|to|at|into|on)\s+(?:my\s+)?(?:the\s+)?(breakfast|brunch|lunch|dinner|snack)\b/gi)];
  if (explicit.length) return explicit[explicit.length - 1]![1];

  const meant = text.match(
    /\b(?:should(?:'ve| have)? been|should be|meant|wanted(?: it)?(?: for)?)\s+(?:my\s+)?(breakfast|brunch|lunch|dinner|snack)\b/i
  );
  if (meant) return meant[1];

  const said = text.match(
    /\b(?:i\s+)?(?:said|had it for|wanted it for|ate it for)\s+(?:my\s+)?(breakfast|brunch|lunch|dinner|snack)\b/i
  );
  if (said) return said[1];

  return parseMealName(text);
}

export function normalizeMealNameHint(hint?: string) {
  if (!hint?.trim()) return undefined;
  return parseTargetMealFromText(hint) ?? parseMealName(hint) ?? hint.trim();
}

export function looksLikeFoodAdd(text: string) {
  if (/\b(add|log|track|record|put)\b/i.test(text) && MEAL_NAME_PATTERN.test(text)) return true;
  if (/\d+\s*(?:oz|ounce|ounces|g|gram|grams|cup|cups|tbsp|slice|slices|piece|pieces)\b/i.test(text)) return true;
  return false;
}

export function cleanFoodText(text: string) {
  return text
    .replace(/^that\s+(?:i\s+)?(?:ate|had|logged|wanted to log)\s+/i, '')
    .replace(/^i\s+(?:ate|had|wanted to log)\s+/i, '')
    .replace(/\s+along with (?:the )?(?:other )?(?:foods?|stuff|items?).*$/i, '')
    .trim();
}

export function extractFoodDescription(message: string) {
  let text = message.trim();
  text = text.replace(/\s+for\s+(breakfast|brunch|lunch|dinner|snack)\s*[.!?]?\s*$/i, '');
  text = text.replace(/^for\s+(breakfast|brunch|lunch|dinner|snack)[,:\s]+/i, '');
  text = text.replace(
    /^(?:i\s+(?:want to\s+)?)?(?:just\s+)?(?:ate|had|grabbed|finished|devoured|demolished|chowed|scarfed|ordered|got|drank|am eating|am having|having)\s+/i,
    ''
  );
  return cleanFoodText(text);
}

export function wantsMacroStatus(text: string) {
  if (SUGGESTION_PATTERN.test(text)) return false;
  if (looksLikeFoodAdd(text)) return false;
  if (PAST_FOOD_PATTERN.test(text) && FOOD_SIGNAL_PATTERN.test(text)) return false;
  return MACRO_STATUS_PATTERN.test(text);
}

export function isMealCorrectionMessage(text: string) {
  if (!META_CORRECTION_PATTERN.test(text)) return false;
  return Boolean(parseTargetMealFromText(text));
}

export function parseMealCorrectionTarget(text: string) {
  return normalizeMealNameHint(parseTargetMealFromText(text));
}

export function classifyFoodRegex(message: string): 'LOG_FOOD' | 'MEAL_SUGGESTION' | 'AMBIGUOUS' | null {
  const text = message.toLowerCase().trim();
  if (!text) return null;
  const isQuestion = text.endsWith('?') || /\?/.test(text);

  if (isMealCorrectionMessage(text)) return null;
  if (META_CORRECTION_PATTERN.test(text)) return null;
  if (looksLikeFoodAdd(text)) return 'LOG_FOOD';

  if (SUGGESTION_PATTERN.test(text)) return 'MEAL_SUGGESTION';
  if (isQuestion && FOOD_SIGNAL_PATTERN.test(text)) return 'MEAL_SUGGESTION';
  if (AT_VENUE_PATTERN.test(text)) {
    if (isQuestion || FOOD_SIGNAL_PATTERN.test(text)) return 'MEAL_SUGGESTION';
    return 'AMBIGUOUS';
  }
  if (!isQuestion && PAST_FOOD_PATTERN.test(text) && FOOD_SIGNAL_PATTERN.test(text)) return 'LOG_FOOD';
  if (FOOD_SIGNAL_PATTERN.test(text)) return 'AMBIGUOUS';
  return null;
}

/** Short follow-up after a failed log or partial message — e.g. "for breakfast" or "2 oz peanuts". */
export function isFoodLogFollowUp(message: string) {
  const text = message.trim();
  if (!text || text.length > 80) return false;
  const words = text.split(/\s+/).length;
  if (words <= 6 && parseTargetMealFromText(text)) return true;
  if (words <= 8 && looksLikeFoodAdd(text)) return true;
  if (words <= 10 && PAST_FOOD_PATTERN.test(text) && FOOD_SIGNAL_PATTERN.test(text)) return true;
  return false;
}

function isMealOnlyPhrase(text: string) {
  const trimmed = text.trim();
  return Boolean(parseTargetMealFromText(trimmed)) && trimmed.split(/\s+/).length <= 4 && !looksLikeFoodAdd(trimmed);
}

export function mergeFoodLogFollowUp(priorMessage: string, currentMessage: string) {
  const priorAction = parseFoodLogAction(priorMessage);
  const currentAction = parseFoodLogAction(currentMessage);

  const priorFood =
    priorAction.intent === 'LOG_FOOD' ? priorAction.foodText : extractFoodDescription(priorMessage);
  const currentFood =
    currentAction.intent === 'LOG_FOOD' ? currentAction.foodText : extractFoodDescription(currentMessage);

  const priorMeal =
    priorAction.intent === 'LOG_FOOD' ? priorAction.mealName : parseTargetMealFromText(priorMessage);
  const currentMeal =
    currentAction.intent === 'LOG_FOOD' ? currentAction.mealName : parseTargetMealFromText(currentMessage);

  const foodText = (currentFood && !isMealOnlyPhrase(currentFood) ? currentFood : priorFood).trim();
  const mealName = currentMeal ?? priorMeal;

  return { foodText, mealName: mealName ? normalizeMealNameHint(mealName) : undefined };
}

export function assistantResponseLooksLikeMealFailure(response: string) {
  return /already marked complete|could not find.*meal|Try texting:/i.test(response);
}

export function assistantResponseLooksLikePhotoEstimate(response: string) {
  return /^Estimated from your plate:/i.test(response) && !/Logged to/i.test(response);
}

export type StoredPhotoEstimateItem = {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export const PHOTO_ESTIMATE_INTENT_PREFIX = 'PHOTO_ESTIMATE:';
export const PHOTO_ESTIMATE_LOGGED_INTENT = 'PHOTO_ESTIMATE_LOGGED';

export function serializePhotoEstimateIntent(items: StoredPhotoEstimateItem[], mealName?: string) {
  return `${PHOTO_ESTIMATE_INTENT_PREFIX}${JSON.stringify({ items, mealName })}`;
}

export function parsePhotoEstimateIntent(intent: string | null | undefined) {
  if (!intent?.startsWith(PHOTO_ESTIMATE_INTENT_PREFIX)) return null;
  try {
    return JSON.parse(intent.slice(PHOTO_ESTIMATE_INTENT_PREFIX.length)) as {
      items: StoredPhotoEstimateItem[];
      mealName?: string;
    };
  } catch {
    return null;
  }
}

export function parsePhotoEstimateTotals(response: string) {
  const match = response.match(
    /Estimated from your plate:\s*(\d+)\s*cal,\s*(\d+)g protein,\s*(\d+)g carbs,\s*(\d+)g fat/i
  );
  if (!match) return null;
  return {
    calories: Number(match[1]),
    protein: Number(match[2]),
    carbs: Number(match[3]),
    fat: Number(match[4])
  };
}

export function parsePhotoEstimateFoodNames(response: string) {
  const match = response.match(/\bI see:\s*(.+?)\.\s*Photo estimates/i);
  if (!match) return null;
  return match[1]!
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Caption on a meal photo asks to log it, not just estimate. */
export function wantsPhotoLog(caption: string) {
  const text = caption.trim();
  if (!text) return false;
  if (/\b(log|add|track|record)\b/i.test(text) && /\b(this|that|it|photo|plate|meal)\b/i.test(text)) {
    return true;
  }
  if (/\b(log|add)\b/i.test(text) && parseTargetMealFromText(text)) return true;
  if (/\b(i\s+)?(ate|had|finished|eating)\b/i.test(text) && FOOD_SIGNAL_PATTERN.test(text)) return true;
  return false;
}

/** Follow-up text after a photo estimate — "log that for lunch". */
export function wantsLogPhotoEstimate(message: string) {
  const text = message.trim();
  if (!text) return false;
  if (looksLikeFoodAdd(text) && !/\b(that|this|it|the photo|my plate)\b/i.test(text)) return false;
  if (/\d+\s*(?:oz|ounce|ounces|g|gram|grams|cup|cups|slice|slices|piece|pieces)\b/i.test(text)) {
    return false;
  }
  if (/\b(log|add|track|record)\b/i.test(text) && /\b(that|this|it|the photo|my plate)\b/i.test(text)) {
    return true;
  }
  if (/\b(i\s+)?(ate|had|finished)\b/i.test(text) && /\b(that|this|it)\b/i.test(text)) return true;
  return false;
}

/** After a meal lookup error, only retry logging when the reply still looks like food. */
export function looksLikeFoodLogRetry(
  message: string,
  context: { priorInbound?: string; priorOutbound?: string }
) {
  if (!context.priorInbound || !assistantResponseLooksLikeMealFailure(context.priorOutbound ?? '')) {
    return false;
  }
  if (isFoodLogFollowUp(message) || looksLikeFoodAdd(message)) return true;
  return classifyFoodRegex(message) === 'LOG_FOOD';
}

export function isEffectivelyZeroCalories(calories: number, protein: number) {
  return calories <= 0 && protein <= 0;
}

export function smsZeroCalorieCheckResponse(foodLabel: string, mealName: string) {
  const label = foodLabel.trim() || 'that';
  return `That came back with 0 calories for ${label}. Did I get the food wrong? Text what you ate with an amount — like "2 oz peanuts for ${mealName.toLowerCase()}".`;
}

/** Parse "Logged to Lunch: peanuts, rice — about 322 cal" from an outbound SMS. */
export function parseLoggedFoodFromAssistantResponse(response: string) {
  const standard = response.match(/^Logged to ([^:]+):\s*(.+?)\s*(?:—|-)\s*about\s+\d/i);
  if (standard) {
    const mealName = standard[1]!.trim();
    const foodList = standard[2]!
      .trim()
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    if (!foodList.length) return null;
    return { mealName, foodNames: foodList };
  }

  const photoLogged = response.match(
    /^Estimated from your plate:.*?I see:\s*(.+?)\.\s*Photo estimates.*?Logged to ([^.]+)\./is
  );
  if (photoLogged) {
    const foodList = photoLogged[1]!
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    if (!foodList.length) return null;
    return { mealName: photoLogged[2]!.trim(), foodNames: foodList };
  }

  return null;
}

export function parseFoodLogAction(message: string): SmsFoodAction {
  if (wantsMacroStatus(message)) return { intent: 'MACRO_STATUS' };
  if (wantsLogPhotoEstimate(message)) {
    return { intent: 'LOG_PHOTO_ESTIMATE', mealName: normalizeMealNameHint(parseTargetMealFromText(message)) };
  }

  const logMatch = message.match(/\blog\s+(.+?)\s+for\s+(.+)/i);
  if (logMatch) {
    return {
      intent: 'LOG_FOOD',
      foodText: cleanFoodText(logMatch[1]),
      mealName: normalizeMealNameHint(logMatch[2])
    };
  }

  const addMatch = message.match(/\b(?:add|put)\s+(.+?)\s+to\s+(?:my\s+)?(?:the\s+)?(.+)/i);
  if (addMatch) {
    return {
      intent: 'LOG_FOOD',
      foodText: addMatch[1].trim(),
      mealName: normalizeMealNameHint(addMatch[2]) ?? normalizeMealNameHint(message)
    };
  }

  if (wantsMacroStatus(message)) return { intent: 'MACRO_STATUS' };
  if (isMealCorrectionMessage(message)) {
    const target = parseMealCorrectionTarget(message);
    if (target) return { intent: 'MEAL_CORRECTION', targetMealName: target };
  }

  return { intent: null };
}
