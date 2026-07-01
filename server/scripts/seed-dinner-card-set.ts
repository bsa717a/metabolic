/**
 * Seeds the first dinner MealCardSet ("Taco / Fajita Night") — the card-authoring
 * script that replaces an authoring UI for the slice (Workstream C).
 *
 * What it does (idempotent, keyed by names):
 *  1. Upserts the ~14 foods the set uses, tagging role / isFreeFood.
 *  2. Authors the card set: style → protein → carb → veggies → flavor & crunch,
 *     with baseServings at the set's reference calories (sum of scalable defaults).
 *  3. Attaches the set to every template's dinner meal — the meal named "dinner" or
 *     planned for the evening (17:00–20:59; the seeded templates use 18:30/6:00pm) —
 *     and stores the meal's calorieTarget (item rollup when the meal has items, else
 *     the day target minus the other meals) — the numerator of the per-user scale factor.
 *
 * Dry-run by default; nothing is written without --apply.
 *   cd server && npx tsx --env-file=.env scripts/seed-dinner-card-set.ts [--apply]
 */
import { MealCardRole, Prisma, PrismaClient, Visibility } from '@prisma/client';

const prisma = new PrismaClient();

const CARD_SET_NAME = 'Taco / Fajita Night';
const MIN_DINNER_TARGET_KCAL = 200;

/** Parse template plannedTime ("18:30", "6:00pm") to a 0–23 hour, or null. */
function plannedHour(plannedTime: string | null): number | null {
  if (!plannedTime) return null;
  const match = plannedTime.trim().toLowerCase().match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/);
  if (!match) return null;
  let hour = Number(match[1]);
  if (match[3] === 'pm' && hour < 12) hour += 12;
  if (match[3] === 'am' && hour === 12) hour = 0;
  return hour;
}

function isDinnerMeal(meal: { name: string; plannedTime: string | null }): boolean {
  if (meal.name.toLowerCase().includes('dinner')) return true;
  const hour = plannedHour(meal.plannedTime);
  return hour != null && hour >= 17 && hour < 21;
}

type FoodSeed = {
  name: string;
  servingSize: number;
  servingUnit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  role: MealCardRole;
  isFreeFood?: boolean;
};

const FOODS: FoodSeed[] = [
  { name: 'Ground beef 90/10, cooked', servingSize: 2, servingUnit: 'oz', calories: 105, protein: 11, carbs: 0, fat: 6, role: 'PROTEIN' },
  { name: 'Chicken thighs, grilled', servingSize: 2, servingUnit: 'oz', calories: 92, protein: 11, carbs: 0, fat: 5, role: 'PROTEIN' },
  { name: 'Shrimp, sautéed', servingSize: 2, servingUnit: 'oz', calories: 60, protein: 12, carbs: 0, fat: 1, role: 'PROTEIN' },
  { name: 'Corn tortillas', servingSize: 1, servingUnit: 'tortilla', calories: 70, protein: 2, carbs: 12, fat: 2, role: 'CARB' },
  { name: 'White rice, cooked', servingSize: 0.5, servingUnit: 'cup', calories: 110, protein: 2, carbs: 23, fat: 0, role: 'CARB' },
  { name: 'Sweet potato, roasted', servingSize: 0.5, servingUnit: 'cup', calories: 90, protein: 1, carbs: 21, fat: 0, role: 'CARB' },
  { name: 'Peppers & onions, sautéed', servingSize: 1, servingUnit: 'cup', calories: 45, protein: 1, carbs: 9, fat: 0, role: 'VEGETABLE' },
  { name: 'Broccoli, roasted', servingSize: 1, servingUnit: 'cup', calories: 55, protein: 3, carbs: 6, fat: 2, role: 'VEGETABLE' },
  { name: 'Shredded lettuce & tomato', servingSize: 1, servingUnit: 'cup', calories: 20, protein: 1, carbs: 4, fat: 0, role: 'VEGETABLE' },
  { name: 'Salsa', servingSize: 2, servingUnit: 'tbsp', calories: 10, protein: 0, carbs: 2, fat: 0, role: 'FREE', isFreeFood: true },
  { name: 'Pico de gallo', servingSize: 2, servingUnit: 'tbsp', calories: 10, protein: 0, carbs: 2, fat: 0, role: 'FREE', isFreeFood: true },
  { name: 'Hot sauce', servingSize: 1, servingUnit: 'tsp', calories: 0, protein: 0, carbs: 0, fat: 0, role: 'FREE', isFreeFood: true },
  { name: 'Pickled jalapeños', servingSize: 2, servingUnit: 'tbsp', calories: 5, protein: 0, carbs: 1, fat: 0, role: 'FREE', isFreeFood: true },
  { name: 'Lime & cilantro', servingSize: 1, servingUnit: 'wedge', calories: 0, protein: 0, carbs: 0, fat: 0, role: 'FREE', isFreeFood: true }
];

