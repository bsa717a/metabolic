import { FoodSource, MealItemType, MealStatus, ProgramStatus, Visibility } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { parseDateParam } from '../utils/dates.js';
import { n, round } from '../utils/numbers.js';
import { resolvePlanForDate } from './planResolution.js';
import { ensureDailyLogByUserId } from './dailyLogService.js';
import { recalculateDailyLogTotals, recalculateMealTotals } from './totalsService.js';
import { MealCardError } from './mealCardService.js';
import { cardMealTarget } from './mealCardMaterialize.js';
import { getMealStructure, resolveTargets, slotTargets } from './targetService.js';
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

/**
 * Allergies are CATEGORIES; item names are instances — "nut allergy" must block
 * "Almonds" even though no item is literally named "nut". Each key expands to the
 * concrete ingredients it implies. False positives are acceptable; misses are not.
 */
const NUT_TERMS = [
  'nut', 'almond', 'walnut', 'cashew', 'pecan', 'pistachio', 'hazelnut', 'macadamia',
  'brazil nut', 'peanut', 'praline', 'marzipan', 'nougat', 'nutella'
];
const DAIRY_TERMS = ['milk', 'cheese', 'yogurt', 'butter', 'cream', 'whey', 'casein', 'kefir', 'ghee'];
const FISH_TERMS = ['fish', 'salmon', 'tuna', 'cod', 'tilapia', 'halibut', 'mahi', 'anchovy', 'sardine', 'trout', 'bass'];
const SHELLFISH_TERMS = ['shellfish', 'shrimp', 'prawn', 'crab', 'lobster', 'scallop', 'clam', 'mussel', 'oyster', 'crawfish', 'crayfish'];
const GLUTEN_TERMS = ['wheat', 'bread', 'toast', 'pasta', 'noodle', 'flour', 'cracker', 'couscous', 'barley', 'rye', 'seitan', 'bagel', 'bun', 'pita'];

const ALLERGEN_EXPANSIONS: Record<string, string[]> = {
  nut: NUT_TERMS,
  nuts: NUT_TERMS,
  'tree nut': NUT_TERMS,
  'tree nuts': NUT_TERMS,
  peanut: ['peanut', 'nut butter', 'praline', 'nougat'],
  peanuts: ['peanut', 'nut butter', 'praline', 'nougat'],
  dairy: DAIRY_TERMS,
  lactose: DAIRY_TERMS,
  milk: DAIRY_TERMS,
  fish: FISH_TERMS,
  shellfish: SHELLFISH_TERMS,
  seafood: [...FISH_TERMS, ...SHELLFISH_TERMS],
  gluten: GLUTEN_TERMS,
  wheat: GLUTEN_TERMS,
  egg: ['egg', 'mayo', 'mayonnaise', 'aioli', 'meringue'],
  eggs: ['egg', 'mayo', 'mayonnaise', 'aioli', 'meringue'],
  soy: ['soy', 'tofu', 'edamame', 'tempeh', 'miso'],
  sesame: ['sesame', 'tahini']
};

/** Parsed avoid terms plus everything their allergen category implies. */
export function expandAvoidTerms(terms: string[]): string[] {
  const expanded = new Set<string>();
  for (const term of terms) {
    expanded.add(term);
    for (const synonym of ALLERGEN_EXPANSIONS[term] ?? []) expanded.add(synonym);
    // "tree nut allergy" style phrases: expand any category word the phrase contains
    for (const [key, synonyms] of Object.entries(ALLERGEN_EXPANSIONS)) {
      if (key.includes(' ') ? term.includes(key) : new RegExp(`\\b${key}\\b`).test(term)) {
        for (const synonym of synonyms) expanded.add(synonym);
      }
    }
  }
  return [...expanded];
}

