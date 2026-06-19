import { getTodayDashboard } from './dashboardService.js';
import { getAiProvider, type ChatMessage } from './aiService.js';
import { prisma } from '../db/prisma.js';
import { userDayKey } from '../utils/dates.js';
import { n } from '../utils/numbers.js';

/** Allergies, dietary preferences, timezone, and first name for personalizing AI replies. */
export async function loadPersonalization(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      firstName: true,
      timezone: true,
      clientProfile: { select: { foodConditions: true, dietNotes: true } }
    }
  });
  return {
    firstName: user?.firstName ?? null,
    timezone: user?.timezone ?? null,
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
    return JSON.stringify({ hasProgram: false, message: 'User has no active program.' });
  }

  return JSON.stringify({
    hasProgram: true,
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
      topItems: meal.items
        .filter((item) => item.type === 'PLANNED' && item.nameSnapshot.trim())
        .slice(0, 4)
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
  const context = await buildAssistantContext(userId);
  const reply = await getAiProvider().chat(messages, context);
  return { reply, contextUsed: true };
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
  const context = await buildSmsAssistantContext(userId);
  const reply = await getAiProvider().chat(messages, context, 'sms');
  return { reply: truncateSmsReply(reply), contextUsed: true };
}
