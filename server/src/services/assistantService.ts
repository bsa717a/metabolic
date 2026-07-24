import { CoachChannel } from '@prisma/client';
import { getTodayDashboard } from './dashboardService.js';
import { getAiProvider, WEB_AGENT_SYSTEM, type ChatMessage } from './aiService.js';
import {
  recordCoachExchange,
  type CoachToolCallMeta
} from './coachConversationService.js';
import {
  buildWebCoachToolDeclarations,
  executeWebCoachTool,
  type ActiveMealContext,
  type MealEditFocus,
  type WebCoachToolContext
} from './webCoachTools.js';
import { EXERCISE_MUTATION_TOOLS } from './exerciseTools.js';
import { prisma } from '../db/prisma.js';
import { env } from '../config/env.js';
import { userDayKey } from '../utils/dates.js';
import { n } from '../utils/numbers.js';
import { isVirtualCoachId, VIRTUAL_COACH_PERSONA_PROMPTS } from '../data/virtualCoachPersonas.js';
import { getHydrationSummary } from './hydrationService.js';
import { loadPersonalizedHydrationGuidance } from './hydrationGuidance.js';
import { parseHydrationGoalOz } from '../utils/waterParse.js';
import {
  applyCoachNameUsage,
  buildCoachNameUsageInstruction,
  resolveCoachNameUsage
} from './coachNameUsage.js';
import { extractPhoneFromUserText, tryAutoSavePhoneFromChat } from './smsSetupService.js';
import {
  buildMemoryPromptSection,
  formatMemoryDisplayReply,
  getVirtualCoachMemoryView,
  isForgetMemoryRequest,
  isShowMemoryRequest,
  awaitMemoryExtraction,
  scheduleMemoryExtraction,
  type MemoryConversationMessage
} from './virtualCoachMemoryService.js';

/** Allergies, dietary preferences, timezone, SMS setup, and first name for personalizing AI replies. */
export async function loadPersonalization(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      firstName: true,
      timezone: true,
      phone: true,
      smsOptedOut: true,
      smsRemindersEnabled: true,
      smsMealRemindersEnabled: true,
      smsEveningRecapEnabled: true,
      selectedVirtualCoachId: true,
      clientProfile: { select: { foodConditions: true, dietNotes: true } }
    }
  });
  return {
    firstName: user?.firstName ?? null,
    timezone: user?.timezone ?? null,
    phone: user?.phone ?? null,
    smsOptedOut: user?.smsOptedOut ?? false,
    smsRemindersEnabled: user?.smsRemindersEnabled ?? true,
    smsMealRemindersEnabled: user?.smsMealRemindersEnabled ?? true,
    smsEveningRecapEnabled: user?.smsEveningRecapEnabled ?? true,
    selectedVirtualCoachId: user?.selectedVirtualCoachId ?? null,
    foodAllergies: user?.clientProfile?.foodConditions ?? null,
    dietaryPreferences: user?.clientProfile?.dietNotes ?? null
  };
}

function mealSummary(meals: Awaited<ReturnType<typeof getTodayDashboard>>['meals']) {
  return meals.map((meal) => ({
    mealNumber: meal.mealNumber,
    name: meal.name,
    plannedTime: meal.plannedTime,
    status: meal.status,
    plannedCalories: n(meal.plannedCalories),
    plannedProtein: n(meal.plannedProtein),
    actualCalories: n(meal.actualCalories),
    items: meal.items.map((item) => ({
      name: item.nameSnapshot,
      type: item.type,
      calories: n(item.calories),
      protein: n(item.protein)
    }))
  }));
}

/**
 * Sums the day's PLANNED meals and compares them to the daily targets so the coach can proactively
 * flag when the plan doesn't add up to the goals ("you're 300 cal under — let's tweak a meal") instead
 * of cheerleading. `offTargets` lists only macros off by a meaningful margin; empty means the plan hits.
 */
