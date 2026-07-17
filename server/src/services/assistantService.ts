import { getTodayDashboard } from './dashboardService.js';
import { getAiProvider, WEB_AGENT_SYSTEM, type ChatMessage } from './aiService.js';
import { buildWebCoachToolDeclarations, executeWebCoachTool, type WebCoachToolContext } from './webCoachTools.js';
import { prisma } from '../db/prisma.js';
import { env } from '../config/env.js';
import { userDayKey } from '../utils/dates.js';
import { n } from '../utils/numbers.js';
import { isVirtualCoachId, VIRTUAL_COACH_PERSONA_PROMPTS } from '../data/virtualCoachPersonas.js';
import { getHydrationSummary, tryAutoSetHydrationGoalFromChat } from './hydrationService.js';
import { loadPersonalizedHydrationGuidance } from './hydrationGuidance.js';
import { isHydrationGoalThread, parseHydrationGoalOz } from '../utils/waterParse.js';
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

function exerciseSummary(exercises: Awaited<ReturnType<typeof getTodayDashboard>>['exercises']) {
  return exercises.map((entry) => ({
    name: entry.exercise.name,
    status: entry.status,
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
    exercise: 'Exercise page — review today\'s workout and mark exercises done.',
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
          complianceScore: n(dashboard.dailyLog.complianceScore)
        }
      : null,
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
          proteinActual: n(dashboard.dailyLog.proteinActual)
        }
      : null,
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

export async function chatWithAssistant(userId: string, messages: ChatMessage[]) {
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
  const hydrationGoalOz = parseHydrationGoalOz(lastUserMessage, {
    allowBareNumber: isHydrationGoalThread(messages)
  });
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

  const autoHydrationGoalSave = await tryAutoSetHydrationGoalFromChat(
    userId,
    lastUserMessage,
    messages,
    personalization.timezone
  );
  if (autoHydrationGoalSave) {
    const rawReply = autoHydrationGoalSave.ok ? autoHydrationGoalSave.result : autoHydrationGoalSave.error;
    const reply = applyCoachNameUsage(rawReply, personalization.firstName, coachMessageNumber, namePolicy);
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
      ...(autoHydrationGoalSave.ok ? { hydrationGoalUpdated: true, hydrationGoalOz: autoHydrationGoalSave.goalOz } : {})
    };
  }

  const toolCtx: WebCoachToolContext = {
    userId,
    dateKey: userDayKey(personalization.timezone),
    timeZone: personalization.timezone,
    message: lastUserMessage,
    toolCalls: []
  };
  const rawReply = await getAiProvider().runAgent({
    messages,
    context,
    tools: buildWebCoachToolDeclarations(),
    toolExecutor: (name, args) => executeWebCoachTool(toolCtx, name, args),
    systemPrompt: `${WEB_AGENT_SYSTEM}\n\n${memoryInstruction}${phoneSaveInstruction}${hydrationGoalInstruction}${hydrationGoalSetInstruction}${nameInstruction ? `${nameInstruction}\n\n` : ''}${personaPrefix}`.trim()
  });

  const goalWasSetByTool = toolCtx.toolCalls.some((call) => call.name === 'set_hydration_goal');
  const claimedGoalChange =
    !goalWasSetByTool &&
    /(?:goal|target).*(?:now|updated|changed|set)|(?:set|updated|changed).*(?:goal|target)/i.test(rawReply);
  if (claimedGoalChange) {
    const fallbackGoalSave = await tryAutoSetHydrationGoalFromChat(
      userId,
      lastUserMessage,
      messages,
      personalization.timezone
    );
    if (fallbackGoalSave?.ok) {
      const reply = applyCoachNameUsage(fallbackGoalSave.result, personalization.firstName, coachMessageNumber, namePolicy);
      const memoryMessages: MemoryConversationMessage[] = [
        ...toMemoryMessages(messages),
        { role: 'assistant', content: reply }
      ];
      if (memoryMessages.length >= 2) {
        scheduleMemoryExtraction(userId, 'web_chat', memoryMessages);
      }
      return { reply, contextUsed: true, hydrationGoalUpdated: true, hydrationGoalOz: fallbackGoalSave.goalOz };
    }
  }

  const reply = applyCoachNameUsage(rawReply, personalization.firstName, coachMessageNumber, namePolicy);

  const memoryMessages: MemoryConversationMessage[] = [
    ...toMemoryMessages(messages),
    { role: 'assistant', content: reply }
  ];
  if (memoryMessages.length >= 2) {
    scheduleMemoryExtraction(userId, 'web_chat', memoryMessages);
  }

  return { reply, contextUsed: true, ...(goalWasSetByTool ? { hydrationGoalUpdated: true } : {}) };
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
  return (
    /(?:hydration|water)\s*goal/i.test(text) ||
    /(?:change|set|update|adjust|modify|choose|pick).*(?:hydration|water)/i.test(text) ||
    /how\s+(?:do\s+i|can\s+i|to).*(?:change|set|update).*(?:hydration|water)/i.test(text)
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
