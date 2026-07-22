import { MealStatus, HydrationSource, SmsDirection } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { getTodayDashboard } from './dashboardService.js';
import { markAllPlannedExercisesDone, markDone } from './exerciseService.js';
import { addMealItem, getMealsForDate, markMealEatenAsPlanned, moveMealItemsToMeal, updateMealItem } from './nutritionService.js';
import { chatWithSmsAssistant, suggestMealOptions } from './assistantService.js';
import { toDateKey, userDayKey, localTimeParts, parseDateParam, addUtcDays } from '../utils/dates.js';
import { resolveNextMeal } from '../utils/meals.js';
import { getAiProvider, type ChatMessage, type MealSuggestionResult } from './aiService.js';
import { lookupFood, lookupFoodFromImage, lookupHasRoughEstimate, summarizeFoodLookup, type FoodLookupResult } from './foodLookupService.js';
import { env } from '../config/env.js';
import { sendOutboundMessage, isTwilioConfigured, type TwilioMessageChannel } from './twilioOutboundService.js';
import { runSmsAgentEntry } from './smsAgentService.js';
import { ensureDailyLogByUserId, ensureSelfDirectedProgram } from './dailyLogService.js';
import { logWater, getHydrationSummary } from './hydrationService.js';
import { loadPersonalizedHydrationGuidance } from './hydrationGuidance.js';
import { getPlanStatus } from './planStatusService.js';
import { parseWaterAmountOz } from '../utils/waterParse.js';
import { n, round } from '../utils/numbers.js';
import { normalizePhone, phonesMatch } from '../utils/phone.js';
import {
  assistantResponseLooksLikeMealFailure,
  assistantResponseLooksLikePhotoEstimate,
  classifyFoodRegex,
  extractFoodDescription,
  isFoodLogFollowUp,
  looksLikeFoodAdd,
  looksLikeFoodLogRetry,
  mergeFoodLogFollowUp,
  normalizeMealNameHint,
  parseMealInfoQuery,
  parseInfoDomain,
  parseFoodLogAction,
  parsePhotoEstimateFoodNames,
  parseLoggedFoodFromAssistantResponse,
  parsePhotoEstimateIntent,
  parseStoredPhotoEstimate,
  parsePhotoEstimateTotals,
  serializePhotoEstimateIntent,
  PHOTO_ESTIMATE_LOGGED_INTENT,
  type StoredPhotoEstimateItem,
  parseMealName,
  parseTargetMealFromText,
  isEffectivelyZeroCalories,
  isMarkMealAsPlannedMessage,
  smsZeroCalorieCheckResponse,
  wantsPhotoLog
} from '../utils/smsFoodParse.js';
import {
  smsHelpResponseMessage,
  smsNoAccountResponseMessage,
  smsOptInConfirmationMessage,
  smsOptOutConfirmationMessage
} from '../utils/smsCompliance.js';

export type SmsIntent =
  | 'MARK_ALL_EXERCISES_DONE'
  | 'MARK_EXERCISE_DONE'
  | 'MARK_MEAL_COMPLETE'
  | 'LOG_FOOD'
  | 'LOG_PHOTO_ESTIMATE'
  | 'LOG_WATER'
  | 'MEAL_CORRECTION'
  | 'MACRO_STATUS'
  | 'MEAL_SUGGESTION'
  | 'FOOD_PHOTO'
  | 'AI_CHAT';

/** Result of routing a free-form (non-command) text message. null means general AI chat. */
type FreeformFoodRoute = 'LOG_FOOD' | 'MEAL_SUGGESTION' | null;

const SMS_MAX_LENGTH = 1500;

/** Thrown for user-facing SMS copy that should not be wrapped in a generic error prefix. */
export class SmsResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SmsResponseError';
  }
}

export function capSms(text: string) {
  const trimmed = text.trim();
  if (trimmed.length <= SMS_MAX_LENGTH) return trimmed;
  return `${trimmed.slice(0, SMS_MAX_LENGTH - 1)}…`;
}

type SmsAction =
  | { intent: 'MARK_ALL_EXERCISES_DONE' }
  | { intent: 'MARK_EXERCISE_DONE'; exerciseName?: string }
  | { intent: 'MARK_MEAL_COMPLETE'; mealName?: string }
  | { intent: 'LOG_FOOD'; foodText: string; mealName?: string }
  | { intent: 'LOG_PHOTO_ESTIMATE'; mealName?: string }
  | { intent: 'MEAL_CORRECTION'; targetMealName: string }
  | { intent: 'MACRO_STATUS' }
  | { intent: 'LOG_WATER'; text: string; amountOz: number }
  | { intent: null };

const MEAL_NAME_PATTERN = /\b(breakfast|lunch|dinner|snack|brunch)\b/i;
const EXERCISE_COMPLETE_PATTERN = /\b(done|complete|completed|finished|check(?:ed)?\s+off)\b/i;
const SUPPORTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif'
]);
const MAX_SMS_IMAGE_BYTES = 10 * 1024 * 1024;
/** Keep under Twilio's 15s webhook budget once media download + ack are done. */
const FOOD_PHOTO_TIMEOUT_MS = 12_000;
const PHOTO_PROCESSING_ACK = 'Got your photo — estimating calories now. I will text you in a moment.';

export type SmsMedia = {
  url: string;
  mimeType?: string;
  accountSid?: string;
};

export type DownloadedSmsImage = {
  data: string;
  mimeType: string;
};

export type HandleSmsResult = {
  inbound?: Awaited<ReturnType<typeof prisma.smsMessage.create>>;
  response: string;
  /** Finish photo analysis after the webhook response is sent (Cloud Run keeps the request alive). */
  deferredWork?: () => Promise<void>;
};

export type SmsUser = NonNullable<Awaited<ReturnType<typeof prisma.user.findFirst>>>;

async function findUserBySmsPhone(phone: string) {
  const normalized = normalizePhone(phone);
  const exact = await prisma.user.findFirst({ where: { phone: normalized } });
  if (exact) return exact;

  const digits = normalized.replace(/\D/g, '');
  if (digits.length < 10) return null;

  const variants = new Set<string>([normalized]);
  if (digits.length === 11 && digits.startsWith('1')) {
    variants.add(digits.slice(1));
    variants.add(`+${digits}`);
  }
  if (digits.length === 10) {
    variants.add(digits);
    variants.add(`+1${digits}`);
  }

  for (const variant of variants) {
    const user = await prisma.user.findFirst({ where: { phone: variant } });
    if (user) return user;
  }

  const users = await prisma.user.findMany({
    where: { phone: { not: null } },
    take: 500
  });
  return users.find((candidate) => phonesMatch(candidate.phone, normalized)) ?? null;
}

function smsKeyword(message: string) {
  return message.trim().toUpperCase();
}

function isSmsStartKeyword(message: string) {
  return ['START', 'UNSTOP'].includes(smsKeyword(message));
}

function isSmsHelpKeyword(message: string) {
  return ['HELP', 'INFO'].includes(smsKeyword(message));
}

function isSmsStopKeyword(message: string) {
  return ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'OPTOUT', 'REVOKE'].includes(smsKeyword(message));
}

function smsOptInResponse() {
  return smsOptInConfirmationMessage();
}

function smsHelpResponse() {
  return smsHelpResponseMessage();
}

function smsOptOutResponse() {
  return smsOptOutConfirmationMessage();
}

function wantsMarkMealComplete(text: string) {
  if (isMarkMealAsPlannedMessage(text)) return true;
  if (looksLikeFoodAdd(text)) return false;
  if (/\bmeal\b/i.test(text) && /\b(complete|completed|done|eaten|as planned)\b/i.test(text)) return true;
  if (/\bmark\b.*\b(breakfast|lunch|dinner|snack|brunch)\b/i.test(text)) return true;
  if (/\b(ate|finished|completed|done with)\b.*\b(this )?(my )?(breakfast|lunch|dinner|snack|meal)\b/i.test(text)) return true;
  return false;
}

