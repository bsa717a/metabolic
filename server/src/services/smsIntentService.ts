import { MealStatus, HydrationSource, SmsDirection } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { getTodayDashboard } from './dashboardService.js';
import { markAllPlannedExercisesDone, markDone } from './exerciseService.js';
import { addMealItem, markMealEatenAsPlanned } from './nutritionService.js';
import { chatWithSmsAssistant, suggestMealOptions } from './assistantService.js';
import { toDateKey, userDayKey, localTimeParts } from '../utils/dates.js';
import { resolveNextMeal } from '../utils/meals.js';
import { getAiProvider, type ChatMessage, type MealSuggestionResult } from './aiService.js';
import { lookupFood, lookupFoodFromImage, type FoodLookupResult } from './foodLookupService.js';
import { env } from '../config/env.js';
import { sendOutboundMessage } from './twilioOutboundService.js';
import { ensureDailyLogByUserId } from './dailyLogService.js';
import { logWater } from './hydrationService.js';
import { parseWaterAmountOz } from '../utils/waterParse.js';
import { n } from '../utils/numbers.js';
import {
  smsHelpResponseMessage,
  smsOptInConfirmationMessage,
  smsOptOutConfirmationMessage
} from '../utils/smsCompliance.js';

export type SmsIntent =
  | 'MARK_ALL_EXERCISES_DONE'
  | 'MARK_EXERCISE_DONE'
  | 'MARK_MEAL_COMPLETE'
  | 'LOG_FOOD'
  | 'LOG_WATER'
  | 'MEAL_SUGGESTION'
  | 'FOOD_PHOTO'
  | 'AI_CHAT';

/** Result of routing a free-form (non-command) text message. null means general AI chat. */
type FreeformFoodRoute = 'LOG_FOOD' | 'MEAL_SUGGESTION' | null;

const SMS_MAX_LENGTH = 1500;

function capSms(text: string) {
  const trimmed = text.trim();
  if (trimmed.length <= SMS_MAX_LENGTH) return trimmed;
  return `${trimmed.slice(0, SMS_MAX_LENGTH - 1)}…`;
}

type SmsAction =
  | { intent: 'MARK_ALL_EXERCISES_DONE' }
  | { intent: 'MARK_EXERCISE_DONE'; exerciseName?: string }
  | { intent: 'MARK_MEAL_COMPLETE'; mealName?: string }
  | { intent: 'LOG_FOOD'; foodText: string; mealName: string }
  | { intent: 'LOG_WATER'; text: string; amountOz: number }
  | { intent: null };

const MEAL_NAME_PATTERN = /\b(breakfast|lunch|dinner|snack|brunch)\b/i;
const EXERCISE_COMPLETE_PATTERN = /\b(done|complete|completed|finished|check(?:ed)?\s+off)\b/i;
const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_SMS_IMAGE_BYTES = 10 * 1024 * 1024;

type SmsMedia = {
  url: string;
  mimeType?: string;
  accountSid?: string;
};

type SmsUser = NonNullable<Awaited<ReturnType<typeof prisma.user.findFirst>>>;

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
  if (/\bmeal\b/i.test(text) && /\b(complete|completed|done|eaten|as planned)\b/i.test(text)) return true;
  if (/\bmark\b.*\b(breakfast|lunch|dinner|snack|brunch)\b/i.test(text)) return true;
  if (/\b(ate|finished|completed|done with)\b.*\b(this )?(my )?(breakfast|lunch|dinner|snack|meal)\b/i.test(text)) return true;
  return false;
}

function parseMealName(text: string) {
  const match = text.match(MEAL_NAME_PATTERN);
  return match?.[1];
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

  // Explicit "log <food> for <meal>" is always a food command, even if it mentions water.
  const logMatch = message.match(/log\s+(.+?)\s+for\s+(.+)/i);
  if (logMatch) return { intent: 'LOG_FOOD', foodText: logMatch[1], mealName: logMatch[2] };

  const waterAmount = parseWaterAmountOz(message);
  if (waterAmount != null) {
    return { intent: 'LOG_WATER', text: message.trim(), amountOz: waterAmount };
  }

  if (wantsMarkAllExercises(text)) return { intent: 'MARK_ALL_EXERCISES_DONE' };

  if (wantsMarkMealComplete(text)) {
    return { intent: 'MARK_MEAL_COMPLETE', mealName: parseMealName(text) };
  }

  if (wantsMarkExerciseDone(text)) {
    return { intent: 'MARK_EXERCISE_DONE', exerciseName: parseExerciseNameFromMarkDone(text) };
  }

  return { intent: null };
}

