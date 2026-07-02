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

const templateInclude = {
  meals: {
    orderBy: { mealNumber: 'asc' as const },
    include: {
      items: { orderBy: { createdAt: 'asc' as const } },
      mealCardSet: { include: cardSetInclude }
    }
  }
} satisfies Prisma.NutritionPlanTemplateInclude;

export async function applyTemplateMealsToLog(
  tx: Prisma.TransactionClient,
  templateId: string,
  dailyLogId: string,
  userId: string
) {
  const template = await tx.nutritionPlanTemplate.findUniqueOrThrow({
    where: { id: templateId },
    include: templateInclude
  });

  // The user's standing card-builder picks: card-backed meals materialize from these
  // (scaled to the meal's target) instead of the template's fixed items.
  const cardSetIds = template.meals.map((meal) => meal.mealCardSetId).filter((id): id is string => id != null);
  const standingPicks = cardSetIds.length
    ? await tx.userMealCardPicks.findMany({ where: { userId, cardSetId: { in: cardSetIds } } })
    : [];

  await tx.meal.deleteMany({ where: { dailyLogId } });

  for (const templateMeal of template.meals) {
    const standing = templateMeal.mealCardSetId
      ? standingPicks.find(
          (p) => p.cardSetId === templateMeal.mealCardSetId && p.mealNumber === templateMeal.mealNumber
        )
      : undefined;
    // Card-backed meals materialize from the card system: the user's standing picks,
    // else the set's authored defaults. Template items are the pre-card legacy path.
    if (templateMeal.mealCardSet) {
      const picks = standing ? (standing.picks as CardPicks) : defaultPicksForSet(templateMeal.mealCardSet);
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
        const target = cardMealTarget(templateMeal, templateMeal.mealCardSet);
        await materializeCardMeal(tx, meal.id, templateMeal.mealCardSet.id, picks, scaledLinesForPicks(templateMeal.mealCardSet, target, picks));
        continue;
      }
    }
    const plannedTotals = templateMeal.items.reduce(
      (sum, item) => ({
        calories: sum.calories + n(item.calories),
        protein: sum.protein + n(item.protein),
        carbs: sum.carbs + n(item.carbs),
        fat: sum.fat + n(item.fat)
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
                quantity: item.quantity,
                unit: item.unit,
                calories: item.calories,
                protein: item.protein,
                carbs: item.carbs,
                fat: item.fat
              }))
            }
          : undefined
      }
    });
  }

  await tx.dailyLog.update({
    where: { id: dailyLogId },
    data: {
      calorieTarget: template.calorieTarget,
      proteinTarget: template.proteinTarget,
      carbTarget: template.carbTarget,
      fatTarget: template.fatTarget,
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
  await applyTemplateMealsToLog(tx, program.defaultNutritionTemplateId, dailyLogId, userId);
  return true;
}

export async function applyDefaultTemplateToNewLogOutsideTx(
  program: { id: string; defaultNutritionTemplateId: string | null },
  dailyLogId: string,
  userId: string
) {
  if (!program.defaultNutritionTemplateId) return false;
  await prisma.$transaction(async (tx) => {
    await applyTemplateMealsToLog(tx, program.defaultNutritionTemplateId!, dailyLogId, userId);
  });
  return true;
}
