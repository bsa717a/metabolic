import { getTodayDashboard } from './dashboardService.js';
import { getAiProvider, WEB_AGENT_SYSTEM, type ChatMessage } from './aiService.js';
import { buildWebCoachToolDeclarations, executeWebCoachTool, type WebCoachToolContext } from './webCoachTools.js';
import { prisma } from '../db/prisma.js';
import { userDayKey } from '../utils/dates.js';
import { n } from '../utils/numbers.js';
import { isVirtualCoachId, VIRTUAL_COACH_PERSONA_PROMPTS } from '../data/virtualCoachPersonas.js';
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

/** Allergies, dietary preferences, timezone, and first name for personalizing AI replies. */
export async function loadPersonalization(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      firstName: true,
      timezone: true,
      selectedVirtualCoachId: true,
      clientProfile: { select: { foodConditions: true, dietNotes: true } }
    }
  });
  return {
    firstName: user?.firstName ?? null,
    timezone: user?.timezone ?? null,
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

export async function buildAssistantContext(userId: string) {
  const personalization = await loadPersonalization(userId);
  const dashboard = await getTodayDashboard(userId, userDayKey(personalization.timezone), personalization.timezone);
  if (!dashboard.program) {
    return JSON.stringify({
      hasProgram: false,
      message: 'User has no active program.',
      profile: {
        firstName: personalization.firstName,
        foodAllergies: personalization.foodAllergies,
        dietaryPreferences: personalization.dietaryPreferences
      }
    });
  }

  return JSON.stringify({
    hasProgram: true,
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
  const dashboard = await getTodayDashboard(userId, userDayKey(personalization.timezone), personalization.timezone);
  if (!dashboard.program) {
    return JSON.stringify({
      hasProgram: false,
      message: 'User has no active program.',
      profile: {
        firstName: personalization.firstName,
        foodAllergies: personalization.foodAllergies,
        dietaryPreferences: personalization.dietaryPreferences
      }
    });
  }

  return JSON.stringify({
    hasProgram: true,
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
  const isFirstTurn = !messages.some((message) => message.role === 'assistant');
  const nameInstruction =
    personalization.firstName && isFirstTurn
      ? `The user's first name is ${personalization.firstName}. This is your first reply in the conversation — greet them by name.\n\n`
      : '';
  const memorySection = buildMemoryPromptSection(memoryView);
  const memoryInstruction = memorySection ? `${memorySection}\n\n` : '';
  const personaPrefix =
    personalization.selectedVirtualCoachId && isVirtualCoachId(personalization.selectedVirtualCoachId)
      ? `${VIRTUAL_COACH_PERSONA_PROMPTS[personalization.selectedVirtualCoachId]}\n\nAlso serve as their in-app assistant when they ask quick questions between check-ins.\n\n`
      : '';

  const toolCtx: WebCoachToolContext = {
    userId,
    dateKey: userDayKey(personalization.timezone),
    timeZone: personalization.timezone,
    message: lastUserMessage,
    toolCalls: []
  };
  const reply = await getAiProvider().runAgent({
    messages,
    context,
    tools: buildWebCoachToolDeclarations(),
    toolExecutor: (name, args) => executeWebCoachTool(toolCtx, name, args),
    systemPrompt: `${WEB_AGENT_SYSTEM}\n\n${memoryInstruction}${nameInstruction}${personaPrefix}`.trim()
  });

  const memoryMessages: MemoryConversationMessage[] = [
    ...toMemoryMessages(messages),
    { role: 'assistant', content: reply }
  ];
  if (memoryMessages.length >= 2) {
    scheduleMemoryExtraction(userId, 'web_chat', memoryMessages);
  }

  return { reply, contextUsed: true };
}

function toMemoryMessages(messages: ChatMessage[]): MemoryConversationMessage[] {
  return messages
    .filter((message) => message.content.trim())
    .map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: message.content.trim()
    }));
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