function buildPlanBalance(dashboard: Awaited<ReturnType<typeof getTodayDashboard>>) {
  const dl = dashboard.dailyLog;
  if (!dl) return null;
  const planned = dashboard.meals.reduce(
    (acc, meal) => ({
      calories: acc.calories + n(meal.plannedCalories),
      protein: acc.protein + n(meal.plannedProtein),
      carbs: acc.carbs + n(meal.plannedCarbs),
      fat: acc.fat + n(meal.plannedFat)
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
  const target = {
    calories: n(dl.calorieTarget),
    protein: n(dl.proteinTarget),
    carbs: n(dl.carbTarget),
    fat: n(dl.fatTarget)
  };
  const gap = {
    calories: Math.round(planned.calories - target.calories),
    protein: Math.round(planned.protein - target.protein),
    carbs: Math.round(planned.carbs - target.carbs),
    fat: Math.round(planned.fat - target.fat)
  };
  const tolerance: Record<keyof typeof gap, number> = { calories: 100, protein: 15, carbs: 20, fat: 10 };
  const unit: Record<keyof typeof gap, string> = { calories: ' cal', protein: 'g protein', carbs: 'g carbs', fat: 'g fat' };
  const offTargets = (Object.keys(gap) as Array<keyof typeof gap>)
    .filter((macro) => Math.abs(gap[macro]) > tolerance[macro])
    .map((macro) => `${gap[macro] > 0 ? 'over' : 'under'} by ${Math.abs(gap[macro])}${unit[macro]}`);
  return {
    plannedTotals: {
      calories: Math.round(planned.calories),
      protein: Math.round(planned.protein),
      carbs: Math.round(planned.carbs),
      fat: Math.round(planned.fat)
    },
    target,
    gap,
    offTargets,
    plannedHitsTargets: offTargets.length === 0
  };
}

function exerciseSummary(exercises: Awaited<ReturnType<typeof getTodayDashboard>>['exercises']) {
  return exercises.map((entry) => ({
    id: entry.id,
    name: entry.exercise.name,
    status: entry.status,
    sets: entry.sets,
    reps: entry.reps,
    durationMinutes: entry.durationMinutes,
    weight: entry.weight == null ? null : Number(entry.weight),
    scheduledDate: entry.scheduledDate.toISOString().slice(0, 10)
  }));
}

function coachDisplayName(coachId: string | null | undefined) {
  if (!coachId || !isVirtualCoachId(coachId)) return null;
  return coachId.charAt(0).toUpperCase() + coachId.slice(1);
}

function normalizeVirtualCoachSmsNumber(raw: string) {
  return raw.replace(/^sms:/i, '').trim();
}

function buildSmsSupport(personalization: Awaited<ReturnType<typeof loadPersonalization>>) {
  const virtualCoachSmsNumber =
    normalizeVirtualCoachSmsNumber(env.TWILIO_PHONE_NUMBER) || '+13853634403';
  const coachName = coachDisplayName(personalization.selectedVirtualCoachId);
  const hasPhone = Boolean(personalization.phone?.trim());
  const hasTimezone = Boolean(personalization.timezone?.trim());
  const isReadyForTexting =
    hasPhone &&
    hasTimezone &&
    personalization.smsRemindersEnabled &&
    !personalization.smsOptedOut;

  const textingInstructions =
    'If they saved your contact during setup, they can text that contact directly and replies show under your name (all coaches share virtualCoachSmsNumber). Otherwise text START once from their mobile to opt in.';

  let setupSummary: string;
  let nextStepOnly: string;

  if (personalization.smsOptedOut) {
    setupSummary =
      'User opted out of SMS (STOP). They can text START to the virtual coach number to re-subscribe.';
    nextStepOnly =
      'Explain they opted out and can text START to virtualCoachSmsNumber to re-subscribe. Do not mention coach contact download until isReadyForTexting is true.';
  } else if (!hasPhone) {
    setupSummary = 'SMS is not ready yet: missing their personal mobile phone.';
    nextStepOnly =
      'ONLY explain that texting you requires their personal cell on file, then offer: "Give me your cell number and I can save it for you right here." Do NOT mention saved coach contacts, texting the coach number, or START yet.';
  } else if (!hasTimezone) {
    setupSummary = 'SMS is not ready yet: phone is saved but timezone is missing.';
    nextStepOnly =
      'ONLY ask for their timezone (or save it with update_sms_setup). Do NOT mention saved coach contacts, texting the coach number, or START yet.';
  } else if (!personalization.smsRemindersEnabled) {
    setupSummary = 'Phone and timezone are set, but text reminders are turned off.';
    nextStepOnly =
      'ONLY help them turn reminders on (update_sms_setup with enableReminders). Do NOT mention saved coach contacts or texting until reminders are on.';
  } else {
    setupSummary = 'App-side SMS setup looks good (phone, timezone, text reminders on).';
    nextStepOnly = textingInstructions;
  }

  return {
    coachName,
    virtualCoachSmsNumber,
    userMobilePhone: personalization.phone,
    timezone: personalization.timezone,
    smsOptedOut: personalization.smsOptedOut,
    textRemindersEnabled: personalization.smsRemindersEnabled,
    mealRemindersEnabled: personalization.smsMealRemindersEnabled,
    eveningRecapEnabled: personalization.smsEveningRecapEnabled,
    isReadyForTexting,
    setupSummary,
    nextStepOnly,
    textingInstructions: isReadyForTexting ? textingInstructions : null,
    chatSetupActions: hasPhone
      ? isReadyForTexting
        ? 'SMS profile is complete. Follow nextStepOnly / textingInstructions for how to text you.'
        : 'Finish the missing piece in setupSummary using update_sms_setup. Do NOT explain how to text you until isReadyForTexting is true.'
      : 'You CAN save their mobile phone in this chat with update_sms_setup. Follow nextStepOnly exactly — get their number first, nothing about texting the coach yet.'
  };
}

function buildAppGuide() {
  return {
    accountDetails: 'Top right → their name → Account details (phone, timezone, text reminder toggles).',
    meals: 'Nutrition page — review today\'s meals, log what they ate, and edit the plan.',
    exercise: 'Exercise page — review today\'s workout, start a guided session, or ask me in chat to add/change exercises.',
    hydration:
      'Water jug in the top bar on every page — tap it to log water, see today\'s progress, and change their daily goal. They can also log water or change their goal in this chat.'
  };
}

async function buildHydrationSupport(
  userId: string,
  dateKey: string,
  timeZone: string | null,
  program: Awaited<ReturnType<typeof getTodayDashboard>>['program']
) {
  const guidance = await loadPersonalizedHydrationGuidance(userId);

  let todayLoggedOz: number | null = null;
  let goalMetToday: boolean | null = null;
  if (program) {
    try {
      const summary = await getHydrationSummary(userId, dateKey, timeZone);
      todayLoggedOz = summary.actualOz;
      goalMetToday = summary.goalMet;
    } catch {
      // No daily log yet — still expose goal and typical intake.
    }
  }

  return {
    goalOz: guidance.goalOz,
    todayLoggedOz,
    goalMetToday,
    heightInches: guidance.heightInches,
    weightLbs: guidance.weightLbs,
    typicalIntake: guidance.typicalIntake,
    personalizedGoalGuidance: guidance.personalizedGoalGuidance,
    waterJugUi:
      'Tap the water jug in the top bar on any page to log water, see progress, and adjust their daily goal.',
    chatActions:
      'You CAN set their hydration goal here with set_hydration_goal (1–512 oz). For hydration goal questions, call get_hydration_status first to load personalized typical intake from their height/weight, then lead with that guidance before explaining how to change the goal. Use log_water to log intake. Do NOT send them to a Hydration page — use waterJugUi instead.'
  };
}

export async function buildAssistantContext(userId: string) {
  const personalization = await loadPersonalization(userId);
  const smsSupport = buildSmsSupport(personalization);
  const appGuide = buildAppGuide();
  const dateKey = userDayKey(personalization.timezone);
  const dashboard = await getTodayDashboard(userId, dateKey, personalization.timezone);
  const hydrationSupport = await buildHydrationSupport(
    userId,
    dateKey,
    personalization.timezone,
    dashboard.program
  );
  if (!dashboard.program) {
    return JSON.stringify({
      hasProgram: false,
      message: 'User has no active program.',
      smsSupport,
      appGuide,
      hydrationSupport,
      profile: {
        firstName: personalization.firstName,
        foodAllergies: personalization.foodAllergies,
        dietaryPreferences: personalization.dietaryPreferences
      }
    });
  }

  return JSON.stringify({
    hasProgram: true,
    smsSupport,
    appGuide,
    hydrationSupport,
    profile: {
      firstName: personalization.firstName,
      foodAllergies: personalization.foodAllergies,
      dietaryPreferences: personalization.dietaryPreferences,
      timezone: personalization.timezone
    },
    program: {
      name: dashboard.program.name,
      status: dashboard.program.status
    },
    today: dashboard.dailyLog
      ? {
          date: dashboard.dailyLog.date.toISOString().slice(0, 10),
          calorieTarget: n(dashboard.dailyLog.calorieTarget),
          caloriesActual: n(dashboard.dailyLog.caloriesActual),
          proteinTarget: n(dashboard.dailyLog.proteinTarget),
          proteinActual: n(dashboard.dailyLog.proteinActual),
          carbTarget: n(dashboard.dailyLog.carbTarget),
          carbsActual: n(dashboard.dailyLog.carbsActual),
          fatTarget: n(dashboard.dailyLog.fatTarget),
          fatActual: n(dashboard.dailyLog.fatActual),
          complianceScore: n(dashboard.dailyLog.complianceScore)
        }
      : null,
    planBalance: buildPlanBalance(dashboard),
    summary: dashboard.summary,
    nextMeal: dashboard.nextMeal,
    meals: mealSummary(dashboard.meals),
    upcomingMeals: dashboard.meals
      .filter((meal) => !['EATEN_AS_PLANNED', 'SKIPPED', 'MISSED'].includes(meal.status))
      .map((meal) => ({
        mealNumber: meal.mealNumber,
        name: meal.name,
        plannedTime: meal.plannedTime,
        status: meal.status
      })),
    exercises: exerciseSummary(dashboard.exercises),
    weightTrend: dashboard.weightTrend.slice(-7)
  });
}

/** Compact context for SMS — keeps Gemini system instructions within size limits. */
export async function buildSmsAssistantContext(userId: string) {
  const personalization = await loadPersonalization(userId);
  const smsSupport = buildSmsSupport(personalization);
  const dashboard = await getTodayDashboard(userId, userDayKey(personalization.timezone), personalization.timezone);
  if (!dashboard.program) {
    return JSON.stringify({
      hasProgram: false,
      message: 'User has no active program.',
      smsSupport,
      profile: {
        firstName: personalization.firstName,
        foodAllergies: personalization.foodAllergies,
        dietaryPreferences: personalization.dietaryPreferences
      }
    });
  }

  return JSON.stringify({
    hasProgram: true,
    smsSupport,
    profile: {
      firstName: personalization.firstName,
      foodAllergies: personalization.foodAllergies,
      dietaryPreferences: personalization.dietaryPreferences,
      timezone: personalization.timezone
    },
    program: { name: dashboard.program.name, status: dashboard.program.status },
    today: dashboard.dailyLog
      ? {
          date: dashboard.dailyLog.date.toISOString().slice(0, 10),
          calorieTarget: n(dashboard.dailyLog.calorieTarget),
          caloriesActual: n(dashboard.dailyLog.caloriesActual),
          proteinTarget: n(dashboard.dailyLog.proteinTarget),
          proteinActual: n(dashboard.dailyLog.proteinActual),
          carbTarget: n(dashboard.dailyLog.carbTarget),
          carbsActual: n(dashboard.dailyLog.carbsActual),
          fatTarget: n(dashboard.dailyLog.fatTarget),
          fatActual: n(dashboard.dailyLog.fatActual)
        }
      : null,
    planBalance: buildPlanBalance(dashboard),
    summary: dashboard.summary,
    nextMeal: dashboard.nextMeal,
    mealsToday: dashboard.meals.map((meal) => ({
      mealNumber: meal.mealNumber,
      name: meal.name,
      plannedTime: meal.plannedTime,
      status: meal.status,
      plannedCalories: n(meal.plannedCalories),
      plannedProtein: n(meal.plannedProtein),
      plannedCarbs: n(meal.plannedCarbs),
      plannedFat: n(meal.plannedFat),
      actualCalories: n(meal.actualCalories),
      actualProtein: n(meal.actualProtein),
      actualCarbs: n(meal.actualCarbs),
      actualFat: n(meal.actualFat),
      topItems: meal.items
        .filter((item) => item.type === 'PLANNED' && item.nameSnapshot.trim())
        .slice(0, 4)
        .map((item) => item.nameSnapshot),
      loggedItems: meal.items
        .filter((item) => item.type === 'ACTUAL' && item.nameSnapshot.trim())
        .slice(0, 6)
        .map((item) => item.nameSnapshot)
    })),
    upcomingMeals: dashboard.meals
      .filter((meal) => !['EATEN_AS_PLANNED', 'SKIPPED', 'MISSED'].includes(meal.status))
      .map((meal) => ({
        mealNumber: meal.mealNumber,
        name: meal.name,
        plannedTime: meal.plannedTime,
        status: meal.status
      })),
    exercisesToday: exerciseSummary(dashboard.exercises),
    coachingHighlights: dashboard.dailyLog
      ? {
          mealsCompleted: dashboard.dailyLog.mealsCompleted,
          mealsPlanned: dashboard.dailyLog.mealsPlanned,
          exercisesCompleted: dashboard.dailyLog.exercisesCompleted,
          exercisesPlanned: dashboard.dailyLog.exercisesPlanned,
          complianceScore: n(dashboard.dailyLog.complianceScore),
          goalProgress: dashboard.summary?.goalProgress ?? null
        }
      : null
  });
}

function buildMealEditFocusInstruction(focus: MealEditFocus) {
  const targetLine =
    focus.targetCalories && focus.targetCalories > 0
      ? `This meal's calorie target is about ${Math.round(focus.targetCalories)} kcal (±10% is fine).`
      : `Stay close to this meal's planned calorie target from context.`;
  return `MEAL EDIT MODE is active for "${focus.mealName}" on ${focus.date} only${focus.mealId ? ` (mealId "${focus.mealId}")` : ''}.
The user is changing the PLANNED foods for that one meal — not logging what they already ate, and not editing the rest of the day.
- To add one food, call add_meal_item. To change one food's portion/macros, call update_meal_item. To remove one food, call remove_meal_item. Use these for single-item changes instead of replacing the whole meal.
- Only when the user gives a whole new list (or picks a numbered suggestion), call update_planned_meals with that meal's full itemized foods (name, quantity, unit, calories, protein, carbs, fat per item).
- To rename this meal only, call rename_meal with newName. To change only its clock time, call update_meal_time. Never use update_planned_meals just to change the title or time.
- When unsure of the current items or their ids, call get_meal_details first.
- NEVER call log_food, mark_meal_complete, log_water, or other day-logging tools here.
- Do not report leftover daily calories unless they ask — stay on this meal.
- ${targetLine}
- Never claim a change happened unless the matching tool returned a result this turn. After a successful change, briefly confirm what changed and the new planned totals. If calories are outside ±10% of the target, offer to rebalance (adjust items/portions or use suggest_meals).
- Stay on this meal until they clearly say they are done.
`;
}

/** Meal tools that mutate the plan — used to detect real changes and trigger client refresh. */
const MEAL_MUTATION_TOOLS = new Set([
  'update_planned_meals',
  'add_meal_item',
  'update_meal_item',
  'remove_meal_item',
  'create_meal',
  'delete_meal',
  'rename_meal',
  'update_meal_time',
  'copy_meal_to_days'
]);

function claimsMealRename(reply: string) {
  return (
    /(?:updated|changed|renamed|set)\b.{0,40}\b(?:meal\s+)?name\b/i.test(reply) ||
    /\bmeal name\b.{0,40}\b(?:to|as|is now)\b/i.test(reply) ||
    /\brenamed\b.{0,40}\bto\b/i.test(reply)
  );
}

/** Detects replies that claim a planned-meal food update happened. */
export function claimsMealPlanUpdate(reply: string) {
  return (
    /\bi(?:'ve| have)\s+(?:updated|changed|swapped|replaced|applied|saved)\b.{0,80}\bmeal\b/i.test(reply) ||
    /\b(?:updated|changed|swapped|replaced|applied)\s+(?:your|the)\s+(?:\w+\s+){0,4}meal\b/i.test(reply) ||
    /\b(?:your|the)\s+(?:\w+\s+){0,3}meal\s+(?:is|was)\s+now\b/i.test(reply)
  );
}

/**
 * A short reply that reads like the coach finished an action — a bare "Got it!", "Done", "All set",
 * or a past-tense "added/created/updated…". Deliberately narrow: skips questions, negations, and
 * long substantive answers so it only flags hollow completion claims.
 */
export function claimsCompletion(reply: string) {
  const r = reply.trim();
  if (!r || r.length > 240) return false;
  if (/\?\s*$/.test(r)) return false;
  if (/\b(can'?t|cannot|couldn'?t|didn'?t|haven'?t|hasn'?t|won'?t|wasn'?t|weren'?t|isn'?t|unable|not able)\b/i.test(r)) {
    return false;
  }
  return /\b(got it|all set|done|taken care of|added|created|updated|changed|renamed|swapped|removed|deleted|moved (?:your|the)|set (?:your|the))\b/i.test(
    r
  );
}

/**
 * A reply that CLAIMS the water goal was already changed — "your water goal is now 120 oz",
 * "I've set your goal to 120 oz", "updated your water goal to 120". Deliberately excludes questions,
 * offers ("want me to set it?"), future/conditional ("I'll set it", "let's"), ability ("I can set"),
 * and negations, so advisory hydration answers are never clobbered into the canned message.
 */
export function claimsHydrationGoalSet(reply: string) {
  const r = reply.trim();
  if (/\?\s*$/.test(r)) return false;
  if (
    /\b(can'?t|cannot|couldn'?t|haven'?t|hasn'?t|didn'?t|won'?t|unable|not able|want me to|would you|should i|do you want|i'?ll|i will|let'?s|going to|happy to|i can|i could|you can|you could)\b/i.test(
      r
    )
  ) {
    return false;
  }
  return (
    /\b(?:water|hydration)\s+goal\s+(?:is\s+now|has\s+been\s+(?:set|updated|changed)|(?:updated|changed|set)\s+to)\b/i.test(
      r
    ) ||
    /\bi(?:'ve| have)\s+(?:set|updated|changed|adjusted)\b[^.?!]{0,50}\bgoal\b/i.test(r) ||
    /\b(?:set|updated|changed)\s+your\s+(?:daily\s+)?(?:water|hydration)\s+goal\s+to\b/i.test(r)
  );
}

/**
 * The user's message plausibly asks the coach to change or build the plan (verb + a meal/plan
 * target). Used only as a post-hoc gate for {@link claimsCompletion} — not a pre-model short-circuit.
 */
export function userRequestedMealAction(text: string) {
  return (
    /\b(add|added|adding|remove|delete|drop|change|swap|replace|rename|move|set|create|make|build|update|pick|choose|use|do|let'?s do)\b/i.test(
      text
    ) &&
    /\b(meal|breakfast|lunch|dinner|snack|option|number\s*\d|food|item|portion|time|\d\s*(?:am|pm)|it|that|this one|number one|first one|second one|third one)\b/i.test(
      text
    )
  );
}

/** Detects replies that claim an exercise/workout plan change happened. */
export function claimsExercisePlanUpdate(reply: string) {
  return (
    /\bi(?:'ve| have)\s+(?:added|updated|changed|removed|skipped|marked)\b.{0,80}\b(?:exercise|workout|set|rep)\b/i.test(
      reply
    ) ||
    /\b(?:added|updated|changed|removed|skipped|marked)\s+(?:your|the|that|this)\s+(?:\w+\s+){0,4}(?:exercise|workout)\b/i.test(
      reply
    ) ||
    /\b(?:exercise|workout)\s+(?:is|was)\s+now\b/i.test(reply)
  );
}

/**
 * The user's message plausibly asks to change today's workout (verb + exercise/workout target).
 * Post-hoc gate for {@link claimsCompletion} only.
 */
export function userRequestedExerciseAction(text: string) {
  return (
    /\b(add|added|adding|remove|delete|drop|change|swap|replace|skip|mark|update|create|make|build|suggest|pick|choose|use|do|let'?s do)\b/i.test(
      text
    ) &&
    /\b(exercise|workout|sets?|reps?|squat|push-?up|pull-?up|deadlift|bench|run|walk|lift|cardio|option|number\s*\d|it|that|this one)\b/i.test(
      text
    )
  );
}

/** User picking a numbered suggestion: "2", "option 2", "#1". */
export function parseMealOptionPick(text: string): number | null {
  const trimmed = text.trim();
  const match = trimmed.match(/^(?:option\s*|choice\s*|#\s*)?([1-5])(?:\s*[.)])?$/i);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

export async function chatWithAssistant(
  userId: string,
  messages: ChatMessage[],
  options?: { mealEditFocus?: MealEditFocus; activeMeal?: ActiveMealContext }
) {
  const mealEditFocus = options?.mealEditFocus;
  const activeMeal = options?.activeMeal ?? (mealEditFocus?.mealId
    ? {
        mealId: mealEditFocus.mealId,
        mealName: mealEditFocus.mealName,
        date: mealEditFocus.date
      }
    : undefined);
  const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user')?.content.trim() ?? '';
  let memoryView = await getVirtualCoachMemoryView(userId);

  if (isShowMemoryRequest(lastUserMessage)) {
    return { reply: formatMemoryDisplayReply(memoryView), contextUsed: true };
  }

  if (isForgetMemoryRequest(lastUserMessage)) {
    await awaitMemoryExtraction(userId, 'web_chat', toMemoryMessages(messages));
    memoryView = await getVirtualCoachMemoryView(userId);
  }

  const context = await buildAssistantContext(userId);
  const personalization = await loadPersonalization(userId);
  const coachId =
    personalization.selectedVirtualCoachId && isVirtualCoachId(personalization.selectedVirtualCoachId)
      ? personalization.selectedVirtualCoachId
      : null;
  const namePolicy = resolveCoachNameUsage(coachId);
  const coachMessageNumber = messages.filter((message) => message.role === 'assistant').length + 1;
  const nameInstruction = buildCoachNameUsageInstruction(
    coachMessageNumber,
    personalization.firstName,
    namePolicy
  );
  const memorySection = buildMemoryPromptSection(memoryView);
  const memoryInstruction = memorySection ? `${memorySection}\n\n` : '';
  const personaPrefix =
    coachId
      ? `${VIRTUAL_COACH_PERSONA_PROMPTS[coachId]}\n\nAlso serve as their in-app assistant when they ask quick questions between check-ins.\n\n`
      : '';
  const sharedPhone = extractPhoneFromUserText(lastUserMessage);
  const smsThread = messages.some((message) => /sms|text(ing)?|phone|reminder|number/i.test(message.content));
  const phoneSaveInstruction =
    sharedPhone && (smsThread || !personalization.phone?.trim())
      ? `The user's latest message includes a phone number (${sharedPhone}). Call update_sms_setup with that phone before you reply — do not tell them to enter it in Account details.\n\n`
      : '';
  const hydrationGoalInstruction = buildHydrationGoalInstruction(context, lastUserMessage);
  // Only treat an explicit ounce amount as a goal — a bare number like "2" is a meal-option pick, not a goal.
  const hydrationGoalOz = parseHydrationGoalOz(lastUserMessage, { allowBareNumber: false });
  const hydrationGoalSetInstruction =
    hydrationGoalOz != null
      ? `The user's message sets their hydration goal to ${hydrationGoalOz} oz. You MUST call set_hydration_goal with goalOz ${hydrationGoalOz} before you reply — do not claim it is updated otherwise.\n\n`
      : '';

  const autoPhoneSave = await tryAutoSavePhoneFromChat(
    userId,
    lastUserMessage,
    messages,
    personalization.phone
  );
  if (autoPhoneSave) {
    const rawReply = autoPhoneSave.ok ? autoPhoneSave.result : autoPhoneSave.error;
    const reply = applyCoachNameUsage(rawReply, personalization.firstName, coachMessageNumber, namePolicy);
    const memoryMessages: MemoryConversationMessage[] = [
      ...toMemoryMessages(messages),
      { role: 'assistant', content: reply }
    ];
    if (memoryMessages.length >= 2) {
      scheduleMemoryExtraction(userId, 'web_chat', memoryMessages);
    }
    return { reply, contextUsed: true };
  }

  const toolCtx: WebCoachToolContext = {
    userId,
    dateKey: userDayKey(personalization.timezone),
    timeZone: personalization.timezone,
    message: lastUserMessage,
    toolCalls: [],
    mealEditFocus,
    activeMeal
  };
  const mealEditInstruction = mealEditFocus ? `${buildMealEditFocusInstruction(mealEditFocus)}\n\n` : '';
  const systemPrompt =
    `${WEB_AGENT_SYSTEM}\n\n${mealEditInstruction}${memoryInstruction}${phoneSaveInstruction}${hydrationGoalInstruction}${hydrationGoalSetInstruction}${nameInstruction ? `${nameInstruction}\n\n` : ''}${personaPrefix}`.trim();

  // The client transcript is the source of context for this turn: on open it is hydrated from the
  // unified server history (see /coach-history), so it already carries prior web + SMS turns plus
  // the local-only turns (meal picker prompts, meal detail cards, quick replies) the model needs.
  // We persist the exchange below only after the model succeeds, so a failed run never leaves an
  // orphaned user turn that a retry would duplicate.
  const conversation = messages;

  // Let the model drive: it picks the right meal tool (add/update/remove item, create/delete/rename/
  // retime meal, replace items, copy days) and the tool results are the source of truth. We only
  // verify afterward that any claimed change actually ran.
  const rawReply = await getAiProvider().runAgent({
    messages: conversation,
    context,
    tools: buildWebCoachToolDeclarations({ mealEditFocus }),
    toolExecutor: (name, args) => executeWebCoachTool(toolCtx, name, args),
    systemPrompt
  });

  const mealMutated = toolCtx.toolCalls.some((call) => MEAL_MUTATION_TOOLS.has(call.name));
  const exerciseMutated = toolCtx.toolCalls.some((call) => EXERCISE_MUTATION_TOOLS.has(call.name));
  const renameCall = toolCtx.toolCalls.find((call) => call.name === 'rename_meal');
  const timeCall = toolCtx.toolCalls.find((call) => call.name === 'update_meal_time');
  const goalWasSetByTool = toolCtx.toolCalls.some((call) => call.name === 'set_hydration_goal');

  let effectiveReply = rawReply;

  // Post-hoc verification: if the reply claims a change but no matching tool actually ran, tell the
  // truth instead of confirming a phantom change. The completion-claim branch catches generic
  // acknowledgments ("Got it!", "Derek, got it!") when the user clearly asked for a plan change.
  if (
    !mealMutated &&
    (claimsMealRename(rawReply) ||
      claimsMealPlanUpdate(rawReply) ||
      (userRequestedMealAction(lastUserMessage) && claimsCompletion(rawReply)))
  ) {
    effectiveReply =
      "I haven't actually changed your plan yet — tell me exactly what to change (which meal and how) and I'll make it for real.";
  } else if (
    !exerciseMutated &&
    (claimsExercisePlanUpdate(rawReply) ||
      (userRequestedExerciseAction(lastUserMessage) && claimsCompletion(rawReply)))
  ) {
    effectiveReply =
      "I haven't actually changed your workout yet — tell me exactly what to change (which exercise and how) and I'll make it for real.";
  } else if (!mealEditFocus && !goalWasSetByTool && claimsHydrationGoalSet(rawReply)) {
    effectiveReply =
      "I haven't updated your water goal yet — tell me the number of ounces you want and I'll set it for real.";
  }

  const mealRenamed =
    renameCall && typeof renameCall.args.mealId === 'string' && typeof renameCall.args.newName === 'string'
      ? {
          mealId: renameCall.args.mealId,
          newName: renameCall.args.newName,
          ...(typeof renameCall.args.previousName === 'string' ? { previousName: renameCall.args.previousName } : {}),
          ...(typeof renameCall.args.date === 'string' ? { date: renameCall.args.date } : {})
        }
      : undefined;

  const mealTimeUpdate =
    timeCall && typeof timeCall.args.mealId === 'string' && typeof timeCall.args.plannedTime === 'string'
      ? {
          mealId: timeCall.args.mealId,
          mealName: typeof timeCall.args.mealName === 'string' ? timeCall.args.mealName : '',
          plannedTime: timeCall.args.plannedTime,
          ...(typeof timeCall.args.date === 'string' ? { date: timeCall.args.date } : {})
        }
      : undefined;

  const reply = applyCoachNameUsage(effectiveReply, personalization.firstName, coachMessageNumber, namePolicy);

  // Record the exchange (user turn + assistant reply with its tool audit) now that the run
  // succeeded, so the unified thread stays in sync and a failed run leaves nothing half-written.
  await recordCoachExchange(
    userId,
    CoachChannel.WEB,
    lastUserMessage,
    reply,
    toolCtx.toolCalls as CoachToolCallMeta[]
  );

  const memoryMessages: MemoryConversationMessage[] = [
    ...toMemoryMessages(messages),
    { role: 'assistant', content: reply }
  ];
  if (memoryMessages.length >= 2) {
    scheduleMemoryExtraction(userId, 'web_chat', memoryMessages);
  }

  return {
    reply,
    contextUsed: true,
    ...(goalWasSetByTool ? { hydrationGoalUpdated: true } : {}),
    // Any meal mutation triggers a client refresh of the plan.
    ...(mealMutated ? { plannedMealsUpdated: true } : {}),
    // Any exercise mutation triggers a client refresh of the workout plan.
    ...(exerciseMutated ? { exercisesUpdated: true } : {}),
    ...(mealRenamed ? { mealRenamed: true, mealRename: mealRenamed } : {}),
    ...(mealTimeUpdate ? { mealTimeUpdated: true, mealTimeUpdate } : {})
  };
}

function toMemoryMessages(messages: ChatMessage[]): MemoryConversationMessage[] {
  return messages
    .filter((message) => message.content.trim())
    .map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: message.content.trim()
    }));
}

function isHydrationGoalQuestion(text: string) {
  const t = text.toLowerCase();
  const mentionsWater = /(hydration|water|fluid)/.test(t);
  return (
    /(?:hydration|water)\s*goal/.test(t) ||
    /(?:change|set|update|adjust|modify|choose|pick)\b[^.]*\b(?:hydration|water)/.test(t) ||
    // Advisory questions: "what should my hydration be", "how much water should I drink",
    // "how many ounces should I have", "hydration recommendation for my weight".
    (mentionsWater &&
      /(what\s+should|how\s+much|how\s+many|should\s+i\s+drink|recommend|intake|per\s+day|daily|for\s+my\s+weight|be\??$)/.test(
        t
      ))
  );
}

function buildHydrationGoalInstruction(contextJson: string, lastUserMessage: string) {
  if (!isHydrationGoalQuestion(lastUserMessage)) return '';
  try {
    const ctx = JSON.parse(contextJson) as {
      hydrationSupport?: { personalizedGoalGuidance?: string };
    };
    const guidance = ctx.hydrationSupport?.personalizedGoalGuidance?.trim();
    if (guidance) {
      return `The user is asking about their hydration/water goal. You MUST include this personalized guidance near the start of your reply: "${guidance}" Then explain they can tell you a new goal in ounces (you will set it with set_hydration_goal) or tap the water jug in the top bar.\n\n`;
    }
  } catch {
    // Fall through to tool-based lookup.
  }
  return `The user is asking about their hydration/water goal. Call get_hydration_status first to look up personalized typical intake from their height/weight, then include that before explaining how to set a new goal.\n\n`;
}

export async function suggestMealOptions(userId: string, inputText: string) {
  const personalization = await loadPersonalization(userId);
  const dashboard = await getTodayDashboard(userId, userDayKey(personalization.timezone), personalization.timezone);
  const context = JSON.stringify({
    profile: {
      firstName: personalization.firstName,
      foodAllergies: personalization.foodAllergies,
      dietaryPreferences: personalization.dietaryPreferences
    },
    today: dashboard.dailyLog
      ? {
          calorieTarget: n(dashboard.dailyLog.calorieTarget),
          caloriesActual: n(dashboard.dailyLog.caloriesActual),
          caloriesRemaining: dashboard.summary?.caloriesRemaining ?? null,
          proteinTarget: n(dashboard.dailyLog.proteinTarget),
          proteinActual: n(dashboard.dailyLog.proteinActual),
          proteinRemaining: dashboard.summary
            ? Math.max(0, n(dashboard.dailyLog.proteinTarget) - n(dashboard.dailyLog.proteinActual))
            : null
        }
      : null,
    currentMeals: dashboard.meals.map((meal) => ({
      mealNumber: meal.mealNumber,
      name: meal.name,
      plannedCalories: n(meal.plannedCalories),
      plannedProtein: n(meal.plannedProtein),
      actualCalories: n(meal.actualCalories),
      actualProtein: n(meal.actualProtein)
    }))
  });
  const result = await getAiProvider().suggestMealOptions(inputText, context);
  return { ...result, contextUsed: true };
}

const SMS_MAX_LENGTH = 1500;

function truncateSmsReply(reply: string) {
  const trimmed = reply.trim();
  if (trimmed.length <= SMS_MAX_LENGTH) return trimmed;
  return `${trimmed.slice(0, SMS_MAX_LENGTH - 1)}…`;
}

export async function chatWithSmsAssistant(userId: string, messages: ChatMessage[]) {
  const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user')?.content.trim() ?? '';
  let memoryView = await getVirtualCoachMemoryView(userId);

  if (isShowMemoryRequest(lastUserMessage)) {
    return { reply: truncateSmsReply(formatMemoryDisplayReply(memoryView)), contextUsed: true };
  }

  if (isForgetMemoryRequest(lastUserMessage)) {
    await awaitMemoryExtraction(userId, 'sms', toMemoryMessages(messages));
    memoryView = await getVirtualCoachMemoryView(userId);
  }

  const context = await buildSmsAssistantContext(userId);
  const memorySection = buildMemoryPromptSection(memoryView);
  const memoryInstruction = memorySection ? `${memorySection}\n\n` : '';
  const reply = await getAiProvider().chat(messages, context, 'sms', memoryInstruction);
  const truncated = truncateSmsReply(reply);

  const memoryMessages: MemoryConversationMessage[] = [
    ...toMemoryMessages(messages),
    { role: 'assistant', content: truncated }
  ];
  if (memoryMessages.length >= 2) {
    scheduleMemoryExtraction(userId, 'sms', memoryMessages);
  }

  return { reply: truncated, contextUsed: true };
}