type OptionSeed = {
  name: string;
  description?: string;
  icon?: string;
  isDefault?: boolean;
  foods: Array<{ food: string; baseServings: number; scalable?: boolean; discrete?: boolean }>;
};

type CardSeed = {
  role: MealCardRole;
  name: string;
  pickRule: string;
  required: boolean;
  maxSelect: number;
  options: OptionSeed[];
};

const CARDS: CardSeed[] = [
  {
    role: 'STYLE', name: 'Choose style', pickRule: 'Pick 1 — how do you want it?', required: true, maxSelect: 1,
    options: [
      { name: 'Taco night', description: 'Build-your-own tacos', icon: '🌮', isDefault: true, foods: [] },
      { name: 'Burrito bowl', description: 'Everything over a base', icon: '🥣', foods: [] },
      { name: 'Plate', description: 'Classic protein + sides', icon: '🍽️', foods: [] }
    ]
  },
  {
    role: 'PROTEIN', name: 'Choose protein', pickRule: 'Pick 1', required: true, maxSelect: 1,
    options: [
      { name: 'Ground beef', icon: '🥩', isDefault: true, foods: [{ food: 'Ground beef 90/10, cooked', baseServings: 3 }] },
      { name: 'Chicken thighs', icon: '🍗', foods: [{ food: 'Chicken thighs, grilled', baseServings: 3.4 }] },
      { name: 'Shrimp', icon: '🍤', foods: [{ food: 'Shrimp, sautéed', baseServings: 5 }] }
    ]
  },
  {
    role: 'CARB', name: 'Choose carb', pickRule: 'Pick 1', required: true, maxSelect: 1,
    options: [
      { name: 'Tortillas', icon: '🫓', isDefault: true, foods: [{ food: 'Corn tortillas', baseServings: 3, discrete: true }] },
      { name: 'White rice', icon: '🍚', foods: [{ food: 'White rice, cooked', baseServings: 1.6 }] },
      { name: 'Sweet potato', icon: '🍠', foods: [{ food: 'Sweet potato, roasted', baseServings: 2 }] }
    ]
  },
  {
    role: 'VEGETABLE', name: 'Choose veggies', pickRule: 'Pick 1 or more', required: true, maxSelect: 3,
    options: [
      { name: 'Peppers & onions', icon: '🫑', isDefault: true, foods: [{ food: 'Peppers & onions, sautéed', baseServings: 1.5 }] },
      { name: 'Roasted broccoli', icon: '🥦', foods: [{ food: 'Broccoli, roasted', baseServings: 1.5 }] },
      { name: 'Lettuce & tomato', icon: '🥬', foods: [{ food: 'Shredded lettuce & tomato', baseServings: 1 }] }
    ]
  },
  {
    role: 'FREE', name: 'Add flavor & crunch', pickRule: 'Pick 1 or more — free foods, they never scale', required: false, maxSelect: 5,
    options: [
      { name: 'Salsa', icon: '🌶️', isDefault: true, foods: [{ food: 'Salsa', baseServings: 1, scalable: false }] },
      { name: 'Pico de gallo', icon: '🍅', foods: [{ food: 'Pico de gallo', baseServings: 1, scalable: false }] },
      { name: 'Hot sauce', icon: '🔥', foods: [{ food: 'Hot sauce', baseServings: 1, scalable: false }] },
      { name: 'Pickled jalapeños', icon: '🥒', foods: [{ food: 'Pickled jalapeños', baseServings: 1, scalable: false }] },
      { name: 'Lime & cilantro', icon: '🍋', foods: [{ food: 'Lime & cilantro', baseServings: 1, scalable: false }] }
    ]
  }
];