const FOOD_SIGNAL_PATTERN =
  /\b(eat|ate|eaten|eating|food|meal|breakfast|brunch|lunch|dinner|snack|hungry|craving|crave|order|ordering|ordered|restaurant|menu|calories?|protein|carbs?|macros?|pizza|burger|salad|sandwich|sub|bowl|taco|burrito|sushi|steak|chicken|beef|fish|rice|pasta|eggs?|oatmeal|smoothie|shake|coffee|latte|dessert|cook|cooking|recipe|drink|drinks|grab|grabbed)\b/i;
const PAST_FOOD_PATTERN =
  /\b(i\s+)?(just\s+)?(ate|had|grabbed|finished|devoured|demolished|chowed|scarfed|ordered|got|drank)\b/i;
const SUGGESTION_PATTERN =
  /\b(what (?:can|should|do|could) i (?:eat|order|get|have|make)|what (?:can|should|do) you (?:suggest|recommend)|what do you (?:suggest|recommend)|where (?:can|should) i|any (?:suggestions?|ideas?|recommendations?)|should i (?:get|order|eat|have)|good options?|what'?s good|recommend|suggest)\b/i;
const AT_VENUE_PATTERN =
  /\b(i'?m|im|we'?re|were)\s+(at|going to|heading to|headed to|about to|thinking (?:about|of))\b/i;

/** Deterministic classification of free-form food text. AMBIGUOUS defers to the AI classifier. */
function classifyFoodRegex(message: string): 'LOG_FOOD' | 'MEAL_SUGGESTION' | 'AMBIGUOUS' | null {
  const text = message.toLowerCase().trim();
  if (!text) return null;
  const isQuestion = text.endsWith('?');

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

/** Strips conversational framing ("I had ... for lunch") to leave just the food description. */
function extractFoodDescription(message: string) {
  let text = message.trim();
  text = text.replace(/\s+for\s+(breakfast|brunch|lunch|dinner|snack)\b.*$/i, '');
  text = text.replace(/^for\s+(breakfast|brunch|lunch|dinner|snack)[,:\s]+/i, '');
  text = text.replace(
    /^(i\s+)?(just\s+)?(ate|had|grabbed|finished|devoured|demolished|chowed|scarfed|ordered|got|drank|am eating|am having|having)\s+/i,
    ''
  );
  return text.trim();
}

async function loadSmsChatHistory(userId: string, phone: string, limit = 8): Promise<ChatMessage[]> {
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

function pickEncouragement() {
  const lines = [
    'Way to go on sticking to the plan!',
    'Nice work — keep that momentum going.',
    'That is a win. Stack another one tomorrow.',
    'Love the consistency. Keep showing up.'
  ];
  return lines[Math.floor(Math.random() * lines.length)];
}

function pickPhotoAcknowledgement() {
  const lines = [
    'Got your photo. My tiny nutrition detective hat is on. I will send the estimate shortly.',
    'Plate pic received. I am putting on my macro goggles now.',
    'Photo locked in. Time to interrogate those carbs, politely.',
    'Got it. The calorie calculator goblin is crunching numbers.',
    'Meal photo received. I am doing food math so you do not have to.',
    'Nice, got the plate. Stand by while I turn pixels into macros.'
  ];
  return lines[Math.floor(Math.random() * lines.length)];
}

type WriteAction = Exclude<SmsAction, { intent: null } | { intent: 'LOG_FOOD' }>;

async function handleWriteAction(userId: string, dateKey: string, timeZone: string | null, action: WriteAction) {
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
      return action.mealName
        ? `I could not find an open meal matching "${action.mealName}".`
        : 'No meals left to mark complete today.';
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
  const log = await ensureDailyLogByUserId(userId, dateKey);
  if (!log) throw new Error('No active program found for today.');

  const meals = await prisma.meal.findMany({
    where: { dailyLogId: log.id },
    include: { items: true },
    orderBy: { mealNumber: 'asc' }
  });

  if (mealNameHint) {
    const named = meals.find((meal) => meal.name.toLowerCase().includes(mealNameHint.toLowerCase()));
    if (named) return named;
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

  for (const item of result.items) {
    if (item.source === 'ai') {
      const estimate = item.estimate;
      await addMealItem(userId, mealId, {
        type: 'ACTUAL',
        nameSnapshot: estimate.normalizedFoodName,
        quantity: 1,
        unit: 'serving',
        calories: estimate.calories,
        protein: estimate.protein,
        carbs: estimate.carbs,
        fat: estimate.fat
      });
      names.push(estimate.normalizedFoodName);
      calories += estimate.calories;
      protein += estimate.protein;
    } else {
      const food = item.food;
      await addMealItem(userId, mealId, {
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
      names.push(food.name);
      calories += n(food.calories);
      protein += n(food.protein);
    }
  }

  return { count: names.length, names, calories, protein };
}

async function handleFoodLog(userId: string, dateKey: string, timeZone: string | null, foodText: string, mealNameHint?: string) {
  const cleaned = foodText.trim();
  if (!cleaned) {
    return 'Tell me what you ate (like "6 oz chicken and a cup of rice") and I will log it for you.';
  }

  const result = await lookupFood(userId, cleaned);
  const meal = await resolveTargetMeal(userId, dateKey, mealNameHint, timeZone);
  const logged = await logLookupResultToMeal(userId, meal.id, result);

  if (!logged.count) {
    return 'I could not pin down the macros on that. Try naming the foods and rough amounts, like "2 eggs and a slice of toast".';
  }

  const dashboard = await getTodayDashboard(userId, dateKey, timeZone);
  const caloriesRemaining = Math.max(0, Math.round(dashboard.summary?.caloriesRemaining ?? 0));
  const proteinRemaining = Math.max(0, Math.round(dashboard.summary?.proteinRemaining ?? 0));
  const foodList = logged.names.join(', ');

  return capSms(
    `Logged to ${meal.name}: ${foodList} — about ${Math.round(logged.calories)} cal and ${Math.round(
      logged.protein
    )}g protein. You have ${caloriesRemaining} cal and ${proteinRemaining}g protein left today. ${pickEncouragement()}`
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

async function handleMealSuggestion(userId: string, message: string) {
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
      return new Error('Twilio requires authentication to download this WhatsApp photo, but TWILIO_AUTH_TOKEN is not configured.');
    }
    return new Error('Twilio rejected the WhatsApp photo download. Check TWILIO_AUTH_TOKEN for the webhook account and try again.');
  }
  if (response.status === 404) {
    return new Error('Twilio could not find the WhatsApp photo. Please resend the image.');
  }
  return new Error('Could not download the WhatsApp photo. Please resend it.');
}

async function downloadSmsImage(media: SmsMedia) {
  let response: Response | null = null;
  for (const options of buildTwilioMediaFetchOptions(media)) {
    response = await fetch(media.url, options);
    if (response.ok) break;
    if (![401, 403].includes(response.status)) break;
  }
  if (!response) throw new Error('Could not download the WhatsApp photo. Please resend it.');
  if (!response.ok) throw twilioMediaDownloadError(response);

  const mimeType = (media.mimeType || response.headers.get('content-type') || '').split(';')[0]!.trim().toLowerCase();
  if (!SUPPORTED_IMAGE_TYPES.has(mimeType)) {
    throw new Error('Send a JPEG, PNG, or WebP food photo.');
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

  return `Estimated from your plate: ${Math.round(totals.calories)} cal, ${Math.round(totals.protein)}g protein, ${Math.round(totals.carbs)}g carbs, ${Math.round(totals.fat)}g fat. I see: ${foodList}. Photo estimates are approximate.`;
}

async function logFoodPhotoEstimates(userId: string, dateKey: string, timeZone: string | null, result: FoodLookupResult, message: string) {
  const meal = await resolveTargetMeal(userId, dateKey, parseMealName(message), timeZone);
  const estimates = result.items
    .filter((item) => item.source === 'ai')
    .map((item) => item.estimate);

  for (const estimate of estimates) {
    await addMealItem(userId, meal.id, {
      type: 'ACTUAL',
      nameSnapshot: estimate.normalizedFoodName,
      quantity: 1,
      unit: 'serving',
      calories: estimate.calories,
      protein: estimate.protein,
      carbs: estimate.carbs,
      fat: estimate.fat
    });
  }

  return { mealName: meal.name, count: estimates.length };
}

async function handleFoodPhoto(userId: string, dateKey: string, timeZone: string | null, media: SmsMedia, message: string) {
  const image = await downloadSmsImage(media);
  const result = await lookupFoodFromImage(userId, image, message);
  const logged = await logFoodPhotoEstimates(userId, dateKey, timeZone, result, message);
  const summary = summarizeFoodPhotoEstimate(result);
  return logged.count > 0 ? `${summary} Logged to ${logged.mealName}.` : summary;
}

async function processFoodPhotoInBackground(user: SmsUser, phone: string, media: SmsMedia, message: string, inboundId: string) {
  let response: string;
  try {
    response = await handleFoodPhoto(user.id, userDayKey(user.timezone), user.timezone, media, message);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Assistant unavailable';
    response = `Sorry, I could not answer that right now. ${detail}`;
  }

  await prisma.smsMessage.update({ where: { id: inboundId }, data: { status: 'PROCESSED', response } });
  const outbound = await prisma.smsMessage.create({
    data: { phone, userId: user.id, direction: 'OUTBOUND', message: response, response, status: 'PROCESSED' }
  });
  try {
    await sendOutboundMessage(phone, response);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Could not send text message.';
    await prisma.smsMessage.update({ where: { id: outbound.id }, data: { status: 'FAILED', response: detail } });
  }
}

export async function handleSms(phone: string, message: string, media?: SmsMedia) {
  const user = await prisma.user.findFirst({ where: { phone } });
  if (!media && isSmsStartKeyword(message)) {
    const response = smsOptInResponse();
    if (user) {
      await prisma.user.update({ where: { id: user.id }, data: { smsOptedOut: false } });
    }
    await prisma.smsMessage.create({
      data: { phone, userId: user?.id, direction: 'INBOUND', message: message.trim(), intent: 'OPT_IN', status: 'PROCESSED', response }
    });
    await prisma.smsMessage.create({
      data: { phone, userId: user?.id, direction: 'OUTBOUND', message: response, response, status: 'PROCESSED' }
    });
    return { response };
  }

  if (!media && isSmsHelpKeyword(message)) {
    const response = smsHelpResponse();
    await prisma.smsMessage.create({
      data: { phone, userId: user?.id, direction: 'INBOUND', message: message.trim(), intent: 'HELP', status: 'PROCESSED', response }
    });
    await prisma.smsMessage.create({
      data: { phone, userId: user?.id, direction: 'OUTBOUND', message: response, response, status: 'PROCESSED' }
    });
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
    await prisma.smsMessage.create({
      data: { phone, userId: user?.id, direction: 'OUTBOUND', message: response, response, status: 'PROCESSED' }
    });
    return { response };
  }

  const action = parseSmsAction(message);
  const isFoodPhoto = Boolean(media);
  const freeformRoute: FreeformFoodRoute =
    !isFoodPhoto && !action.intent && user ? await classifyFreeformFood(message) : null;
  const intent = isFoodPhoto ? 'FOOD_PHOTO' : action.intent ?? freeformRoute ?? 'AI_CHAT';
  const inboundMessage = message.trim() || (isFoodPhoto ? '[WhatsApp image]' : '');

  const inbound = await prisma.smsMessage.create({
    data: { phone, userId: user?.id, direction: 'INBOUND', message: inboundMessage, intent }
  });

  if (!user) {
    const response = 'We could not find a Metabolic user for this phone number.';
    await prisma.smsMessage.create({ data: { phone, direction: 'OUTBOUND', message: response, response, status: 'PROCESSED' } });
    return { inbound, response };
  }

  if (media) {
    const response = pickPhotoAcknowledgement();
    void processFoodPhotoInBackground(user, phone, media, message, inbound.id);
    return { inbound, response };
  }

  const dateKey = userDayKey(user.timezone);
  let response: string;
  try {
    if (action.intent === 'LOG_FOOD') {
      response = await handleFoodLog(user.id, dateKey, user.timezone, action.foodText, action.mealName);
    } else if (action.intent) {
      response = await handleWriteAction(user.id, dateKey, user.timezone, action);
    } else if (freeformRoute === 'LOG_FOOD') {
      response = await handleFoodLog(user.id, dateKey, user.timezone, extractFoodDescription(message), parseMealName(message));
    } else if (freeformRoute === 'MEAL_SUGGESTION') {
      response = await handleMealSuggestion(user.id, message);
    } else {
      response = await handleAiChat(user.id, phone, message);
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Assistant unavailable';
    response = `Sorry, I could not answer that right now. ${detail}`;
  }

  await prisma.smsMessage.update({ where: { id: inbound.id }, data: { status: 'PROCESSED', response } });
  await prisma.smsMessage.create({
    data: { phone, userId: user.id, direction: 'OUTBOUND', message: response, response, status: 'PROCESSED' }
  });
  return { inbound, response };
}