/** Server-side allergen re-check — the prompt rule is not trusted alone. */
export function violatesAvoidList(suggestion: ItemizedMealSuggestion, avoidTerms: string[]): boolean {
  if (!avoidTerms.length) return false;
  const haystacks = [suggestion.name, suggestion.description, ...suggestion.items.map((item) => item.name)].map((s) =>
    (s ?? '').toLowerCase()
  );
  return avoidTerms.some((term) => {
    const pattern = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:es|s)?\\b`, 'i');
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

type RecommendationSlot = {
  mealNumber: number;
  name: string;
  plannedTime: string | null;
  slotType: string;
  /** null = templateless (formula-era) plan */
  templateId: string | null;
};

type ResolvedRecommendationSlot = {
  templateMeal: RecommendationSlot;
  targetCalories: number;
  proteinGoal: number | null;
};

/** When no template/period is on file, derive targets from the day's meal or formula targets. */
async function resolveSlotFallback(
  userId: string,
  day: Date,
  mealNumber: number
): Promise<ResolvedRecommendationSlot | null> {
  const log = await prisma.dailyLog.findUnique({
    where: { userId_date: { userId, date: day } },
    include: { meals: { where: { mealNumber } } }
  });
  const existingMeal = log?.meals[0];
  if (existingMeal && n(existingMeal.plannedCalories) > 0) {
    return {
      templateMeal: {
        mealNumber,
        name: existingMeal.name,
        plannedTime: existingMeal.plannedTime,
        slotType: existingMeal.name,
        templateId: null
      },
      targetCalories: Math.round(n(existingMeal.plannedCalories)),
      proteinGoal: n(existingMeal.plannedProtein) > 0 ? Math.round(n(existingMeal.plannedProtein)) : null
    };
  }

  const resolved = await resolveTargets(userId);
  if (!resolved?.calories) return null;

  const structure = await getMealStructure();
  const slot = slotTargets(resolved.calories, structure).find((entry) => entry.mealNumber === mealNumber);
  if (!slot) return null;

  const totalShare = structure.slots.reduce((sum, entry) => sum + entry.sharePct, 0) || 100;
  const proteinGoal = resolved.protein > 0 ? Math.round((resolved.protein * slot.sharePct) / totalShare) : null;

  return {
    templateMeal: {
      mealNumber: slot.mealNumber,
      name: slot.name,
      plannedTime: slot.plannedTime,
      slotType: slot.slotType,
      templateId: null
    },
    targetCalories: slot.calorieTarget,
    proteinGoal
  };
}

async function resolveSlot(userId: string, date: string, mealNumber: number) {
  const program = await prisma.program.findFirst({
    where: { userId, status: ProgramStatus.ACTIVE },
    select: { id: true, defaultNutritionTemplateId: true, defaultExerciseTemplateId: true }
  });
  if (!program) throw new MealCardError('No active program found', 404);

  const day = parseDateParam(date);
  const plan = await resolvePlanForDate(program, day);

  if (!plan.nutritionTemplateId) {
    // Formula era: the meal structure split over the period's frozen day target.
    const period = await prisma.planPeriod.findFirst({
      where: { programId: program.id, effectiveDate: { lte: day }, calorieTarget: { not: null } },
      orderBy: { effectiveDate: 'desc' },
      select: { calorieTarget: true, proteinTarget: true }
    });
    if (!period) {
      const fallback = await resolveSlotFallback(userId, day, mealNumber);
      if (fallback) return { program, ...fallback };
      throw new MealCardError('No nutrition plan for this date', 404);
    }
    const structure = await getMealStructure();
    const slot = slotTargets(n(period.calorieTarget), structure).find((s) => s.mealNumber === mealNumber);
    if (!slot) throw new MealCardError('No such meal on this plan', 404);
    const templateMeal: RecommendationSlot = {
      mealNumber,
      name: slot.name,
      plannedTime: slot.plannedTime,
      slotType: slot.slotType,
      templateId: null
    };
    const proteinGoal = period.proteinTarget != null
      ? Math.round((n(period.proteinTarget) * slot.sharePct) / 100)
      : null;
    return { program, templateMeal, targetCalories: slot.calorieTarget, proteinGoal };
  }

  const dbMeal = await prisma.nutritionTemplateMeal.findFirst({
    where: { templateId: plan.nutritionTemplateId, mealNumber },
    include: {
      template: { select: { calorieTarget: true, proteinTarget: true, _count: { select: { meals: true } } } },
      mealCardSet: { select: { slotType: true, referenceCalories: true } }
    }
  });
  if (!dbMeal) {
    const fallback = await resolveSlotFallback(userId, day, mealNumber);
    if (fallback) return { program, ...fallback };
    throw new MealCardError('No such meal on this plan', 404);
  }

  const dayCalories = n(dbMeal.template.calorieTarget);
  const targetCalories = dbMeal.mealCardSet
    ? cardMealTarget(dbMeal, dbMeal.mealCardSet)
    : dbMeal.calorieTarget != null
      ? n(dbMeal.calorieTarget)
      : dayCalories / Math.max(1, dbMeal.template._count.meals);
  const proteinGoal = dayCalories > 0
    ? Math.round(n(dbMeal.template.proteinTarget) * (targetCalories / dayCalories))
    : null;

  const templateMeal: RecommendationSlot = {
    mealNumber: dbMeal.mealNumber,
    name: dbMeal.name,
    plannedTime: dbMeal.plannedTime,
    slotType: dbMeal.mealCardSet?.slotType ?? dbMeal.name,
    templateId: dbMeal.templateId
  };
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

  const avoidTerms = expandAvoidTerms(parseAvoidTerms(user?.clientProfile?.foodConditions));
  const context = JSON.stringify({
    slotType: templateMeal.slotType,
    targetCalories,
    proteinGoal,
    allergies: user?.clientProfile?.foodConditions ?? null,
    // Category-expanded so the model can't miss "nut allergy" ⇒ no almonds/cashews/…
    forbiddenIngredients: avoidTerms.length ? avoidTerms : null,
    dietaryPreferences: user?.clientProfile?.dietNotes ?? null,
    recentMeals: recentMeals.map((meal) => meal.name)
  });

  const raw = await getAiProvider().suggestItemizedMeals(craving?.trim() ?? '', context);
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
  if (violatesAvoidList(suggestion, expandAvoidTerms(parseAvoidTerms(user?.clientProfile?.foodConditions)))) {
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
