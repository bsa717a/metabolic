/**
 * Fix Snack / Mini Meal Builder overshoot:
 * - string cheese default 2 sticks → 1 stick
 * - remove default chia booster (and re-point to a true tsp food)
 * - recompute reference calories and rematerialize recent days
 *
 *   cd server && npx tsx --env-file=.env scripts/fix-snack-card-scaling.ts
 */
import { MealCardRole, Prisma, Visibility } from '@prisma/client';
import { prisma } from '../src/db/prisma.js';
import { applyStructureMealsToLog } from '../src/services/structureMealsApply.js';
import {
  defaultPicksForSet,
  scaledLinesForPicks,
  cardSetInclude
} from '../src/services/mealCardMaterialize.js';
import { getMealStructure, slotTargets } from '../src/services/targetService.js';

const STRING_CHEESE_OPTION_FOOD_ID = 'cmr2nz7oa003rru6cfbxgee6g';

async function ensureFood(input: {
  name: string;
  servingSize: number;
  servingUnit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}) {
  const existing = await prisma.food.findFirst({
    where: { name: { equals: input.name, mode: 'insensitive' }, visibility: Visibility.GLOBAL },
    orderBy: { createdAt: 'asc' }
  });
  if (existing) {
    await prisma.food.update({
      where: { id: existing.id },
      data: {
        servingSize: new Prisma.Decimal(input.servingSize),
        servingUnit: input.servingUnit,
        calories: new Prisma.Decimal(input.calories),
        protein: new Prisma.Decimal(input.protein),
        carbs: new Prisma.Decimal(input.carbs),
        fat: new Prisma.Decimal(input.fat),
        role: MealCardRole.FREE,
        isFreeFood: true
      }
    });
    return existing.id;
  }
  const created = await prisma.food.create({
    data: {
      name: input.name,
      servingSize: new Prisma.Decimal(input.servingSize),
      servingUnit: input.servingUnit,
      calories: new Prisma.Decimal(input.calories),
      protein: new Prisma.Decimal(input.protein),
      carbs: new Prisma.Decimal(input.carbs),
      fat: new Prisma.Decimal(input.fat),
      visibility: Visibility.GLOBAL,
      role: MealCardRole.FREE,
      isFreeFood: true
    }
  });
  return created.id;
}

async function main() {
  const set = await prisma.mealCardSet.findFirst({
    where: { name: 'Snack / Mini Meal Builder' },
    include: {
      cards: {
        include: {
          options: { include: { foods: true } }
        }
      }
    }
  });
  if (!set) throw new Error('Snack / Mini Meal Builder not found');

  const chiaOption = set.cards
    .flatMap((card) => card.options)
    .find((option) => option.name.toLowerCase() === 'chia seeds');
  const cacaoOption = set.cards
    .flatMap((card) => card.options)
    .find((option) => option.name.toLowerCase() === 'cacao nibs');

  await prisma.mealCardOptionFood.update({
    where: { id: STRING_CHEESE_OPTION_FOOD_ID },
    data: {
      baseServings: new Prisma.Decimal(1),
      scalable: true,
      discrete: true,
      unitStep: new Prisma.Decimal(1)
    }
  });

  const chiaFoodId = await ensureFood({
    name: 'Chia seeds (tsp)',
    servingSize: 1,
    servingUnit: 'tsp',
    calories: 20,
    protein: 1,
    carbs: 2,
    fat: 1.5
  });
  const cacaoFoodId = await ensureFood({
    name: 'Cacao nibs (tsp)',
    servingSize: 1,
    servingUnit: 'tsp',
    calories: 15,
    protein: 0.5,
    carbs: 1,
    fat: 1
  });

  if (chiaOption?.foods[0]) {
    await prisma.mealCardOptionFood.update({
      where: { id: chiaOption.foods[0].id },
      data: {
        foodId: chiaFoodId,
        baseServings: new Prisma.Decimal(1),
        scalable: false
      }
    });
    await prisma.mealCardOption.update({
      where: { id: chiaOption.id },
      data: { isDefault: false }
    });
  }

  if (cacaoOption?.foods[0]) {
    await prisma.mealCardOptionFood.update({
      where: { id: cacaoOption.foods[0].id },
      data: {
        foodId: cacaoFoodId,
        baseServings: new Prisma.Decimal(1),
        scalable: false
      }
    });
  }

  // Drop standing picks on this set so defaults (no booster) apply cleanly
  await prisma.userMealCardPicks.deleteMany({ where: { cardSetId: set.id } });

  // Recompute reference from default scalable picks
  const cards = await prisma.mealCard.findMany({
    where: { cardSetId: set.id },
    include: {
      options: {
        where: { isDefault: true },
        include: { foods: { include: { food: true } } }
      }
    }
  });
  let ref = 0;
  for (const card of cards) {
    if (card.role === 'STYLE' || card.role === 'FREE') continue;
    for (const option of card.options) {
      for (const line of option.foods) {
        if (!line.scalable) continue;
        ref += Number(line.baseServings) * Number(line.food.calories);
      }
    }
  }
  ref = Math.round(ref * 100) / 100;
  await prisma.mealCardSet.update({
    where: { id: set.id },
    data: { referenceCalories: new Prisma.Decimal(ref) }
  });

  const user = await prisma.user.findUnique({
    where: { email: 'derek@explore-on.com' },
    select: { id: true }
  });
  const rematerialized: Array<{ date: string; planned: number; target: number | null }> = [];
  if (user) {
    const logs = await prisma.dailyLog.findMany({
      where: { userId: user.id },
      orderBy: { date: 'desc' },
      take: 5,
      select: { id: true, date: true, calorieTarget: true }
    });
    for (const log of logs) {
      const ok = await applyStructureMealsToLog(user.id, log.id, log.date);
      if (!ok) continue;
      const meals = await prisma.meal.findMany({ where: { dailyLogId: log.id } });
      rematerialized.push({
        date: log.date.toISOString().slice(0, 10),
        planned: Math.round(meals.reduce((sum, meal) => sum + Number(meal.plannedCalories || 0), 0)),
        target: log.calorieTarget != null ? Math.round(Number(log.calorieTarget)) : null
      });
    }
  }

  const loaded = await prisma.mealCardSet.findFirst({
    where: { id: set.id },
    include: cardSetInclude
  });
  const structure = await getMealStructure();
  const slots = slotTargets(2344, structure).filter((slot) => slot.slotType === 'SNACK');
  const snackPreview = slots.map((slot) => {
    const picks = defaultPicksForSet(loaded!);
    const lines = scaledLinesForPicks(loaded!, slot.calorieTarget, picks);
    const actual = lines.reduce((sum, line) => sum + line.calories, 0);
    return {
      meal: slot.name,
      target: slot.calorieTarget,
      actual: Math.round(actual * 100) / 100,
      lines: lines.map((line) => ({ name: line.name, qty: line.quantity, cal: line.calories }))
    };
  });

  console.log(
    JSON.stringify(
      {
        stringCheeseBaseServings: 1,
        chiaDefault: false,
        snackReferenceCalories: ref,
        snackPreview,
        rematerialized
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
