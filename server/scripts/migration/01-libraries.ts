import { PrismaClient } from '@prisma/client';
import { DUMP_PATH } from './config.js';
import { loadIdMap, saveIdMap } from './idmap.js';
import { num, numPositive, parseTable } from './mysqlDumpParser.js';

const prisma = new PrismaClient();

interface LegacyMealItem {
  name: string;
  category?: string;
  mulipiler?: string | number;
  portion_name?: string;
  calories?: number;
  fats?: number;
  carbs?: number;
  proteins?: number;
}
interface LegacyMeal {
  mealnum: number;
  name?: string;
  time?: string;
  items?: LegacyMealItem[];
}
interface LegacyCircuitItem {
  name: string;
  category?: string;
  sets?: string;
  reps?: string;
  weight?: string;
}
interface LegacyCircuit {
  circuitnum?: number;
  name?: string;
  items?: LegacyCircuitItem[];
}

function toInt(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(String(value).trim());
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

async function migrateFoods(foodMap: Record<string, string>): Promise<number> {
  const rows = parseTable(DUMP_PATH, 'nutritions');
  let count = 0;
  for (const row of rows) {
    const name = (row.name ?? '').trim();
    if (!name) continue;

    const data = {
      name,
      servingSize: 1,
      servingUnit: (row.portion_name ?? 'serving').trim() || 'serving',
      calories: num(row.calories) ?? 0,
      protein: num(row.proteins) ?? 0,
      carbs: num(row.carbs) ?? 0,
      fat: num(row.fats) ?? 0,
      source: 'IMPORTED' as const,
      visibility: 'GLOBAL' as const,
      verified: true
    };

    const existing = await prisma.food.findFirst({ where: { name, visibility: 'GLOBAL' } });
    const food = existing
      ? await prisma.food.update({ where: { id: existing.id }, data })
      : await prisma.food.create({ data });
    foodMap[name] = food.id;
    count += 1;
  }
  return count;
}

async function migrateExercises(exerciseMap: Record<string, string>): Promise<number> {
  const rows = parseTable(DUMP_PATH, 'exercises');
  let count = 0;
  for (const row of rows) {
    const name = (row.name ?? '').trim();
    if (!name) continue;
    const category = (row.category ?? '').trim() || null;

    const existing = await prisma.exercise.findFirst({ where: { name } });
    const exercise = existing
      ? await prisma.exercise.update({ where: { id: existing.id }, data: { category } })
      : await prisma.exercise.create({ data: { name, category } });
    exerciseMap[name] = exercise.id;
    count += 1;
  }
  return count;
}

async function getOrCreateExercise(name: string, category: string | null, exerciseMap: Record<string, string>): Promise<string> {
  if (exerciseMap[name]) return exerciseMap[name];
  const existing = await prisma.exercise.findFirst({ where: { name } });
  const exercise = existing ?? (await prisma.exercise.create({ data: { name, category } }));
  exerciseMap[name] = exercise.id;
  return exercise.id;
}

async function migrateNutritionTemplates(): Promise<number> {
  const rows = parseTable(DUMP_PATH, 'nutritionTemplate');
  let count = 0;
  for (const row of rows) {
    const name = (row.name ?? '').trim();
    if (!name || !row.mealtemplate) continue;

    let parsed: { meal?: LegacyMeal[] };
    try {
      parsed = JSON.parse(row.mealtemplate);
    } catch {
      continue;
    }
    const meals = parsed.meal ?? [];

    const cleanItems = (meal: LegacyMeal): LegacyMealItem[] =>
      (meal.items ?? []).filter((it): it is LegacyMealItem => Boolean(it && it.name));

    let cal = 0;
    let protein = 0;
    let carbs = 0;
    let fat = 0;
    for (const meal of meals) {
      for (const item of cleanItems(meal)) {
        cal += Number(item.calories ?? 0);
        protein += Number(item.proteins ?? 0);
        carbs += Number(item.carbs ?? 0);
        fat += Number(item.fats ?? 0);
      }
    }

    const existing = await prisma.nutritionPlanTemplate.findFirst({ where: { name, visibility: 'GLOBAL' } });
    if (existing) {
      await prisma.nutritionTemplateMeal.deleteMany({ where: { templateId: existing.id } });
      await prisma.nutritionPlanTemplate.delete({ where: { id: existing.id } });
    }

    await prisma.nutritionPlanTemplate.create({
      data: {
        name,
        description: (row.program_notes ?? '').trim() || null,
        visibility: 'GLOBAL',
        calorieTarget: Math.round(cal),
        proteinTarget: Math.round(protein),
        carbTarget: Math.round(carbs),
        fatTarget: Math.round(fat),
        meals: {
          create: meals
            .filter((meal) => cleanItems(meal).length > 0)
            .map((meal, mealIdx) => ({
              mealNumber: meal.mealnum ?? mealIdx + 1,
              name: (meal.name ?? '').trim() || `Meal ${meal.mealnum ?? mealIdx + 1}`,
              plannedTime: (meal.time ?? '').trim() || null,
              items: {
                create: cleanItems(meal).map((item) => ({
                  nameSnapshot: item.name,
                  quantity: num(String(item.mulipiler ?? '1')) ?? 1,
                  unit: (item.portion_name ?? 'serving').trim() || 'serving',
                  calories: Number(item.calories ?? 0),
                  protein: Number(item.proteins ?? 0),
                  carbs: Number(item.carbs ?? 0),
                  fat: Number(item.fats ?? 0)
                }))
              }
            }))
        }
      }
    });
    count += 1;
  }
  return count;
}

async function migrateExerciseTemplates(exerciseMap: Record<string, string>): Promise<number> {
  let count = 0;

  const templateRows = parseTable(DUMP_PATH, 'exerciseTemplate');
  for (const row of templateRows) {
    const name = (row.name ?? '').trim();
    if (!name || !row.circuittemplate) continue;
    let parsed: { circuit?: LegacyCircuit[] };
    try {
      parsed = JSON.parse(row.circuittemplate);
    } catch {
      continue;
    }
    const items: LegacyCircuitItem[] = (parsed.circuit ?? []).flatMap((c) => c.items ?? []);
    await upsertExerciseTemplate(name, (row.program_notes ?? '').trim() || null, items, exerciseMap);
    count += 1;
  }

  const circuitRows = parseTable(DUMP_PATH, 'circuits');
  for (const row of circuitRows) {
    const name = (row.name ?? '').trim();
    if (!name || !row.circuit) continue;
    let parsed: LegacyCircuit & { notes?: string };
    try {
      parsed = JSON.parse(row.circuit);
    } catch {
      continue;
    }
    const items = parsed.items ?? [];
    await upsertExerciseTemplate(name, (parsed.notes ?? '').trim() || null, items, exerciseMap);
    count += 1;
  }

  return count;
}

async function upsertExerciseTemplate(
  name: string,
  description: string | null,
  items: LegacyCircuitItem[],
  exerciseMap: Record<string, string>
): Promise<void> {
  const existing = await prisma.exerciseTemplate.findFirst({ where: { name, visibility: 'GLOBAL' } });
  if (existing) {
    await prisma.exerciseTemplateItem.deleteMany({ where: { templateId: existing.id } });
    await prisma.exerciseTemplate.delete({ where: { id: existing.id } });
  }

  const itemData: {
    exerciseId: string;
    sortOrder: number;
    sets: number | null;
    reps: number | null;
    weight: number | null;
  }[] = [];
  let sortOrder = 0;
  for (const item of items) {
    if (!item?.name) continue;
    const exerciseId = await getOrCreateExercise(item.name.trim(), (item.category ?? '').trim() || null, exerciseMap);
    itemData.push({
      exerciseId,
      sortOrder: sortOrder++,
      sets: toInt(item.sets ?? null),
      reps: toInt(item.reps ?? null),
      weight: numPositive(item.weight ?? null)
    });
  }

  await prisma.exerciseTemplate.create({
    data: {
      name,
      description,
      visibility: 'GLOBAL',
      items: { create: itemData }
    }
  });
}

async function main(): Promise<void> {
  const idMap = loadIdMap();

  console.log('Phase 1: migrating reference libraries + templates');
  const foods = await migrateFoods(idMap.foods);
  console.log(`  Foods: ${foods}`);
  const exercises = await migrateExercises(idMap.exercises);
  console.log(`  Exercises: ${exercises}`);
  const nutritionTemplates = await migrateNutritionTemplates();
  console.log(`  Nutrition templates: ${nutritionTemplates}`);
  const exerciseTemplates = await migrateExerciseTemplates(idMap.exercises);
  console.log(`  Exercise templates: ${exerciseTemplates}`);

  saveIdMap(idMap);
  console.log('Phase 1 complete.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
