import { FoodSource, MealItemType, MealStatus, ProgramStatus, Visibility } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { parseDateParam } from '../utils/dates.js';
import { n, round } from '../utils/numbers.js';
import { resolvePlanForDate } from './planResolution.js';
import { ensureDailyLogByUserId } from './dailyLogService.js';
import { recalculateDailyLogTotals, recalculateMealTotals } from './totalsService.js';
import { MealCardError } from './mealCardService.js';
import { cardMealTarget } from './mealCardMaterialize.js';
import {
  getAiProvider,
  itemizedMealSuggestionInput,
  normalizeItemizedMealSuggestion,
  type ItemizedMealSuggestion
} from './aiService.js';

const DAY_MS = 86400000;
const FORWARD_APPLY_DAYS = 14;
/** Badge band (warn-not-block), and the hard drop threshold for junk options. */
const BAND = 0.1;
const MAX_DRIFT = 0.35;

export type SuggestionTotals = { calories: number; protein: number; carbs: number; fat: number };

export type AnnotatedSuggestion = ItemizedMealSuggestion & {
  totals: SuggestionTotals;
  withinBand: boolean;
  bloodSugarStable: boolean;
};

/* ---------------- pure helpers (unit-tested) ---------------- */

/** Free-text allergies → lowercase terms ("shellfish, no pork; peanuts" → shellfish/pork/peanuts). */
export function parseAvoidTerms(foodConditions: string | null | undefined): string[] {
  if (!foodConditions) return [];
  return foodConditions
    .toLowerCase()
    .split(/[,;\n/]| and /)
    .map((term) => term.replace(/\b(no|allergic to|allergy|avoid|intolerant to|intolerance)\b/g, '').trim())
    .filter((term) => term.length >= 3 && term !== 'none' && term !== 'n a');
}

/** Server-side allergen re-check — the prompt rule is not trusted alone. */
export function violatesAvoidList(suggestion: ItemizedMealSuggestion, avoidTerms: string[]): boolean {
  if (!avoidTerms.length) return false;
  const haystacks = [suggestion.name, ...suggestion.items.map((item) => item.name)].map((s) => s.toLowerCase());
  return avoidTerms.some((term) => {
    const pattern = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    return haystacks.some((text) => pattern.test(text));
  });
}

export function suggestionTotals(suggestion: ItemizedMealSuggestion): SuggestionTotals {
  return {
    calories: round(suggestion.items.reduce((s, i) => s + i.calories, 0), 0),
    protein: round(suggestion.items.reduce((s, i) => s + i.protein, 0), 1),
    carbs: round(suggestion.items.reduce((s, i) => s + i.carbs, 0), 1),
    fat: round(suggestion.items.reduce((s, i) => s + i.fat, 0), 1)
  };
}

export function annotateSuggestion(suggestion: ItemizedMealSuggestion, targetCalories: number): AnnotatedSuggestion {
  const totals = suggestionTotals(suggestion);
  const roles = new Set(suggestion.items.map((item) => item.role));
  return {
    ...suggestion,
    totals,
    withinBand: targetCalories > 0 ? Math.abs(totals.calories - targetCalories) <= targetCalories * BAND : true,
    bloodSugarStable: roles.has('PROTEIN') && roles.has('CARB') && roles.has('VEGETABLE')
  };
}

export function withinDrift(suggestion: ItemizedMealSuggestion, targetCalories: number): boolean {
  if (targetCalories <= 0) return true;
  const total = suggestionTotals(suggestion).calories;
  return Math.abs(total - targetCalories) <= targetCalories * MAX_DRIFT;
}

/* ---------------- slot + context resolution ---------------- */

async function resolveSlot(userId: string, date: string, mealNumber: number) {
  const program = await prisma.program.findFirst({
    where: { userId, status: ProgramStatus.ACTIVE },
    select: { id: true, defaultNutritionTemplateId: true, defaultExerciseTemplateId: true }
  });
  if (!program) throw new MealCardError('No active program found', 404);

  const plan = await resolvePlanForDate(program, parseDateParam(date));
  if (!plan.nutritionTemplateId) throw new MealCardError('No nutrition plan for this date', 404);

  const templateMeal = await prisma.nutritionTemplateMeal.findFirst({
    where: { templateId: plan.nutritionTemplateId, mealNumber },
    include: {
      template: { select: { calorieTarget: true, proteinTarget: true, _count: { select: { meals: true } } } },
      mealCardSet: { select: { slotType: true, referenceCalories: true } }
    }
  });
  if (!templateMeal) throw new MealCardError('No such meal on this plan', 404);

  const dayCalories = n(templateMeal.template.calorieTarget);
  const targetCalories = templateMeal.mealCardSet
    ? cardMealTarget(templateMeal, templateMeal.mealCardSet)
    : templateMeal.calorieTarget != null
      ? n(templateMeal.calorieTarget)
      : dayCalories / Math.max(1, templateMeal.template._count.meals);
  const proteinGoal = dayCalories > 0
    ? Math.round(n(templateMeal.template.proteinTarget) * (targetCalories / dayCalories))
    : null;

  return { program, templateMeal, targetCalories: Math.round(targetCalories), proteinGoal };
}

/* ---------------- recommend ---------------- */