/** Reference calories = the default scalable selections at base servings. */
function referenceCalories(): number {
  const byName = new Map(FOODS.map((f) => [f.name, f]));
  let total = 0;
  for (const card of CARDS) {
    if (card.role === 'STYLE' || card.role === 'FREE') continue;
    const def = card.options.find((o) => o.isDefault);
    for (const line of def?.foods ?? []) {
      total += (byName.get(line.food)?.calories ?? 0) * line.baseServings;
    }
  }
  return total;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const refKcal = referenceCalories();
  console.log(`Card set "${CARD_SET_NAME}" — reference ${refKcal} kcal ${apply ? '(APPLY)' : '(dry run — pass --apply to write)'}`);

  // 1. Foods
  const foodIds = new Map<string, string>();
  for (const seed of FOODS) {
    const existing = await prisma.food.findFirst({
      where: { name: { equals: seed.name, mode: 'insensitive' }, visibility: Visibility.GLOBAL },
      orderBy: { createdAt: 'asc' }
    });
    if (existing) {
      foodIds.set(seed.name, existing.id);
      console.log(`  food exists: ${seed.name} → tag role=${seed.role}${seed.isFreeFood ? ' free' : ''}`);
      if (apply) {
        await prisma.food.update({
          where: { id: existing.id },
          data: { role: seed.role, isFreeFood: seed.isFreeFood ?? false }
        });
      }
    } else {
      console.log(`  food create: ${seed.name} (${seed.calories} kcal / ${seed.servingSize} ${seed.servingUnit})`);
      if (apply) {
        const created = await prisma.food.create({
          data: {
            name: seed.name,
            servingSize: new Prisma.Decimal(seed.servingSize),
            servingUnit: seed.servingUnit,
            calories: new Prisma.Decimal(seed.calories),
            protein: new Prisma.Decimal(seed.protein),
            carbs: new Prisma.Decimal(seed.carbs),
            fat: new Prisma.Decimal(seed.fat),
            visibility: Visibility.GLOBAL,
            role: seed.role,
            isFreeFood: seed.isFreeFood ?? false
          }
        });
        foodIds.set(seed.name, created.id);
      }
    }
  }

  // 2. Card set
  let setId: string | null = null;
  const existingSet = await prisma.mealCardSet.findFirst({ where: { name: CARD_SET_NAME } });
  if (existingSet) {
    setId = existingSet.id;
    console.log(`  card set exists (${existingSet.id}) — leaving cards as authored`);
  } else {
    console.log(`  card set create: ${CARDS.length} cards, ${CARDS.reduce((s, c) => s + c.options.length, 0)} options`);
    if (apply) {
      const created = await prisma.mealCardSet.create({
        data: {
          name: CARD_SET_NAME,
          referenceCalories: new Prisma.Decimal(refKcal),
          cards: {
            create: CARDS.map((card, cardIndex) => ({
              role: card.role,
              name: card.name,
              pickRule: card.pickRule,
              required: card.required,
              maxSelect: card.maxSelect,
              sortOrder: cardIndex + 1,
              options: {
                create: card.options.map((option, optionIndex) => ({
                  name: option.name,
                  description: option.description ?? null,
                  icon: option.icon ?? null,
                  isDefault: option.isDefault ?? false,
                  sortOrder: optionIndex + 1,
                  foods: {
                    create: option.foods.map((line) => ({
                      foodId: foodIds.get(line.food)!,
                      baseServings: new Prisma.Decimal(line.baseServings),
                      scalable: line.scalable ?? true,
                      discrete: line.discrete ?? false
                    }))
                  }
                }))
              }
            }))
          }
        }
      });
      setId = created.id;
    }
  }

  // 3. Attach to every template's dinner meal + store its calorie target
  const templates = await prisma.nutritionPlanTemplate.findMany({
    include: { meals: { include: { items: true }, orderBy: { mealNumber: 'asc' } } }
  });
  let attached = 0;
  let skipped = 0;
  for (const template of templates) {
    const dinner = template.meals.find((m) => m.name.toLowerCase().includes('dinner')) ??
      template.meals.filter(isDinnerMeal).at(-1);
    if (!dinner) {
      skipped += 1;
      console.log(`    SKIP ${template.name}: no dinner meal found (${template.meals.length} meals)`);
      continue;
    }
    const itemRollup = dinner.items.reduce((s, i) => s + Number(i.calories), 0);
    const otherRollup = template.meals
      .filter((m) => m.id !== dinner.id)
      .reduce((s, m) => s + m.items.reduce((s2, i) => s2 + Number(i.calories), 0), 0);
    const remainder = Number(template.calorieTarget) - otherRollup;
    const target = Math.max(itemRollup > 0 ? itemRollup : remainder, MIN_DINNER_TARGET_KCAL);
    attached += 1;
    console.log(`    ${template.name}: "${dinner.name}" @ ${dinner.plannedTime} → target ${Math.round(target)} kcal (${itemRollup > 0 ? 'item rollup' : 'day remainder'})${dinner.mealCardSetId ? ' [already attached]' : ''}`);
    if (apply && setId) {
      await prisma.nutritionTemplateMeal.update({
        where: { id: dinner.id },
        data: { mealCardSetId: setId, calorieTarget: new Prisma.Decimal(target.toFixed(2)) }
      });
    }
  }
  console.log(`  attach: ${attached} templates, ${skipped} skipped`);

  console.log(apply ? 'Done.' : 'Dry run complete — nothing written.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
