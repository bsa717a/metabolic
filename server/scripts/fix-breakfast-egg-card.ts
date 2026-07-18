/**
 * Point Breakfast Builder "Eggs" at a true 1-egg food and refresh today's structure meals.
 *
 *   cd server && npx tsx --env-file=.env scripts/fix-breakfast-egg-card.ts
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../src/db/prisma.js';
import { applyStructureMealsToLog } from '../src/services/structureMealsApply.js';
import { parseDateParam, userDayKey } from '../src/utils/dates.js';

const SINGLE_EGG_NAME = 'Egg - Whole with Yoke Cooked';
const OPTION_FOOD_ID = 'cmr2nz7ll001fru6cmulgrjzx'; // Breakfast Builder → Eggs line

async function main() {
  const singleEgg = await prisma.food.findFirst({
    where: { name: { equals: SINGLE_EGG_NAME, mode: 'insensitive' } },
    orderBy: { createdAt: 'asc' }
  });
  if (!singleEgg) {
    throw new Error(`Missing food: ${SINGLE_EGG_NAME}`);
  }

  const optionFood = await prisma.mealCardOptionFood.findUnique({
    where: { id: OPTION_FOOD_ID },
    include: {
      food: true,
      option: { include: { card: { include: { cardSet: true } } } }
    }
  });
  if (!optionFood) {
    throw new Error(`Missing mealCardOptionFood: ${OPTION_FOOD_ID}`);
  }

  const before = {
    food: optionFood.food.name,
    servingSize: Number(optionFood.food.servingSize),
    baseServings: Number(optionFood.baseServings),
    eggsAtRef: Number(optionFood.baseServings) * Number(optionFood.food.servingSize)
  };

  await prisma.mealCardOptionFood.update({
    where: { id: OPTION_FOOD_ID },
    data: {
      foodId: singleEgg.id,
      baseServings: new Prisma.Decimal(3),
      scalable: true,
      discrete: true,
      unitStep: new Prisma.Decimal(1)
    }
  });

  // Recompute Breakfast Builder reference from default scalable picks (eggs now 3×75).
  const set = optionFood.option.card.cardSet;
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
    if (card.role === 'STYLE') continue;
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
    select: { id: true, timezone: true }
  });
  let rematerialized = false;
  if (user) {
    const day = parseDateParam(userDayKey(user.timezone));
    const log = await prisma.dailyLog.findFirst({
      where: { userId: user.id, date: day },
      select: { id: true }
    });
    if (log) {
      rematerialized = await applyStructureMealsToLog(user.id, log.id, day);
    }
  }

  const afterFood = await prisma.mealCardOptionFood.findUnique({
    where: { id: OPTION_FOOD_ID },
    include: { food: true }
  });

  console.log(
    JSON.stringify(
      {
        before,
        after: {
          food: afterFood?.food.name,
          servingSize: afterFood ? Number(afterFood.food.servingSize) : null,
          baseServings: afterFood ? Number(afterFood.baseServings) : null,
          eggsAtRef: afterFood
            ? Number(afterFood.baseServings) * Number(afterFood.food.servingSize)
            : null
        },
        breakfastReferenceCalories: ref,
        rematerializedDerekToday: rematerialized
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
