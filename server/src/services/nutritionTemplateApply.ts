import { MealItemType, MealStatus, type Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { n } from '../utils/numbers.js';
import {
  cardMealTarget,
  cardSetInclude,
  defaultPicksForSet,
  materializeCardMeal,
  scaledLinesForPicks,
  type CardPicks
} from './mealCardMaterialize.js';
import { findCardSetForTemplateMeal } from '../utils/mealSlotMatch.js';
import { getMealStructure } from './targetService.js';

const templateInclude = {
  meals: {
    orderBy: { mealNumber: 'asc' as const },
    include: {
      items: { orderBy: { createdAt: 'asc' as const } },
      mealCardSet: { include: cardSetInclude }
    }
  }
} satisfies Prisma.NutritionPlanTemplateInclude;

/** The client's resolved/override targets, used to scale a template off its authored numbers. */
export type ScaleToTargets = { calories: number; protein: number; carbs: number; fat: number };

/**
 * How much to scale a template's authored amounts by so the day hits the client's
 * resolved calorie target. Falls back to 1 (no scaling) when either side is missing
 * or non-positive, so the legacy "use the template's own numbers" path is preserved.
 */
function scaleFactorForTemplate(templateCalories: number, scaleTo: ScaleToTargets | null): number {
  if (!scaleTo || scaleTo.calories <= 0 || templateCalories <= 0) return 1;
  return scaleTo.calories / templateCalories;
}

export async function applyTemplateMealsToLog(
  tx: Prisma.TransactionClient,
  templateId: string,
  dailyLogId: string,
  userId: string,
  scaleTo: ScaleToTargets | null = null
) {
  const template = await tx.nutritionPlanTemplate.findUniqueOrThrow({
    where: { id: templateId },
    include: templateInclude
  });

  // Scale the template's authored per-meal targets and fixed items so the day lands on
  // the client's resolved/override calories instead of the template's static band value.
  const factor = scaleFactorForTemplate(n(template.calorieTarget), scaleTo);

  // The user's standing card-builder picks: card-backed meals materialize from these
  // (scaled to the meal's target) instead of the template's fixed items.
  const allSets = await tx.mealCardSet.findMany({ orderBy: { createdAt: 'asc' }, include: cardSetInclude });
  const structureSlots = (await getMealStructure()).slots;
  const cardSetIds = [
    ...new Set(
      template.meals
        .map((meal) => findCardSetForTemplateMeal(meal, allSets, structureSlots)?.id)
        .filter((id): id is string => id != null)
    )
  ];
  const standingPicks = cardSetIds.length
    ? await tx.userMealCardPicks.findMany({ where: { userId, cardSetId: { in: cardSetIds } } })
    : [];

  await tx.meal.deleteMany({ where: { dailyLogId } });

  for (const templateMeal of template.meals) {
    const cardSet = findCardSetForTemplateMeal(templateMeal, allSets, structureSlots);
    const standing = cardSet
      ? standingPicks.find(
          (p) => p.cardSetId === cardSet.id && p.mealNumber === templateMeal.mealNumber
        )
      : undefined;
    // Card-backed meals materialize from the card system: the user's standing picks,
    // else the set's authored defaults. Template items are the pre-card legacy path.
    if (cardSet) {
      const picks = standing ? (standing.picks as CardPicks) : defaultPicksForSet(cardSet);
      if (Object.keys(picks).length > 0) {
        const meal = await tx.meal.create({
          data: {
            dailyLogId,
            userId,
            mealNumber: templateMeal.mealNumber,
            name: templateMeal.name,
            plannedTime: templateMeal.plannedTime,
            status: MealStatus.PLANNED
          }
        });
        const target = cardMealTarget(templateMeal, cardSet) * factor;
        await materializeCardMeal(tx, meal.id, cardSet.id, picks, scaledLinesForPicks(cardSet, target, picks));
        continue;
      }
    }
    const plannedTotals = templateMeal.items.reduce(
      (sum, item) => ({
        calories: sum.calories + n(item.calories) * factor,
        protein: sum.protein + n(item.protein) * factor,
        carbs: sum.carbs + n(item.carbs) * factor,
        fat: sum.fat + n(item.fat) * factor
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );

    await tx.meal.create({
      data: {
        dailyLogId,
        userId,
        mealNumber: templateMeal.mealNumber,
        name: templateMeal.name,
        plannedTime: templateMeal.plannedTime,
        status: MealStatus.PLANNED,
        plannedCalories: plannedTotals.calories,
        plannedProtein: plannedTotals.protein,
        plannedCarbs: plannedTotals.carbs,
        plannedFat: plannedTotals.fat,
        items: templateMeal.items.length
          ? {
              create: templateMeal.items.map((item) => ({
                foodId: item.foodId,
                type: MealItemType.PLANNED,
                nameSnapshot: item.nameSnapshot,
                quantity: n(item.quantity) * factor,
                unit: item.unit,
                calories: n(item.calories) * factor,
                protein: n(item.protein) * factor,
                carbs: n(item.carbs) * factor,
                fat: n(item.fat) * factor
              }))
            }
          : undefined
      }
    });
  }

  // Stamp the day's targets from the resolved/override numbers when scaling; otherwise
  // fall back to the template's authored targets (legacy behavior).
  await tx.dailyLog.update({
    where: { id: dailyLogId },
    data: {
      calorieTarget: scaleTo ? scaleTo.calories : template.calorieTarget,
      proteinTarget: scaleTo ? scaleTo.protein : template.proteinTarget,
      carbTarget: scaleTo ? scaleTo.carbs : template.carbTarget,
      fatTarget: scaleTo ? scaleTo.fat : template.fatTarget,
      mealsPlanned: template.meals.length
    }
  });
}

export async function applyDefaultTemplateToNewLog(
  tx: Prisma.TransactionClient,
  program: { id: string; defaultNutritionTemplateId: string | null },
  dailyLogId: string,
  userId: string
) {
  if (!program.defaultNutritionTemplateId) return false;
  const scaleTo = await resolveScaleTargets(userId);
  await applyTemplateMealsToLog(tx, program.defaultNutritionTemplateId, dailyLogId, userId, scaleTo);
  return true;
}

export async function applyDefaultTemplateToNewLogOutsideTx(
  program: { id: string; defaultNutritionTemplateId: string | null },
  dailyLogId: string,
  userId: string
) {
  if (!program.defaultNutritionTemplateId) return false;
  const scaleTo = await resolveScaleTargets(userId);
  await prisma.$transaction(async (tx) => {
    await applyTemplateMealsToLog(tx, program.defaultNutritionTemplateId!, dailyLogId, userId, scaleTo);
  });
  return true;
}

/** Resolve a client's targets into a scale spec, or null when the profile can't resolve. */
export async function resolveScaleTargets(userId: string): Promise<ScaleToTargets | null> {
  const { resolveTargets } = await import('./targetService.js');
  const targets = await resolveTargets(userId);
  return targets
    ? { calories: targets.calories, protein: targets.protein, carbs: targets.carbs, fat: targets.fat }
    : null;
}