export async function recommendMeals(userId: string, date: string, mealNumber: number, craving?: string) {
  const { templateMeal, targetCalories, proteinGoal } = await resolveSlot(userId, date, mealNumber);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { clientProfile: { select: { foodConditions: true, dietNotes: true } } }
  });

  const day = parseDateParam(date);
  const recentMeals = await prisma.meal.findMany({
    where: {
      userId,
      mealNumber,
      dailyLog: { date: { gte: new Date(day.getTime() - 5 * DAY_MS), lte: day } }
    },
    select: { name: true },
    distinct: ['name'],
    take: 8
  });

  const context = JSON.stringify({
    slotType: templateMeal.mealCardSet?.slotType ?? templateMeal.name,
    targetCalories,
    proteinGoal,
    allergies: user?.clientProfile?.foodConditions ?? null,
    dietaryPreferences: user?.clientProfile?.dietNotes ?? null,
    recentMeals: recentMeals.map((meal) => meal.name)
  });

  const raw = await getAiProvider().suggestItemizedMeals(craving?.trim() ?? '', context);
  const avoidTerms = parseAvoidTerms(user?.clientProfile?.foodConditions);
  const options = raw
    .filter((option) => !violatesAvoidList(option, avoidTerms))
    .filter((option) => withinDrift(option, targetCalories))
    .map((option) => annotateSuggestion(option, targetCalories));

  if (!options.length) {
    throw new MealCardError('Could not generate suitable meals right now — try again or adjust your request', 502);
  }

  return { mealNumber, targetCalories, options };
}

/* ---------------- save ---------------- */

async function foodIdForItem(item: ItemizedMealSuggestion['items'][number], userId: string): Promise<string> {
  const existing = await prisma.food.findFirst({
    where: {
      name: { equals: item.name, mode: 'insensitive' },
      OR: [{ visibility: Visibility.GLOBAL }, { ownerUserId: userId }]
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true }
  });
  if (existing) return existing.id;

  const created = await prisma.food.create({
    data: {
      name: item.name,
      servingSize: item.quantity,
      servingUnit: item.unit,
      calories: item.calories,
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
      source: FoodSource.AI,
      aiGenerated: true,
      visibility: Visibility.USER,
      ownerUserId: userId,
      role: item.role
    }
  });
  return created.id;
}

/**
 * Save a chosen AI meal into the plan: PLANNED items with frozen macros, the meal
 * renamed to the suggestion, and the same rest-of-week rule as card builds — applied
 * forward to future days on the same template meal (never past days, never days with
 * logged food). Client round-trips the suggestion; it is re-validated here.
 */
export async function saveMealRecommendation(userId: string, date: string, mealNumber: number, rawSuggestion: unknown) {
  const suggestion = normalizeItemizedMealSuggestion(itemizedMealSuggestionInput.parse(rawSuggestion));
  const { templateMeal, targetCalories } = await resolveSlot(userId, date, mealNumber);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { clientProfile: { select: { foodConditions: true } } }
  });
  if (violatesAvoidList(suggestion, parseAvoidTerms(user?.clientProfile?.foodConditions))) {
    throw new MealCardError('That meal conflicts with your food restrictions');
  }
  if (!withinDrift(suggestion, targetCalories)) {
    throw new MealCardError('That meal is too far from your target — pick another option');
  }

  const log = await ensureDailyLogByUserId(userId, date);
  if (!log) throw new MealCardError('No active program found', 404);

  const foodIds = new Map<string, string>();
  for (const item of suggestion.items) {
    foodIds.set(item.name, await foodIdForItem(item, userId));
  }

  const writeMeal = async (dailyLogId: string) => {
    await prisma.$transaction(async (tx) => {
      let meal = await tx.meal.findFirst({ where: { dailyLogId, mealNumber } });
      if (meal) {
        const actuals = await tx.mealItem.count({ where: { mealId: meal.id, type: MealItemType.ACTUAL } });
        if (actuals > 0 && dailyLogId !== log.id) return; // never rewrite a future day the user already logged against
      } else {
        meal = await tx.meal.create({
          data: {
            dailyLogId,
            userId,
            mealNumber,
            name: templateMeal.name,
            plannedTime: templateMeal.plannedTime,
            status: MealStatus.PLANNED
          }
        });
      }
      await tx.mealItem.deleteMany({ where: { mealId: meal.id, type: MealItemType.PLANNED } });
      await tx.mealItem.createMany({
        data: suggestion.items.map((item) => ({
          mealId: meal!.id,
          foodId: foodIds.get(item.name)!,
          type: MealItemType.PLANNED,
          nameSnapshot: item.name,
          quantity: item.quantity,
          unit: item.unit,
          calories: item.calories,
          protein: item.protein,
          carbs: item.carbs,
          fat: item.fat
        }))
      });
      await tx.meal.update({
        where: { id: meal.id },
        data: { name: suggestion.name, cardSelections: { aiMeal: { name: suggestion.name } } }
      });
      await recalculateMealTotals(meal.id, tx);
      await recalculateDailyLogTotals(dailyLogId, tx);
    });
  };

  await writeMeal(log.id);

  // Forward-apply to already-materialized future days still governed by the same template meal.
  const day = parseDateParam(date);
  const horizon = new Date(day.getTime() + FORWARD_APPLY_DAYS * DAY_MS);
  const futureLogs = await prisma.dailyLog.findMany({
    where: { userId, date: { gt: day, lte: horizon } },
    orderBy: { date: 'asc' },
    select: { id: true, date: true }
  });
  const program = await prisma.program.findFirst({
    where: { userId, status: ProgramStatus.ACTIVE },
    select: { id: true, defaultNutritionTemplateId: true, defaultExerciseTemplateId: true }
  });

  let appliedDays = 0;
  for (const futureLog of futureLogs) {
    if (!program) break;
    const plan = await resolvePlanForDate(program, futureLog.date);
    if (plan.nutritionTemplateId !== templateMeal.templateId) continue;
    await writeMeal(futureLog.id);
    appliedDays += 1;
  }

  return {
    saved: true,
    mealNumber,
    name: suggestion.name,
    totals: suggestionTotals(suggestion),
    appliedDays
  };
}