function wantsMarkAllExercises(text: string) {
  if (/\bmark\b.*\b(all|every)\b.*\b(exercise|workout)/i.test(text)) return true;
  if (/\bmark\b.*\b(exercise )?list\b.*\b(as )?(done|complete)/i.test(text)) return true;
  if (/\b(all|every)\b.*\b(exercise|workout)s?\b.*\b(done|complete|finished)/i.test(text)) return true;
  if (/\b(i'?ve?|i have|i)\b.*\b(done|finished|completed)\b.*\b(all|every)\b.*\b(exercise|workout)/i.test(text)) return true;
  if (/\b(i'?ve?|i have|i)\b.*\b(done|finished|completed)\b.*\b(all of )?(the )?(my )?(exercise|workout)/i.test(text)) return true;
  return false;
}

function parseExerciseNameFromMarkDone(text: string) {
  const markMatch = text.match(/\bmark\s+(.+?)\s+(?:as\s+)?(?:done|complete(?:d)?|finished)\b/i);
  if (markMatch) {
    const name = markMatch[1].trim();
    if (!/^(all|every|exercise|workout|the|my|this|it)$/i.test(name) && !/^(all|every)\b/i.test(name)) {
      return name;
    }
  }

  if (/\bmark\s+(?:as\s+)?(?:done|complete(?:d)?|finished)\b/i.test(text)) return undefined;

  const finishedMatch = text.match(/\b(?:finished|completed|did)\s+(?:my\s+|the\s+)?(.+?)(?:\s+(?:exercise|workout))?\.?$/i);
  if (finishedMatch) return finishedMatch[1].trim();

  const namedMatch = text.match(/\b(.+?)\s+(?:is\s+)?(?:done|complete(?:d)?|finished)\b/i);
  if (namedMatch) {
    const name = namedMatch[1].trim();
    if (!/^(i|it|that|this|all|everything|mark)$/i.test(name) && !MEAL_NAME_PATTERN.test(name)) {
      return name;
    }
  }

  const checkOffMatch = text.match(/\bcheck(?:ed)?\s+off\s+(.+?)(?:\s+(?:exercise|workout))?\.?$/i);
  if (checkOffMatch) return checkOffMatch[1].trim();

  return undefined;
}

function wantsMarkExerciseDone(text: string) {
  if (wantsMarkMealComplete(text)) return false;
  if (/\bmeal\b/i.test(text) && !/\b(exercise|workout|walk|run|lift)\b/i.test(text)) return false;

  if (/\bmark\b/i.test(text) && EXERCISE_COMPLETE_PATTERN.test(text)) {
    if (wantsMarkAllExercises(text)) return false;
    return true;
  }

  if (/\b(finished|completed|did)\b/i.test(text) && !MEAL_NAME_PATTERN.test(text) && !/\bmeal\b/i.test(text)) {
    return true;
  }

  const namedCompleteMatch = text.match(/\b([a-z][\w\s]{2,}?)\s+(?:is\s+)?(?:done|complete(?:d)?|finished)\b/i);
  if (namedCompleteMatch && !MEAL_NAME_PATTERN.test(text) && !/\bmeal\b/i.test(text)) {
    const prefix = namedCompleteMatch[1].trim();
    if (!/^(i|it|that|this|all|everything|not|you|are|we|they|am|im|i'm)$/i.test(prefix)) {
      return true;
    }
  }

  return false;
}

/** Detects SMS actions that write to the database. Everything else goes to AI. */
export function parseSmsAction(message: string): SmsAction {
  const text = message.toLowerCase().trim();

  const foodAction = parseFoodLogAction(message);
  if (foodAction.intent === 'LOG_FOOD') {
    return {
      intent: 'LOG_FOOD',
      foodText: foodAction.foodText,
      mealName: foodAction.mealName
    };
  }
  if (foodAction.intent === 'LOG_PHOTO_ESTIMATE') {
    return { intent: 'LOG_PHOTO_ESTIMATE', mealName: foodAction.mealName };
  }
  if (foodAction.intent === 'MEAL_CORRECTION') {
    return { intent: 'MEAL_CORRECTION', targetMealName: foodAction.targetMealName };
  }
  if (foodAction.intent === 'MACRO_STATUS') return { intent: 'MACRO_STATUS' };

  const waterAmount = parseWaterAmountOz(message);
  if (waterAmount != null) {
    return { intent: 'LOG_WATER', text: message.trim(), amountOz: waterAmount };
  }

  if (wantsMarkAllExercises(text)) return { intent: 'MARK_ALL_EXERCISES_DONE' };

  if (wantsMarkMealComplete(text)) {
    return { intent: 'MARK_MEAL_COMPLETE', mealName: parseTargetMealFromText(text) ?? parseMealName(text) };
  }

  if (wantsMarkExerciseDone(text)) {
    return { intent: 'MARK_EXERCISE_DONE', exerciseName: parseExerciseNameFromMarkDone(text) };
  }

  return { intent: null };
}


/** Routes free-form text: regex first, AI fallback only when ambiguous. */
async function classifyFreeformFood(message: string): Promise<FreeformFoodRoute> {
  const regex = classifyFoodRegex(message);
  if (regex === 'LOG_FOOD' || regex === 'MEAL_SUGGESTION') return regex;
  if (regex === 'AMBIGUOUS') {
    try {
      const ai = await getAiProvider().classifyNutritionIntent(message);
      if (ai === 'LOG') return 'LOG_FOOD';
      if (ai === 'SUGGEST') return 'MEAL_SUGGESTION';
    } catch {
      // fall through to general chat on classifier failure
    }
  }
  return null;
}

type RecentSmsContext = {
  priorInbound?: string;
  priorOutbound?: string;
};

async function loadRecentSmsContext(userId: string, phone: string): Promise<RecentSmsContext> {
  const rows = await prisma.smsMessage.findMany({
    where: { userId, phone },
    orderBy: { createdAt: 'desc' },
    take: 4
  });

  const priorInbound = rows.find((row) => row.direction === SmsDirection.INBOUND)?.message ?? undefined;
  const priorOutbound = rows.find((row) => row.direction === SmsDirection.OUTBOUND)?.response ?? undefined;
  return { priorInbound, priorOutbound };
}

function resolveFreeformFoodLog(message: string, context: RecentSmsContext) {
  if (
    context.priorInbound &&
    (isFoodLogFollowUp(message) || assistantResponseLooksLikeMealFailure(context.priorOutbound ?? ''))
  ) {
    const merged = mergeFoodLogFollowUp(context.priorInbound, message);
    if (merged.foodText) {
      return {
        foodText: merged.foodText,
        mealName: merged.mealName ?? normalizeMealNameHint(parseTargetMealFromText(message))
      };
    }
  }

  return {
    foodText: extractFoodDescription(message),
    mealName: normalizeMealNameHint(parseTargetMealFromText(message))
  };
}

export async function loadSmsChatHistory(userId: string, phone: string, limit = 8): Promise<ChatMessage[]> {
  const rows = await prisma.smsMessage.findMany({
    where: { userId, phone },
    orderBy: { createdAt: 'desc' },
    take: limit * 2
  });

  const messages: ChatMessage[] = [];
  for (const row of rows.reverse()) {
    if (row.direction === SmsDirection.INBOUND) {
      messages.push({ role: 'user', content: row.message });
    } else if (row.response) {
      messages.push({ role: 'assistant', content: row.response });
    }
  }
  return messages;
}

function findPlannedExercise(
  exercises: Awaited<ReturnType<typeof getTodayDashboard>>['exercises'],
  exerciseName?: string
) {
  const planned = exercises.filter((exercise) => exercise.status === 'PLANNED');
  if (!exerciseName) return planned[0];

  const query = exerciseName.toLowerCase();
  return planned.find((entry) => entry.exercise.name.toLowerCase().includes(query));
}

function findMealToMark(
  meals: Awaited<ReturnType<typeof getTodayDashboard>>['meals'],
  mealName?: string
) {
  const incomplete = meals
    .filter((meal) => !['EATEN_AS_PLANNED', 'SKIPPED', 'MISSED'].includes(meal.status))
    .sort((a, b) => a.mealNumber - b.mealNumber);
  if (!mealName) return incomplete[0];

  const query = mealName.toLowerCase();
  return incomplete.find((meal) => meal.name.toLowerCase().includes(query));
}

function findAnyMealByName(meals: Array<{ name: string; status: string }>, mealName?: string) {
  if (!mealName) return undefined;
  const query = mealName.toLowerCase();
  return meals.find((meal) => meal.name.toLowerCase().includes(query));
}

function smsLogFoodExamples(mealLabel?: string) {
  const meal = (mealLabel ?? 'lunch').toLowerCase();
  return `Try texting: "Add 2 oz peanuts to ${meal}", "Log chicken and rice for ${meal}", or "I had a protein shake for ${meal}".`;
}

function smsMealLookupFailureResponse(
  mealName: string,
  meals: Array<{ name: string; status: string }>,
  purpose: 'log' | 'mark_complete'
) {
  const label = normalizeMealNameHint(mealName) ?? mealName;
  const existing = findAnyMealByName(meals, label);

  if (existing && ['EATEN_AS_PLANNED', 'SKIPPED', 'MISSED'].includes(existing.status)) {
    if (existing.status === 'EATEN_AS_PLANNED') {
      const lead =
        purpose === 'mark_complete'
          ? `${existing.name} is already marked complete.`
          : `${existing.name} is already marked complete, but you can still add food to it.`;
      return capSms(`${lead} ${smsLogFoodExamples(existing.name.toLowerCase())} Text HELP for more commands.`);
    }
    const statusLabel = existing.status === 'SKIPPED' ? 'skipped' : 'missed';
    return capSms(
      `${existing.name} is marked ${statusLabel} today. ${smsLogFoodExamples(label)} Text HELP for more commands.`
    );
  }

  const lead =
    purpose === 'mark_complete'
      ? `I could not find an open meal matching "${label}".`
      : `I could not find "${label}" on today's meals.`;
  return capSms(`${lead} ${smsLogFoodExamples(label)} Text HELP for more commands.`);
}

function pickEncouragement() {
  const lines = [
    'Way to go on sticking to the plan!',
    'Nice work — keep that momentum going.',
    'That is a win. Stack another one tomorrow.',
    'Love the consistency. Keep showing up.'
  ];
  return lines[Math.floor(Math.random() * lines.length)];
}

export type WriteAction = Exclude<
  SmsAction,
  | { intent: null }
  | { intent: 'LOG_FOOD' }
  | { intent: 'LOG_PHOTO_ESTIMATE' }
  | { intent: 'MEAL_CORRECTION' }
  | { intent: 'MACRO_STATUS' }
>;

export async function handleWriteAction(userId: string, dateKey: string, timeZone: string | null, action: WriteAction) {
  const dashboard = await getTodayDashboard(userId, dateKey, timeZone);
  const todayKey = dashboard.dailyLog ? toDateKey(dashboard.dailyLog.date) : dateKey;

  if (action.intent === 'MARK_ALL_EXERCISES_DONE') {
    const completed = await markAllPlannedExercisesDone(userId, todayKey);
    if (!completed.length) return 'No planned exercises left today.';
    return `Marked done: ${completed.join(', ')}. ${pickEncouragement()}`;
  }

  if (action.intent === 'MARK_EXERCISE_DONE') {
    const next = findPlannedExercise(dashboard.exercises, action.exerciseName);
    if (!next) {
      return action.exerciseName
        ? `I could not find a planned exercise matching "${action.exerciseName}".`
        : 'No planned exercises left today.';
    }
    await markDone(userId, next.id);
    const remaining = dashboard.exercises.filter((exercise) => exercise.status === 'PLANNED').length - 1;
    const cheer = remaining === 0 ? pickEncouragement() : 'One down — keep going.';
    return `Marked ${next.exercise.name} done. ${cheer}`;
  }

  if (action.intent === 'MARK_MEAL_COMPLETE') {
    const meal = findMealToMark(dashboard.meals, action.mealName);
    if (!meal) {
      if (action.mealName) {
        return smsMealLookupFailureResponse(action.mealName, dashboard.meals, 'mark_complete');
      }
      return capSms(`No meals left to mark complete today. ${smsLogFoodExamples()} Text HELP for more commands.`);
    }
    await markMealEatenAsPlanned(userId, meal.id);
    const updated = await getTodayDashboard(userId, dateKey, timeZone);
    const nextMeal = updated.nextMeal;
    const nextPart = nextMeal
      ? ` Next up: ${nextMeal.name}${nextMeal.plannedTime ? ` at ${nextMeal.plannedTime}` : ''}.`
      : ' All meals are complete for today.';
    return `Got it — ${meal.name} marked as eaten as planned. You have ${updated.summary?.caloriesRemaining ?? 0} calories and ${updated.summary?.proteinRemaining ?? 0}g protein remaining.${nextPart} ${pickEncouragement()}`;
  }

  if (action.intent === 'LOG_WATER') {
    const result = await logWater(userId, {
      amountOz: action.amountOz,
      text: action.text,
      source: HydrationSource.SMS
    });
    const remaining = Math.max(result.targetOz - result.actualOz, 0);
    if (result.goalMet) {
      return `Logged ${result.amountOz} oz water. Daily goal reached — ${result.actualOz}/${result.targetOz} oz. ${pickEncouragement()}`;
    }
    return `Logged ${result.amountOz} oz water. ${result.actualOz}/${result.targetOz} oz today (${remaining} oz to go).`;
  }

  throw new Error('Unsupported SMS write action.');
}

/** Resolves which meal to log into: a named meal, the next open meal, the last meal, or a new one. */
async function resolveTargetMeal(userId: string, dateKey: string, mealNameHint?: string, timeZone?: string | null) {
  // "Just log food" with no plan: provision a self-directed tracking program so the log lands,
  // rather than erroring. No-op for users who already have an active (coached or self-directed) program.
  let log = await ensureDailyLogByUserId(userId, dateKey);
  if (!log) {
    await ensureSelfDirectedProgram(userId);
    log = await ensureDailyLogByUserId(userId, dateKey);
  }
  if (!log) throw new Error('No active program found for today.');

  const meals = await prisma.meal.findMany({
    where: { dailyLogId: log.id },
    include: { items: true },
    orderBy: { mealNumber: 'asc' }
  });

  if (mealNameHint) {
    const normalized = normalizeMealNameHint(mealNameHint) ?? mealNameHint;
    const named = meals.find((meal) => meal.name.toLowerCase().includes(normalized.toLowerCase()));
    if (named) return named;
    // Slot words (breakfast/lunch/dinner) that don't match a dish-named meal — resolve by time only.
    const slotMatch = matchMealForRead(meals, mealNameHint, { strictSlot: true });
    if (slotMatch) return slotMatch;
    throw new SmsResponseError(smsMealLookupFailureResponse(normalized, meals, 'log'));
  }

  const minutesOfDay = timeZone ? localTimeParts(timeZone).minutesOfDay : undefined;
  return (
    resolveNextMeal(meals, minutesOfDay) ??
    meals[meals.length - 1] ??
    prisma.meal.create({
      data: {
        dailyLogId: log.id,
        userId,
        mealNumber: 1,
        name: 'Additional food',
        status: MealStatus.UNPLANNED
      },
      include: { items: true }
    })
  );
}

/** Logs every existing/AI food from a lookup result into the meal as ACTUAL items. */
async function logLookupResultToMeal(userId: string, mealId: string, result: FoodLookupResult) {
  const names: string[] = [];
  let calories = 0;
  let protein = 0;
  let lastItemId: string | undefined;

  for (const item of result.items) {
    if (item.source === 'ai') {
      const estimate = item.estimate;
      const created = await addMealItem(userId, mealId, {
        type: 'ACTUAL',
        nameSnapshot: estimate.normalizedFoodName,
        quantity: 1,
        unit: 'serving',
        calories: estimate.calories,
        protein: estimate.protein,
        carbs: estimate.carbs,
        fat: estimate.fat
      });
      lastItemId = created.id;
      names.push(estimate.normalizedFoodName);
      calories += estimate.calories;
      protein += estimate.protein;
    } else {
      const food = item.food;
      const created = await addMealItem(userId, mealId, {
        foodId: food.id,
        type: 'ACTUAL',
        nameSnapshot: food.name,
        quantity: 1,
        unit: food.servingUnit,
        calories: n(food.calories),
        protein: n(food.protein),
        carbs: n(food.carbs),
        fat: n(food.fat)
      });
      lastItemId = created.id;
      names.push(food.name);
      calories += n(food.calories);
      protein += n(food.protein);
    }
  }

  return { count: names.length, names, calories, protein, lastItemId };
}

function photoEstimateItemsFromResult(result: FoodLookupResult): StoredPhotoEstimateItem[] {
  return result.items
    .filter((item) => item.source === 'ai')
    .map((item) => ({
      name: item.estimate.normalizedFoodName,
      calories: item.estimate.calories,
      protein: item.estimate.protein,
      carbs: item.estimate.carbs,
      fat: item.estimate.fat
    }));
}

async function logPhotoEstimateItems(userId: string, mealId: string, items: StoredPhotoEstimateItem[]) {
  const names: string[] = [];
  let calories = 0;
  let protein = 0;

  for (const estimate of items) {
    await addMealItem(userId, mealId, {
      type: 'ACTUAL',
      nameSnapshot: estimate.name,
      quantity: 1,
      unit: 'serving',
      calories: estimate.calories,
      protein: estimate.protein,
      carbs: estimate.carbs,
      fat: estimate.fat
    });
    names.push(estimate.name);
    calories += estimate.calories;
    protein += estimate.protein;
  }

  return { count: names.length, names, calories, protein };
}

function buildLoggedFoodResponse(mealName: string, names: string[], calories: number, protein: number, dateKey: string, timeZone: string | null, userId: string) {
  return getTodayDashboard(userId, dateKey, timeZone).then((dashboard) => {
    const caloriesRemaining = Math.max(0, Math.round(dashboard.summary?.caloriesRemaining ?? 0));
    const proteinRemaining = Math.max(0, Math.round(dashboard.summary?.proteinRemaining ?? 0));
    const foodList = names.join(', ');
    return capSms(
      `Logged to ${mealName}: ${foodList} — about ${Math.round(calories)} cal and ${Math.round(
        protein
      )}g protein. You have ${caloriesRemaining} cal and ${proteinRemaining}g protein left today. ${pickEncouragement()}`
    );
  });
}

async function findLastSmsLoggedBatch(userId: string, phone: string, dateKey: string) {
  const lastOutbound = await prisma.smsMessage.findFirst({
    where: {
      userId,
      phone,
      direction: SmsDirection.OUTBOUND,
      response: { contains: 'Logged to' }
    },
    orderBy: { createdAt: 'desc' }
  });
  if (!lastOutbound?.response) return null;

  const parsed = parseLoggedFoodFromAssistantResponse(lastOutbound.response);
  if (!parsed) return null;

  const log = await ensureDailyLogByUserId(userId, dateKey);
  if (!log) return null;

  const sourceMeal = await prisma.meal.findFirst({
    where: {
      dailyLogId: log.id,
      name: { contains: parsed.mealName, mode: 'insensitive' }
    },
    include: {
      items: {
        where: { type: 'ACTUAL' },
        orderBy: { createdAt: 'desc' }
      }
    }
  });
  if (!sourceMeal?.items.length) return null;

  const matched = sourceMeal.items.filter((item) => {
    const loggedAt = lastOutbound.createdAt;
    const windowStart = new Date(loggedAt.getTime() - 10_000);
    const windowEnd = new Date(loggedAt.getTime() + 60_000);
    if (item.createdAt < windowStart || item.createdAt > windowEnd) return false;
    return parsed.foodNames.some((name) => {
      const itemName = item.nameSnapshot.toLowerCase();
      const foodName = name.toLowerCase();
      return itemName.includes(foodName) || foodName.includes(itemName);
    });
  });

  if (!matched.length) return null;

  return { sourceMeal, items: matched.slice(0, parsed.foodNames.length) };
}

export async function handleMealCorrection(
  userId: string,
  phone: string,
  dateKey: string,
  timeZone: string | null,
  targetMealName: string
) {
  const batch = await findLastSmsLoggedBatch(userId, phone, dateKey);
  if (!batch) {
    return capSms(
      `I couldn't find a recent food log to move. ${smsLogFoodExamples(targetMealName)} Text HELP for more commands.`
    );
  }

  const targetMeal = await resolveTargetMeal(userId, dateKey, targetMealName, timeZone);
  if (targetMeal.id === batch.sourceMeal.id) {
    return capSms(`That food is already logged to ${targetMeal.name}.`);
  }

  await moveMealItemsToMeal(
    userId,
    batch.items.map((item) => item.id),
    targetMeal.id
  );

  const names = batch.items.map((item) => item.nameSnapshot).join(', ');
  const dashboard = await getTodayDashboard(userId, dateKey, timeZone);
  const caloriesRemaining = Math.max(0, Math.round(dashboard.summary?.caloriesRemaining ?? 0));
  const proteinRemaining = Math.max(0, Math.round(dashboard.summary?.proteinRemaining ?? 0));

  return capSms(
    `Moved to ${targetMeal.name}: ${names}. You have ${caloriesRemaining} cal and ${proteinRemaining}g protein left today. ${pickEncouragement()}`
  );
}

export async function handleMacroStatus(userId: string, dateKey: string, timeZone: string | null) {
  const dashboard = await getTodayDashboard(userId, dateKey, timeZone);
  if (!dashboard.dailyLog) return 'No nutrition log found for today yet.';
  const dl = dashboard.dailyLog;

  // Report ALL FOUR macros (calories, protein, carbs, fat) — remaining plus the daily target — so a
  // "what are my macros/goals" question is answered in full, never just calories and protein.
  const remaining = (target: unknown, actual: unknown) => Math.max(0, Math.round(n(target) - n(actual)));
  const calRem = remaining(dl.calorieTarget, dl.caloriesActual);
  const proteinRem = remaining(dl.proteinTarget, dl.proteinActual);
  const carbRem = remaining(dl.carbTarget, dl.carbsActual);
  const fatRem = remaining(dl.fatTarget, dl.fatActual);

  const nextMeal = dashboard.nextMeal;
  const nextPart = nextMeal
    ? ` Next up: ${nextMeal.name}${nextMeal.plannedTime ? ` at ${nextMeal.plannedTime}` : ''}.`
    : '';

  return capSms(
    `You have ${calRem} cal, ${proteinRem}g protein, ${carbRem}g carbs, and ${fatRem}g fat left today ` +
      `(daily targets: ${fullMacros(n(dl.calorieTarget), n(dl.proteinTarget), n(dl.carbTarget), n(dl.fatTarget))}).${nextPart}`
  );
}

// --- Read-only lookups so the coach can answer questions about the user's own data ---

function resolveReadDate(dateArg: string | undefined, todayKey: string): { dateKey: string; label: string } {
  const today = parseDateParam(todayKey);
  const lower = dateArg?.trim().toLowerCase() ?? '';
  if (!lower || lower === 'today') return { dateKey: todayKey, label: 'today' };
  if (lower === 'yesterday') return { dateKey: toDateKey(addUtcDays(today, -1)), label: 'yesterday' };
  if (lower === 'tomorrow') return { dateKey: toDateKey(addUtcDays(today, 1)), label: 'tomorrow' };
  if (/^\d{4}-\d{2}-\d{2}$/.test(lower)) return { dateKey: lower, label: lower === todayKey ? 'today' : lower };
  return { dateKey: todayKey, label: 'today' };
}

function fullMacros(cal: number, protein: number, carbs: number, fat: number) {
  return `${Math.round(cal)} cal, ${Math.round(protein)}g protein, ${Math.round(carbs)}g carbs, ${Math.round(fat)}g fat`;
}

type ReadMeal = Awaited<ReturnType<typeof getMealsForDate>>[number];

type MealForMatch = { name: string; mealNumber: number; plannedTime: string | null };

function mealMinutes(meal: MealForMatch): number | null {
  const m = (meal.plannedTime ?? '').match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// Slot words → typical time window, with a positional fallback when meals are dish-named.
const SLOT_WINDOWS: Array<{ re: RegExp; window: [number, number]; pos: 'first' | 'middle' | 'last' }> = [
  { re: /breakfast/, window: [240, 630], pos: 'first' },
  { re: /brunch/, window: [540, 720], pos: 'first' },
  { re: /lunch/, window: [630, 900], pos: 'middle' },
  { re: /dinner|supper/, window: [960, 1320], pos: 'last' }
];

/** Resolve a meal from a hint by name, then meal number, then slot-word time window. Generic so
 * both the read path (display meals) and the write path (prisma meals) can reuse it. */
function matchMealForRead<T extends MealForMatch>(
  meals: T[],
  hint: string,
  options?: { strictSlot?: boolean }
): T | null {
  const normalized = (normalizeMealNameHint(hint) ?? hint).toLowerCase().trim();
  const byName = meals.find((meal) => meal.name.toLowerCase().includes(normalized));
  if (byName) return byName;
  const numMatch = hint.match(/\b(?:meal\s*)?([1-9])\b/i);
  if (numMatch) {
    const target = Number(numMatch[1]);
    const byNumber = meals.find((meal) => meal.mealNumber === target);
    if (byNumber) return byNumber;
  }
  // Slot word (breakfast/lunch/dinner) that didn't match a meal name — use planned time, then position.
  const slot = SLOT_WINDOWS.find((entry) => entry.re.test(normalized));
  if (slot) {
    const timed = meals
      .map((meal) => ({ meal, min: mealMinutes(meal) }))
      .filter((entry): entry is { meal: T; min: number } => entry.min !== null)
      .filter((entry) => entry.min >= slot.window[0] && entry.min <= slot.window[1])
      .sort((a, b) => a.min - b.min);
    if (timed.length) return timed[0].meal;
    if (options?.strictSlot) return null;
    if (slot.pos === 'first') return meals[0] ?? null;
    if (slot.pos === 'last') return meals[meals.length - 1] ?? null;
    return meals[Math.floor(meals.length / 2)] ?? null;
  }
  return null;
}

function formatMealDetail(meal: ReadMeal, label: string): string {
  const planned = meal.items.filter((item) => item.type === 'PLANNED');
  const actual = meal.items.filter((item) => item.type === 'ACTUAL');
  const parts = [
    `${meal.name} (${label}) — planned: ${fullMacros(n(meal.plannedCalories), n(meal.plannedProtein), n(meal.plannedCarbs), n(meal.plannedFat))}.`
  ];
  if (planned.length) {
    parts.push(
      'Items: ' +
        planned
          .map(
            (item) =>
              `${item.nameSnapshot} (${Math.round(n(item.calories))} cal, ${Math.round(n(item.protein))}P/${Math.round(n(item.carbs))}C/${Math.round(n(item.fat))}F)`
          )
          .join('; ') +
        '.'
    );
  }
  if (actual.length) {
    parts.push(
      `Logged so far: ${fullMacros(n(meal.actualCalories), n(meal.actualProtein), n(meal.actualCarbs), n(meal.actualFat))}.`
    );
  }
  return parts.join(' ');
}

function formatDayNutrition(meals: ReadMeal[], label: string): string {
  const totals = meals.reduce(
    (acc, meal) => {
      acc.cal += n(meal.plannedCalories);
      acc.protein += n(meal.plannedProtein);
      acc.carbs += n(meal.plannedCarbs);
      acc.fat += n(meal.plannedFat);
      return acc;
    },
    { cal: 0, protein: 0, carbs: 0, fat: 0 }
  );
  const perMeal = meals
    .map(
      (meal) =>
        `${meal.mealNumber}. ${meal.name}: ${Math.round(n(meal.plannedCalories))} cal, ${Math.round(n(meal.plannedProtein))}P/${Math.round(n(meal.plannedCarbs))}C/${Math.round(n(meal.plannedFat))}F`
    )
    .join('; ');
  return `${label} plan total: ${fullMacros(totals.cal, totals.protein, totals.carbs, totals.fat)} across ${meals.length} meal${meals.length === 1 ? '' : 's'}. ${perMeal}.`;
}

/**
 * Answers questions about the user's meals and macros. With a meal name → that meal's full
 * macros + item breakdown; without → the whole day's plan totals and per-meal macros.
 */
export async function handleMealDetails(
  userId: string,
  todayKey: string,
  _timeZone: string | null,
  mealName?: string,
  dateArg?: string
) {
  const { dateKey, label } = resolveReadDate(dateArg, todayKey);
  const meals = await getMealsForDate(userId, dateKey);
  if (!meals.length) return capSms(`No meals are planned or logged for ${label}.`);

  if (mealName?.trim()) {
    const meal = matchMealForRead(meals, mealName);
    if (!meal) {
      const list = meals.map((m) => `${m.mealNumber}. ${m.name}`).join(', ');
      return capSms(`I don't see "${mealName.trim()}" for ${label}. Your meals: ${list}. Which one?`);
    }
    return capSms(formatMealDetail(meal, label));
  }

  return capSms(formatDayNutrition(meals, label));
}

/** Today's (or another day's) scheduled workout with sets/reps and completion status. */
export async function handleExerciseDetails(userId: string, todayKey: string, _timeZone: string | null, dateArg?: string) {
  const { dateKey, label } = resolveReadDate(dateArg, todayKey);
  const exercises = await prisma.scheduledExercise.findMany({
    where: { userId, scheduledDate: parseDateParam(dateKey) },
    include: { exercise: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
  });
  if (!exercises.length) return capSms(`No workout is scheduled for ${label}.`);

  const done = exercises.filter((ex) => ex.status === 'DONE').length;
  const lines = exercises.map((ex, index) => {
    const bits: string[] = [];
    if (ex.sets != null && ex.reps != null) bits.push(`${ex.sets}x${ex.reps}`);
    else if (ex.durationMinutes != null) bits.push(`${ex.durationMinutes} min`);
    if (ex.weight != null) bits.push(`${n(ex.weight)} lb`);
    if (ex.distance != null) bits.push(`${n(ex.distance)} mi`);
    const detail = bits.length ? ` (${bits.join(', ')})` : '';
    const mark = ex.status === 'DONE' ? ' — done' : ex.status === 'SKIPPED' ? ' — skipped' : '';
    return `${index + 1}. ${ex.exercise.name}${detail}${mark}`;
  });
  return capSms(`Workout for ${label}: ${exercises.length} exercise${exercises.length === 1 ? '' : 's'}, ${done} done. ${lines.join('; ')}.`);
}

/** Water intake vs goal for a given day (defaults to today). */
export async function handleHydrationStatus(
  userId: string,
  todayKey: string,
  timeZone: string | null,
  dateArg?: string
) {
  const { dateKey, label } = resolveReadDate(dateArg, todayKey);
  const [summary, guidance] = await Promise.all([
    getHydrationSummary(userId, dateKey, timeZone),
    loadPersonalizedHydrationGuidance(userId)
  ]);
  const remaining = Math.max(0, summary.targetOz - summary.actualOz);
  const goalPart = summary.goalMet ? "You've hit your water goal!" : `${remaining} oz to go.`;
  const streakPart = summary.currentStreak > 0 ? ` ${summary.currentStreak}-day water streak.` : '';
  const typicalPart = guidance.typicalIntake
    ? ` Typical for your size: about ${guidance.typicalIntake.suggestedOz} oz/day (often ${guidance.typicalIntake.lowOz}–${guidance.typicalIntake.highOz} oz).`
    : '';
  return capSms(`Water ${label}: ${summary.actualOz} of ${summary.targetOz} oz. ${goalPart}${streakPart}${typicalPart}`);
}

/** Current weight vs start/goal and direction of change. */
export async function handleProgressStatus(userId: string, dateKey: string, timeZone: string | null) {
  const dashboard = await getTodayDashboard(userId, dateKey, timeZone);
  if (!dashboard.program) return capSms("You don't have an active program yet.");
  const weightMetric = dashboard.program.metrics.find((metric) => metric.metricType === 'WEIGHT');
  if (!weightMetric) return capSms('No weight goal is set up yet.');
  const start = n(weightMetric.startValue);
  const current = n(weightMetric.currentValue);
  const goal = n(weightMetric.goalValue);
  const changed = round(start - current, 1);
  const dir = changed > 0 ? `down ${changed} lb` : changed < 0 ? `up ${Math.abs(changed)} lb` : 'holding steady';
  return capSms(`Weight: ${current} lb (started ${start}, goal ${goal}). You're ${dir} since the start. Keep going!`);
}

/** Daily macro/calorie targets and current plan week. */
export async function handlePlanTargets(userId: string, dateKey: string, timeZone: string | null) {
  const [dashboard, status] = await Promise.all([
    getTodayDashboard(userId, dateKey, timeZone),
    getPlanStatus(userId).catch(() => null)
  ]);
  if (!dashboard.dailyLog) return capSms('No plan targets are set for today yet.');
  const dl = dashboard.dailyLog;
  const targets = fullMacros(n(dl.calorieTarget), n(dl.proteinTarget), n(dl.carbTarget), n(dl.fatTarget));
  const weekPart = status?.weekNumber ? ` You're on week ${status.weekNumber} of your plan.` : '';
  return capSms(`Your daily targets: ${targets}.${weekPart}`);
}

export type ExplicitFoodMacros = {
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  foodName?: string;
};

export type FoodLogResult = { message: string; lastLoggedItemId?: string };

function hasAnyExplicitMacro(explicit: ExplicitFoodMacros): boolean {
  return [explicit.calories, explicit.protein, explicit.carbs, explicit.fat].some(
    (v) => v != null && Number.isFinite(v)
  );
}

/** Fill in unstated macros from a food lookup so partial label data is not saved as zero. */
async function resolveExplicitFoodMacros(
  userId: string,
  foodText: string,
  explicit: ExplicitFoodMacros
): Promise<{ calories: number; protein: number; carbs: number; fat: number; foodName: string }> {
  const name = (explicit.foodName?.trim() || foodText.trim()) || 'Food';
  let calories = explicit.calories;
  let protein = explicit.protein;
  let carbs = explicit.carbs;
  let fat = explicit.fat;

  const needsEstimate = [calories, protein, carbs, fat].some((v) => v == null);
  if (needsEstimate && (foodText.trim() || explicit.foodName?.trim())) {
    const lookupText = foodText.trim() || explicit.foodName!.trim();
    const result = await lookupFood(userId, lookupText);
    const preview = summarizeFoodLookup(result);
    if (preview.count) {
      let estCal = 0;
      let estP = 0;
      let estC = 0;
      let estF = 0;
      for (const item of result.items) {
        if (item.source === 'ai') {
          estCal += item.estimate.calories;
          estP += item.estimate.protein;
          estC += item.estimate.carbs;
          estF += item.estimate.fat;
        } else {
          estCal += n(item.food.calories);
          estP += n(item.food.protein);
          estC += n(item.food.carbs);
          estF += n(item.food.fat);
        }
      }
      calories ??= estCal;
      protein ??= estP;
      carbs ??= estC;
      fat ??= estF;
    }
  }

  return {
    calories: calories ?? 0,
    protein: protein ?? 0,
    carbs: carbs ?? 0,
    fat: fat ?? 0,
    foodName: name
  };
}

export async function handleFoodLog(
  userId: string,
  dateKey: string,
  timeZone: string | null,
  foodText: string,
  mealNameHint?: string,
  explicit?: ExplicitFoodMacros
): Promise<FoodLogResult> {
  const cleaned = foodText.trim();
  if (!cleaned && !explicit?.foodName?.trim()) {
    return {
      message: capSms(
        `Tell me what you ate with amounts, like "6 oz chicken and a cup of rice". ${smsLogFoodExamples(mealNameHint)}`
      )
    };
  }

  // The user gave exact numbers — log stated macros verbatim; estimate any they omitted.
  if (explicit && hasAnyExplicitMacro(explicit)) {
    const meal = await resolveTargetMeal(userId, dateKey, mealNameHint, timeZone);
    const resolved = await resolveExplicitFoodMacros(userId, cleaned, explicit);
    const created = await addMealItem(userId, meal.id, {
      type: 'ACTUAL',
      nameSnapshot: resolved.foodName,
      quantity: 1,
      unit: 'serving',
      calories: resolved.calories,
      protein: resolved.protein,
      carbs: resolved.carbs,
      fat: resolved.fat
    });
    const dashboard = await getTodayDashboard(userId, dateKey, timeZone);
    const caloriesRemaining = Math.max(0, Math.round(dashboard.summary?.caloriesRemaining ?? 0));
    const proteinRemaining = Math.max(0, Math.round(dashboard.summary?.proteinRemaining ?? 0));
    return {
      message: capSms(
        `Logged to ${meal.name}: ${resolved.foodName} — ${Math.round(resolved.calories)} cal and ${Math.round(
          resolved.protein
        )}g protein. You have ${caloriesRemaining} cal and ${proteinRemaining}g protein left today. ${pickEncouragement()}`
      ),
      lastLoggedItemId: created.id
    };
  }

  const result = await lookupFood(userId, cleaned);
  const meal = await resolveTargetMeal(userId, dateKey, mealNameHint, timeZone);
  const preview = summarizeFoodLookup(result);

  if (!preview.count) {
    return {
      message: capSms(
        'I could not pin down the macros on that. Try naming the foods and rough amounts, like "2 eggs and a slice of toast".'
      )
    };
  }

  if (isEffectivelyZeroCalories(preview.calories, preview.protein)) {
    return { message: capSms(smsZeroCalorieCheckResponse(preview.names.join(', ') || cleaned, meal.name)) };
  }

  const logged = await logLookupResultToMeal(userId, meal.id, result);

  const dashboard = await getTodayDashboard(userId, dateKey, timeZone);
  const caloriesRemaining = Math.max(0, Math.round(dashboard.summary?.caloriesRemaining ?? 0));
  const proteinRemaining = Math.max(0, Math.round(dashboard.summary?.proteinRemaining ?? 0));
  const foodList = logged.names.join(', ');
  const roughNote = lookupHasRoughEstimate(result)
    ? ' That’s a rough estimate — reply with the right calories or amount to correct it.'
    : '';

  return {
    message: capSms(
      `Logged to ${meal.name}: ${foodList} — about ${Math.round(logged.calories)} cal and ${Math.round(
        logged.protein
      )}g protein.${roughNote} You have ${caloriesRemaining} cal and ${proteinRemaining}g protein left today. ${pickEncouragement()}`
    ),
    lastLoggedItemId: logged.lastItemId
  };
}

/** The single most recently logged ACTUAL food item today — DB-based so it works even when
 *  agent mode paraphrases the "Logged to…" reply (which text-parsing lookups depend on). */
async function findLastLoggedActualItem(userId: string, dateKey: string) {
  const log = await ensureDailyLogByUserId(userId, dateKey);
  if (!log) return null;
  return prisma.mealItem.findFirst({
    where: { type: 'ACTUAL', meal: { dailyLogId: log.id } },
    orderBy: { createdAt: 'desc' },
    include: { meal: true }
  });
}

/** Correct the macros of the last-logged food in place (e.g. "here are the actual macros for that:
 *  190 cal, 4g protein") instead of logging a duplicate with a fresh estimate. */
export async function handleFoodMacroCorrection(
  userId: string,
  dateKey: string,
  timeZone: string | null,
  macros: { calories?: number; protein?: number; carbs?: number; fat?: number; foodName?: string },
  itemId?: string
) {
  let item =
    itemId != null
      ? await prisma.mealItem.findFirst({
          where: {
            id: itemId,
            type: 'ACTUAL',
            meal: { userId, dailyLog: { date: parseDateParam(dateKey) } }
          },
          include: { meal: true }
        })
      : null;
  if (!item) item = await findLastLoggedActualItem(userId, dateKey);
  if (!item) {
    return capSms("I don't see a recent food log to correct. Tell me what you ate and I'll log it.");
  }

  const data: Record<string, unknown> = {};
  if (macros.calories != null && Number.isFinite(macros.calories)) data.calories = macros.calories;
  if (macros.protein != null && Number.isFinite(macros.protein)) data.protein = macros.protein;
  if (macros.carbs != null && Number.isFinite(macros.carbs)) data.carbs = macros.carbs;
  if (macros.fat != null && Number.isFinite(macros.fat)) data.fat = macros.fat;
  if (macros.foodName?.trim()) data.nameSnapshot = macros.foodName.trim();

  if (data.calories == null && data.protein == null && data.carbs == null && data.fat == null) {
    return capSms('Tell me the corrected calories or macros, like "190 cal, 4g protein".');
  }

  await updateMealItem(userId, item.id, data);

  const name = macros.foodName?.trim() || item.nameSnapshot;
  const cal = data.calories != null ? Math.round(Number(data.calories)) : Math.round(n(item.calories));
  const protein = data.protein != null ? Math.round(Number(data.protein)) : Math.round(n(item.protein));
  const dashboard = await getTodayDashboard(userId, dateKey, timeZone);
  const caloriesRemaining = Math.max(0, Math.round(dashboard.summary?.caloriesRemaining ?? 0));
  const proteinRemaining = Math.max(0, Math.round(dashboard.summary?.proteinRemaining ?? 0));
  return capSms(
    `Updated ${name} in ${item.meal.name} to ${cal} cal and ${protein}g protein. You have ${caloriesRemaining} cal and ${proteinRemaining}g protein left today. ${pickEncouragement()}`
  );
}

function formatMealSuggestionsForSms(result: MealSuggestionResult) {
  const lines: string[] = [];
  if (result.intro?.trim()) lines.push(result.intro.trim());
  result.options.slice(0, 3).forEach((option, index) => {
    lines.push(
      `${index + 1}. ${option.name} (~${Math.round(option.calories)} cal, ${Math.round(option.protein)}g protein) — ${option.description}`
    );
  });
  lines.push("Text me what you go with and I'll log it.");
  return capSms(lines.join('\n'));
}

export async function handleMealSuggestion(userId: string, message: string) {
  const result = await suggestMealOptions(userId, message);
  return formatMealSuggestionsForSms(result);
}

async function handleAiChat(userId: string, phone: string, message: string) {
  const priorMessages = await loadSmsChatHistory(userId, phone);
  const withoutCurrent = priorMessages.at(-1)?.role === 'user' ? priorMessages.slice(0, -1) : priorMessages;
  const messages: ChatMessage[] = [...withoutCurrent, { role: 'user', content: message }];
  const { reply } = await chatWithSmsAssistant(userId, messages);
  return reply;
}

function buildTwilioAuthHeaders(accountSid: string) {
  const token = Buffer.from(`${accountSid}:${env.TWILIO_AUTH_TOKEN}`).toString('base64');
  return { Authorization: `Basic ${token}` };
}

function parseTwilioAccountSidFromMediaUrl(mediaUrl: string) {
  try {
    const url = new URL(mediaUrl);
    const match = url.pathname.match(/\/Accounts\/([^/]+)\//i);
    return match?.[1];
  } catch {
    return undefined;
  }
}

function buildTwilioMediaFetchOptions(media: SmsMedia): RequestInit[] {
  const options: RequestInit[] = [{}];
  if (!env.TWILIO_AUTH_TOKEN) return options;

  const accountSids = [parseTwilioAccountSidFromMediaUrl(media.url), media.accountSid, env.TWILIO_ACCOUNT_SID]
    .map((accountSid) => accountSid?.trim())
    .filter((accountSid): accountSid is string => Boolean(accountSid));

  for (const accountSid of [...new Set(accountSids)]) {
    options.push({ headers: buildTwilioAuthHeaders(accountSid) });
  }

  return options;
}

function twilioMediaDownloadError(response: Response) {
  if (response.status === 401 || response.status === 403) {
    if (!env.TWILIO_AUTH_TOKEN) {
      return new Error('Twilio requires authentication to download this meal photo, but TWILIO_AUTH_TOKEN is not configured.');
    }
    return new Error('Twilio rejected the meal photo download. Check TWILIO_AUTH_TOKEN for the webhook account and try again.');
  }
  if (response.status === 404) {
    return new Error('Twilio could not find the meal photo. Please resend the image.');
  }
  return new Error('Could not download the meal photo. Please resend it.');
}

export async function downloadSmsImage(media: SmsMedia) {
  let response: Response | null = null;
  for (const options of buildTwilioMediaFetchOptions(media)) {
    response = await fetch(media.url, options);
    if (response.ok) break;
    if (![401, 403].includes(response.status)) break;
  }
  if (!response) throw new Error('Could not download the meal photo. Please resend it.');
  if (!response.ok) throw twilioMediaDownloadError(response);

  const mimeType = (media.mimeType || response.headers.get('content-type') || '').split(';')[0]!.trim().toLowerCase();
  if (!SUPPORTED_IMAGE_TYPES.has(mimeType)) {
    throw new Error(
      'Send a JPEG, PNG, WebP, or HEIC meal photo. If you are texting from iPhone, try sending the photo again.'
    );
  }

  const contentLength = Number(response.headers.get('content-length') ?? 0);
  if (contentLength > MAX_SMS_IMAGE_BYTES) {
    throw new Error('Image must be 10 MB or smaller.');
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > MAX_SMS_IMAGE_BYTES) {
    throw new Error('Image must be 10 MB or smaller.');
  }

  return { data: buffer.toString('base64'), mimeType };
}

function summarizeFoodPhotoEstimate(result: FoodLookupResult) {
  const estimates = result.items
    .filter((item) => item.source === 'ai')
    .map((item) => item.estimate);

  if (!estimates.length) {
    return 'I could not estimate the food from that photo. Try sending a clearer plate photo with the whole meal visible.';
  }

  const totals = estimates.reduce(
    (sum, item) => ({
      calories: sum.calories + item.calories,
      protein: sum.protein + item.protein,
      carbs: sum.carbs + item.carbs,
      fat: sum.fat + item.fat
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
  const foodList = estimates.map((item) => item.normalizedFoodName).join(', ');

  return `Estimated from your photo: ${Math.round(totals.calories)} cal, ${Math.round(totals.protein)}g protein, ${Math.round(totals.carbs)}g carbs, ${Math.round(totals.fat)}g fat. I see: ${foodList}. Photo estimates are approximate.`;
}

export type FoodPhotoReply = {
  text: string;
  logged: boolean;
  mealName: string;
  estimateItems: StoredPhotoEstimateItem[];
};

export async function handleFoodPhoto(
  userId: string,
  dateKey: string,
  timeZone: string | null,
  media: SmsMedia,
  message: string,
  shouldLog: boolean,
  preloadedImage?: DownloadedSmsImage
): Promise<FoodPhotoReply> {
  const image = preloadedImage ?? (await downloadSmsImage(media));
  const result = await Promise.race([
    lookupFoodFromImage(userId, image, message),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Photo analysis timed out. Please try again in a moment.')), FOOD_PHOTO_TIMEOUT_MS);
    })
  ]);
  const meal = await resolveTargetMeal(userId, dateKey, parseTargetMealFromText(message) ?? parseMealName(message), timeZone);
  const preview = summarizeFoodLookup(result);
  const estimateItems = photoEstimateItemsFromResult(result);

  if (!preview.count) {
    return {
      text: 'I could not estimate the food from that photo. Try sending a clearer plate photo with the whole meal visible.',
      logged: false,
      mealName: meal.name,
      estimateItems: []
    };
  }

  if (isEffectivelyZeroCalories(preview.calories, preview.protein)) {
    return {
      text: capSms(smsZeroCalorieCheckResponse(preview.names.join(', ') || 'your photo', meal.name)),
      logged: false,
      mealName: meal.name,
      estimateItems: []
    };
  }

  const summary = summarizeFoodPhotoEstimate(result);

  if (shouldLog) {
    await logPhotoEstimateItems(userId, meal.id, estimateItems);
    return {
      text: capSms(`${summary} Logged to ${meal.name}.`),
      logged: true,
      mealName: meal.name,
      estimateItems
    };
  }

  const dashboard = await getTodayDashboard(userId, dateKey, timeZone);
  const caloriesRemaining = Math.max(0, Math.round(dashboard.summary?.caloriesRemaining ?? 0));
  const proteinRemaining = Math.max(0, Math.round(dashboard.summary?.proteinRemaining ?? 0));

  return {
    text: capSms(
      `${summary} Nothing logged yet — you have ${caloriesRemaining} cal and ${proteinRemaining}g protein left today. Text "log that for ${meal.name.toLowerCase()}" if you eat it.`
    ),
    logged: false,
    mealName: meal.name,
    estimateItems
  };
}

export async function handleLogLastPhotoEstimate(
  userId: string,
  phone: string,
  dateKey: string,
  timeZone: string | null,
  mealNameHint?: string
) {
  const lastOutbound = await prisma.smsMessage.findFirst({
    where: {
      userId,
      phone,
      direction: SmsDirection.OUTBOUND,
      OR: [
        { intent: { startsWith: 'PHOTO_ESTIMATE:' } },
        { intent: { startsWith: 'PENDING_ACTION:' } },
        { response: { contains: 'Estimated from your photo' } },
        { response: { contains: 'Estimated from your plate' } }
      ]
    },
    orderBy: { createdAt: 'desc' }
  });

  if (
    !lastOutbound?.response ||
    lastOutbound.intent === PHOTO_ESTIMATE_LOGGED_INTENT ||
    (!assistantResponseLooksLikePhotoEstimate(lastOutbound.response) && !parseStoredPhotoEstimate(lastOutbound.intent))
  ) {
    return capSms(
      'I do not have a recent photo estimate to log. Send a meal photo first, or text what you ate with an amount.'
    );
  }

  const stored = parseStoredPhotoEstimate(lastOutbound.intent);
  let estimateItems = stored?.items ?? [];
  if (!estimateItems.length) {
    const names = parsePhotoEstimateFoodNames(lastOutbound.response);
    const totals = parsePhotoEstimateTotals(lastOutbound.response);
    if (names?.length && totals) {
      const share = names.length;
      estimateItems = names.map((name) => ({
        name,
        calories: totals.calories / share,
        protein: totals.protein / share,
        carbs: totals.carbs / share,
        fat: totals.fat / share
      }));
    }
  }

  if (!estimateItems.length) {
    return capSms('I could not read the foods from your last photo estimate. Send the photo again or text what you ate.');
  }

  const meal = await resolveTargetMeal(
    userId,
    dateKey,
    mealNameHint ?? stored?.mealName ?? parseTargetMealFromText(lastOutbound.response),
    timeZone
  );
  const logged = await logPhotoEstimateItems(userId, meal.id, estimateItems);
  const response = await buildLoggedFoodResponse(meal.name, logged.names, logged.calories, logged.protein, dateKey, timeZone, userId);

  await prisma.smsMessage.update({
    where: { id: lastOutbound.id },
    data: { intent: PHOTO_ESTIMATE_LOGGED_INTENT, response }
  });

  return response;
}

export function photoErrorResponse(error: unknown) {
  if (error instanceof SmsResponseError) return error.message;
  const detail = error instanceof Error ? error.message : 'Assistant unavailable';
  return capSms(`Sorry, I could not analyze that photo right now. ${detail}`);
}

/** Processes a meal photo and records outbound SMS. Returns TwiML fallback when API send fails. */
async function deliverFoodPhotoReply(
  user: SmsUser,
  phone: string,
  media: SmsMedia,
  message: string,
  inboundId: string,
  channel: TwilioMessageChannel,
  preloadedImage?: DownloadedSmsImage
) {
  let reply: FoodPhotoReply;
  const shouldLog = wantsPhotoLog(message);
  try {
    reply = await handleFoodPhoto(
      user.id,
      userDayKey(user.timezone),
      user.timezone,
      media,
      message,
      shouldLog,
      preloadedImage
    );
  } catch (error) {
    reply = {
      text: photoErrorResponse(error),
      logged: false,
      mealName: '',
      estimateItems: []
    };
  }

  const intent =
    !reply.logged && reply.estimateItems.length
      ? serializePhotoEstimateIntent(reply.estimateItems, reply.mealName)
      : undefined;

  await prisma.smsMessage.update({ where: { id: inboundId }, data: { status: 'PROCESSED', response: reply.text } });
  const outbound = await prisma.smsMessage.create({
    data: {
      phone,
      userId: user.id,
      direction: 'OUTBOUND',
      message: reply.text,
      response: reply.text,
      intent,
      status: 'PROCESSED'
    }
  });

  if (isTwilioConfigured()) {
    try {
      await sendOutboundMessage(phone, reply.text, channel);
      return '';
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Could not send text message.';
      await prisma.smsMessage.update({ where: { id: outbound.id }, data: { status: 'FAILED', response: detail } });
      return reply.text;
    }
  }

  return reply.text;
}

async function beginIncomingFoodPhoto(
  user: SmsUser,
  phone: string,
  media: SmsMedia,
  message: string,
  inboundId: string,
  channel: TwilioMessageChannel
): Promise<HandleSmsResult> {
  if (isTwilioConfigured()) {
    const { ack, deliveredViaApi } = await sendPhotoProcessingAck(user, phone, inboundId, channel);
    return {
      response: deliveredViaApi ? '' : ack,
      deferredWork: async () => {
        try {
          const preloadedImage = await downloadSmsImage(media);
          const twimlFallback = await deliverFoodPhotoReply(
            user,
            phone,
            media,
            message,
            inboundId,
            channel,
            preloadedImage
          );
          if (twimlFallback) {
            await sendOutboundMessage(phone, twimlFallback, channel).catch(() => undefined);
          }
        } catch (error) {
          const response = capSms(photoErrorResponse(error));
          await prisma.smsMessage
            .update({ where: { id: inboundId }, data: { status: 'PROCESSED', response } })
            .catch(() => undefined);
          await sendOutboundMessage(phone, response, channel).catch(() => undefined);
        }
      }
    };
  }

  let preloadedImage: DownloadedSmsImage;
  try {
    preloadedImage = await downloadSmsImage(media);
  } catch (error) {
    const response = photoErrorResponse(error);
    await prisma.smsMessage.update({
      where: { id: inboundId },
      data: { status: 'PROCESSED', response, intent: 'FOOD_PHOTO' }
    });
    return { response };
  }

  const response = await deliverFoodPhotoReply(user, phone, media, message, inboundId, channel, preloadedImage);
  return { response };
}

export async function sendPhotoProcessingAck(
  user: SmsUser,
  phone: string,
  inboundId: string,
  channel: TwilioMessageChannel
) {
  const ack = capSms(PHOTO_PROCESSING_ACK);
  await prisma.smsMessage.update({ where: { id: inboundId }, data: { status: 'PROCESSED', response: ack } });
  const outbound = await prisma.smsMessage.create({
    data: {
      phone,
      userId: user.id,
      direction: 'OUTBOUND',
      message: ack,
      response: ack,
      intent: 'PHOTO_ACK',
      status: 'PROCESSED'
    }
  });

  if (!isTwilioConfigured()) {
    return { ack, deliveredViaApi: false };
  }

  try {
    await sendOutboundMessage(phone, ack, channel);
    return { ack, deliveredViaApi: true };
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Could not send text message.';
    await prisma.smsMessage.update({ where: { id: outbound.id }, data: { status: 'FAILED', response: detail } });
    return { ack, deliveredViaApi: false };
  }
}

async function respondMediaMissing(user: SmsUser, phone: string, inboundId: string, channel: TwilioMessageChannel) {
  const response = capSms(
    'I got your message but could not load the photo. Try sending it again, or text what you ate with amounts.'
  );
  await prisma.smsMessage.update({
    where: { id: inboundId },
    data: { status: 'PROCESSED', response, intent: 'FOOD_PHOTO_MISSING' }
  });
  const outbound = await prisma.smsMessage.create({
    data: {
      phone,
      userId: user.id,
      direction: 'OUTBOUND',
      message: response,
      response,
      status: 'PROCESSED'
    }
  });

  if (isTwilioConfigured()) {
    try {
      await sendOutboundMessage(phone, response, channel);
      return { response, deliveredViaApi: true };
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Could not send text message.';
      await prisma.smsMessage.update({ where: { id: outbound.id }, data: { status: 'FAILED', response: detail } });
    }
  }

  return { response, deliveredViaApi: false };
}

async function respondUnknownSmsUser(
  phone: string,
  inboundMessage: string,
  intent: string,
  channel: TwilioMessageChannel = 'sms'
) {
  const response = capSms(smsNoAccountResponseMessage(env.CLIENT_URL));
  await prisma.smsMessage.create({
    data: { phone, direction: 'INBOUND', message: inboundMessage, intent, status: 'PROCESSED', response }
  });
  const outbound = await prisma.smsMessage.create({
    data: { phone, direction: 'OUTBOUND', message: response, response, status: 'PROCESSED' }
  });
  // Twilio Advanced Opt-Out may auto-reply to START/HELP before our TwiML is shown; send via API too.
  try {
    await sendOutboundMessage(phone, response, channel);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Could not send text message.';
    await prisma.smsMessage.update({ where: { id: outbound.id }, data: { status: 'FAILED', response: detail } });
  }
  return { response };
}

export async function handleSms(
  phone: string,
  message: string,
  media?: SmsMedia,
  twilioOptOutType?: string,
  channel: TwilioMessageChannel = 'sms',
  mediaMissing = false
): Promise<HandleSmsResult> {
  const user = await findUserBySmsPhone(phone);
  if (!media && isSmsStartKeyword(message)) {
    if (!user) {
      return respondUnknownSmsUser(phone, message.trim(), 'NO_ACCOUNT', channel);
    }
    if (twilioOptOutType === 'START') {
      await prisma.user.update({ where: { id: user.id }, data: { smsOptedOut: false } });
      await prisma.smsMessage.create({
        data: {
          phone,
          userId: user.id,
          direction: 'INBOUND',
          message: message.trim(),
          intent: 'OPT_IN',
          status: 'PROCESSED',
          response: smsOptInResponse()
        }
      });
      return { response: '' };
    }
    const response = smsOptInResponse();
    await prisma.user.update({ where: { id: user.id }, data: { smsOptedOut: false } });
    await prisma.smsMessage.create({
      data: { phone, userId: user.id, direction: 'INBOUND', message: message.trim(), intent: 'OPT_IN', status: 'PROCESSED', response }
    });
    await prisma.smsMessage.create({
      data: { phone, userId: user.id, direction: 'OUTBOUND', message: response, response, status: 'PROCESSED' }
    });
    return { response };
  }

  if (!media && isSmsHelpKeyword(message)) {
    if (!user) {
      return respondUnknownSmsUser(phone, message.trim(), 'NO_ACCOUNT', channel);
    }
    const response = smsHelpResponse();
    if (twilioOptOutType === 'HELP') {
      await prisma.smsMessage.create({
        data: { phone, userId: user.id, direction: 'INBOUND', message: message.trim(), intent: 'HELP', status: 'PROCESSED', response }
      });
      return { response: '' };
    }
    await prisma.smsMessage.create({
      data: { phone, userId: user?.id, direction: 'INBOUND', message: message.trim(), intent: 'HELP', status: 'PROCESSED', response }
    });
    const outbound = await prisma.smsMessage.create({
      data: { phone, userId: user?.id, direction: 'OUTBOUND', message: response, response, status: 'PROCESSED' }
    });
    // A2P campaign auto-reply for HELP may only include STOP boilerplate; send full help via API too.
    try {
      await sendOutboundMessage(phone, response, channel);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Could not send text message.';
      await prisma.smsMessage.update({ where: { id: outbound.id }, data: { status: 'FAILED', response: detail } });
    }
    return { response };
  }

  if (!media && isSmsStopKeyword(message)) {
    const response = smsOptOutResponse();
    if (user) {
      await prisma.user.update({ where: { id: user.id }, data: { smsOptedOut: true } });
    }
    await prisma.smsMessage.create({
      data: { phone, userId: user?.id, direction: 'INBOUND', message: message.trim(), intent: 'OPT_OUT', status: 'PROCESSED', response }
    });
    if (twilioOptOutType === 'STOP') {
      return { response: '' };
    }
    await prisma.smsMessage.create({
      data: { phone, userId: user?.id, direction: 'OUTBOUND', message: response, response, status: 'PROCESSED' }
    });
    return { response };
  }

  // Agentic mode: hand everything past compliance keywords to the conversational tool-calling agent.
  if (env.SMS_AGENT_MODE === 'agent' && user) {
    return runSmsAgentEntry(user, phone, message, media, channel, mediaMissing);
  }

  const action = parseSmsAction(message);
  const hasTextBody = message.trim().length > 0;
  const isFoodPhoto = Boolean(media);
  const recentContext = user ? await loadRecentSmsContext(user.id, phone) : {};
  let freeformRoute: FreeformFoodRoute = null;
  if (!isFoodPhoto && !action.intent && user) {
    if (looksLikeFoodLogRetry(message, recentContext)) {
      freeformRoute = 'LOG_FOOD';
    } else {
      freeformRoute = await classifyFreeformFood(message);
    }
  }
  // Read-only info questions — answered directly so the tree classifier doesn't misroute them.
  // Nutrition/meal questions first, then other domains (workout, water, weight, plan targets).
  const mealInfo = isFoodPhoto || !hasTextBody ? null : parseMealInfoQuery(message);
  const infoDomain = isFoodPhoto || !hasTextBody || mealInfo ? null : parseInfoDomain(message);
  const intent = isFoodPhoto
    ? 'FOOD_PHOTO'
    : mediaMissing && !hasTextBody
      ? 'FOOD_PHOTO_MISSING'
      : mealInfo
        ? 'MEAL_DETAILS'
        : infoDomain
          ? `INFO_${infoDomain.domain.toUpperCase()}`
          : action.intent ?? freeformRoute ?? 'AI_CHAT';
  const inboundMessage = message.trim() || (isFoodPhoto || mediaMissing ? '[Meal photo]' : '');

  const inbound = await prisma.smsMessage.create({
    data: { phone, userId: user?.id, direction: 'INBOUND', message: inboundMessage, intent }
  });

  if (!user) {
    const response = capSms(smsNoAccountResponseMessage(env.CLIENT_URL));
    await prisma.smsMessage.update({
      where: { id: inbound.id },
      data: { status: 'PROCESSED', response, intent: 'NO_ACCOUNT' }
    });
    await prisma.smsMessage.create({
      data: { phone, direction: 'OUTBOUND', message: response, response, status: 'PROCESSED' }
    });
    return { inbound, response };
  }

  if (mediaMissing && !hasTextBody) {
    const { response, deliveredViaApi } = await respondMediaMissing(user, phone, inbound.id, channel);
    return { inbound, response: deliveredViaApi ? '' : response };
  }

  if (media) {
    const photoResult = await beginIncomingFoodPhoto(user, phone, media, message, inbound.id, channel);
    return { inbound, ...photoResult };
  }

  const dateKey = userDayKey(user.timezone);
  let response: string;
  try {
    if (mealInfo) {
      response = await handleMealDetails(user.id, dateKey, user.timezone, mealInfo.meal, mealInfo.date);
    } else if (infoDomain?.domain === 'exercise') {
      response = await handleExerciseDetails(user.id, dateKey, user.timezone, infoDomain.date);
    } else if (infoDomain?.domain === 'hydration') {
      response = await handleHydrationStatus(user.id, dateKey, user.timezone, infoDomain.date);
    } else if (infoDomain?.domain === 'progress') {
      response = await handleProgressStatus(user.id, dateKey, user.timezone);
    } else if (infoDomain?.domain === 'plan') {
      response = await handlePlanTargets(user.id, dateKey, user.timezone);
    } else if (action.intent === 'LOG_FOOD') {
      response = (await handleFoodLog(user.id, dateKey, user.timezone, action.foodText, action.mealName)).message;
    } else if (action.intent === 'LOG_PHOTO_ESTIMATE') {
      response = await handleLogLastPhotoEstimate(user.id, phone, dateKey, user.timezone, action.mealName);
    } else if (action.intent === 'MEAL_CORRECTION') {
      response = await handleMealCorrection(
        user.id,
        phone,
        dateKey,
        user.timezone,
        action.targetMealName
      );
    } else if (action.intent === 'MACRO_STATUS') {
      response = await handleMacroStatus(user.id, dateKey, user.timezone);
    } else if (action.intent) {
      response = await handleWriteAction(user.id, dateKey, user.timezone, action);
    } else if (freeformRoute === 'LOG_FOOD') {
      const resolved = resolveFreeformFoodLog(message, recentContext);
      response = (await handleFoodLog(user.id, dateKey, user.timezone, resolved.foodText, resolved.mealName)).message;
    } else if (freeformRoute === 'MEAL_SUGGESTION') {
      response = await handleMealSuggestion(user.id, message);
    } else {
      response = await handleAiChat(user.id, phone, message);
    }
  } catch (error) {
    if (error instanceof SmsResponseError) {
      response = error.message;
    } else {
      const detail = error instanceof Error ? error.message : 'Assistant unavailable';
      response = `Sorry, I could not answer that right now. ${detail}`;
    }
  }

  if (mediaMissing && hasTextBody) {
    response = capSms(
      `${response}\n\nI could not load the photo attachment — send the image again if you wanted a calorie estimate from it.`
    );
  }

  await prisma.smsMessage.update({ where: { id: inbound.id }, data: { status: 'PROCESSED', response } });
  await prisma.smsMessage.create({
    data: { phone, userId: user.id, direction: 'OUTBOUND', message: response, response, status: 'PROCESSED' }
  });
  return { inbound, response };
}
