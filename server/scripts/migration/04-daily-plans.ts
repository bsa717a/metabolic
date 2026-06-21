import { ExerciseStatus, MealItemType, MealStatus, PrismaClient } from '@prisma/client';
import { DUMP_PATH } from './config.js';
import { loadIdMap, saveIdMap, type IdMap } from './idmap.js';
import { parseLegacyDate, parseTable, parseTimestamp, type LegacyRow } from './mysqlDumpParser.js';
import {
  circuitItems,
  mealItems,
  parseCircuits,
  parseIntLoose,
  parseMeals,
  parsePlannedTime,
  parseQuantity,
  parseWaterOz,
  parseWeight,
  toNumber
} from './legacyPlanParse.js';

const prisma = new PrismaClient();

const LEGACY_NOTE = 'legacy:daily-plan';

interface Args {
  dryRun: boolean;
  force: boolean;
  email: string | null;
  legacyUserId: string | null;
  limit: number | null;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: false, force: false, email: null, legacyUserId: null, limit: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--force') args.force = true;
    else if (a === '--email') args.email = (argv[++i] ?? '').trim().toLowerCase() || null;
    else if (a === '--legacy-user-id') args.legacyUserId = (argv[++i] ?? '').trim() || null;
    else if (a === '--limit') args.limit = Number(argv[++i]) || null;
  }
  return args;
}

interface SessionRef {
  legacyClientId: string;
  date: Date;
  sessionNumber: number;
}

/** session.date -> UTC midnight, falling back to created_at (mirrors phase 3 toMetrics). */
function sessionDate(row: LegacyRow): Date | null {
  const direct = parseLegacyDate(row.date);
  if (direct) return direct;
  const ts = parseTimestamp(row.created_at);
  return ts ? new Date(Date.UTC(ts.getUTCFullYear(), ts.getUTCMonth(), ts.getUTCDate())) : null;
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface DayPlan {
  date: Date;
  nutrition?: { sessionNumber: number; row: LegacyRow };
  exercise?: { sessionNumber: number; row: LegacyRow };
}

interface Stats {
  nutritionResolved: number;
  nutritionNoSession: number;
  nutritionUnmigrated: number;
  exerciseResolved: number;
  exerciseNoSession: number;
  exerciseUnmigrated: number;
  droppedSameDayAlternates: number;
  dailyLogsCreated: number;
  dailyLogsUpdated: number;
  dailyLogsSkippedExisting: number;
  dailyLogsSkippedRealData: number;
  dailyLogsSkippedNoProgram: number;
  mealsCreated: number;
  mealItemsCreated: number;
  scheduledExercisesCreated: number;
  exercisesCreatedOnTheFly: number;
}

function emptyStats(): Stats {
  return {
    nutritionResolved: 0,
    nutritionNoSession: 0,
    nutritionUnmigrated: 0,
    exerciseResolved: 0,
    exerciseNoSession: 0,
    exerciseUnmigrated: 0,
    droppedSameDayAlternates: 0,
    dailyLogsCreated: 0,
    dailyLogsUpdated: 0,
    dailyLogsSkippedExisting: 0,
    dailyLogsSkippedRealData: 0,
    dailyLogsSkippedNoProgram: 0,
    mealsCreated: 0,
    mealItemsCreated: 0,
    scheduledExercisesCreated: 0,
    exercisesCreatedOnTheFly: 0
  };
}

function buildSessionIndex(): Map<string, SessionRef> {
  const index = new Map<string, SessionRef>();
  for (const row of parseTable(DUMP_PATH, 'training_sessions')) {
    const date = sessionDate(row);
    if (!date) continue;
    index.set(String(row.id), {
      legacyClientId: String(row.owner_id),
      date,
      sessionNumber: Number(row.session_number) || 0
    });
  }
  return index;
}

/** Resolve a target legacy client id from --email / --legacy-user-id (or null for all). */
function resolveTargetClient(args: Args): string | null {
  if (args.legacyUserId) return args.legacyUserId;
  if (args.email) {
    for (const row of parseTable(DUMP_PATH, 'users')) {
      if ((row.email ?? '').trim().toLowerCase() === args.email) return String(row.id);
    }
    throw new Error(`No legacy user found for email ${args.email}`);
  }
  return null;
}

async function getOrCreateExercise(
  name: string,
  category: string | null,
  idMap: IdMap,
  stats: Stats,
  dryRun: boolean
): Promise<string | null> {
  const key = name.trim();
  if (!key) return null;
  if (idMap.exercises[key]) return idMap.exercises[key];
  const existing = await prisma.exercise.findFirst({ where: { name: key } });
  if (existing) {
    idMap.exercises[key] = existing.id;
    return existing.id;
  }
  if (dryRun) {
    stats.exercisesCreatedOnTheFly += 1;
    return 'dry-run-exercise';
  }
  const created = await prisma.exercise.create({ data: { name: key, category } });
  idMap.exercises[key] = created.id;
  stats.exercisesCreatedOnTheFly += 1;
  return created.id;
}

type ExistingLog = { id: string; notes: string | null };

async function materializeDay(
  legacyClientId: string,
  plan: DayPlan,
  idMap: IdMap,
  args: Args,
  stats: Stats,
  existingByKey: Map<string, ExistingLog>
): Promise<void> {
  const userId = idMap.users[legacyClientId];
  const programId = idMap.programs[legacyClientId];
  if (!userId || !programId) {
    stats.dailyLogsSkippedNoProgram += 1;
    return;
  }

  const existing = existingByKey.get(`${userId}|${dateKey(plan.date)}`);
  if (existing && !existing.notes?.startsWith('legacy:')) {
    stats.dailyLogsSkippedRealData += 1;
    return;
  }
  if (existing && !args.force) {
    stats.dailyLogsSkippedExisting += 1;
    return;
  }

  // Build planned meals from the nutrition plan.
  const meals = plan.nutrition ? parseMeals(plan.nutrition.row.meals) : [];
  type ItemData = {
    foodId: string | null;
    type: MealItemType;
    nameSnapshot: string;
    quantity: number;
    unit: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  const mealPayloads: {
    mealNumber: number;
    name: string;
    plannedTime: string | null;
    plannedCalories: number;
    plannedProtein: number;
    plannedCarbs: number;
    plannedFat: number;
    items: ItemData[];
  }[] = [];

  let dayCalories = 0;
  let dayProtein = 0;
  let dayCarbs = 0;
  let dayFat = 0;

  meals.forEach((meal, idx) => {
    const items = mealItems(meal);
    if (!items.length) return;
    let mc = 0;
    let mp = 0;
    let mcarb = 0;
    let mf = 0;
    const itemData: ItemData[] = items.map((item) => {
      const calories = toNumber(item.calories);
      const protein = toNumber(item.proteins);
      const carbs = toNumber(item.carbs);
      const fat = toNumber(item.fats);
      mc += calories;
      mp += protein;
      mcarb += carbs;
      mf += fat;
      const name = (item.name ?? '').trim();
      return {
        foodId: idMap.foods[name] ?? null,
        type: MealItemType.PLANNED,
        nameSnapshot: name,
        quantity: parseQuantity(item.mulipiler),
        unit: (item.portion_name ?? 'serving').trim() || 'serving',
        calories,
        protein,
        carbs,
        fat
      };
    });
    dayCalories += mc;
    dayProtein += mp;
    dayCarbs += mcarb;
    dayFat += mf;
    mealPayloads.push({
      mealNumber: meal.mealnum ?? idx + 1,
      name: (meal.name ?? '').trim() || `Meal ${meal.mealnum ?? idx + 1}`,
      plannedTime: parsePlannedTime(meal.time),
      plannedCalories: mc,
      plannedProtein: mp,
      plannedCarbs: mcarb,
      plannedFat: mf,
      items: itemData
    });
  });

  // Build planned scheduled exercises from the exercise plan.
  const circuits = plan.exercise ? parseCircuits(plan.exercise.row.circuits) : [];
  const exercisePayloads: { exerciseId: string; sets: number | null; reps: number | null; weight: number | null; sortOrder: number }[] = [];
  let sortOrder = 0;
  for (const circuit of circuits) {
    for (const item of circuitItems(circuit)) {
      const exerciseId = await getOrCreateExercise((item.name ?? '').trim(), (item.category ?? '').trim() || null, idMap, stats, args.dryRun);
      if (!exerciseId) continue;
      exercisePayloads.push({
        exerciseId,
        sets: parseIntLoose(item.sets),
        reps: parseIntLoose(item.reps),
        weight: parseWeight(item.weight),
        sortOrder: sortOrder++
      });
    }
  }

  const waterTargetOz = (plan.nutrition ? parseWaterOz(plan.nutrition.row.water_intake) : null) ?? 64;

  if (args.dryRun) {
    if (existing) stats.dailyLogsUpdated += 1;
    else stats.dailyLogsCreated += 1;
    stats.mealsCreated += mealPayloads.length;
    stats.mealItemsCreated += mealPayloads.reduce((s, m) => s + m.items.length, 0);
    stats.scheduledExercisesCreated += exercisePayloads.length;
    return;
  }

  const nestedMeals = mealPayloads.map((meal) => ({
    userId,
    mealNumber: meal.mealNumber,
    name: meal.name,
    plannedTime: meal.plannedTime,
    status: MealStatus.PLANNED,
    plannedCalories: meal.plannedCalories,
    plannedProtein: meal.plannedProtein,
    plannedCarbs: meal.plannedCarbs,
    plannedFat: meal.plannedFat,
    items: { create: meal.items }
  }));

  const logData = {
    calorieTarget: Math.round(dayCalories),
    proteinTarget: Math.round(dayProtein),
    carbTarget: Math.round(dayCarbs),
    fatTarget: Math.round(dayFat),
    waterTargetOz,
    mealsPlanned: mealPayloads.length,
    exercisesPlanned: exercisePayloads.length,
    notes: LEGACY_NOTE
  };

  const scheduledData = exercisePayloads.map((e) => ({
    programId,
    userId,
    exerciseId: e.exerciseId,
    scheduledDate: plan.date,
    sets: e.sets,
    reps: e.reps,
    weight: e.weight,
    status: ExerciseStatus.PLANNED,
    sortOrder: e.sortOrder
  }));

  if (existing) {
    // Rare --force path: replace contents of an already-imported legacy day.
    await prisma.$transaction([
      prisma.meal.deleteMany({ where: { dailyLogId: existing.id } }),
      prisma.scheduledExercise.deleteMany({ where: { programId, scheduledDate: plan.date } }),
      prisma.dailyLog.update({ where: { id: existing.id }, data: logData }),
      ...nestedMeals.map((meal) =>
        prisma.meal.create({ data: { dailyLogId: existing.id, ...meal } })
      ),
      ...(scheduledData.length ? [prisma.scheduledExercise.createMany({ data: scheduledData })] : [])
    ]);
    stats.dailyLogsUpdated += 1;
  } else {
    // Common path: one batched transaction = one network round trip.
    await prisma.$transaction([
      prisma.dailyLog.create({
        data: { programId, userId, date: plan.date, ...logData, meals: { create: nestedMeals } }
      }),
      ...(scheduledData.length ? [prisma.scheduledExercise.createMany({ data: scheduledData })] : [])
    ]);
    stats.dailyLogsCreated += 1;
  }
  stats.mealsCreated += mealPayloads.length;
  stats.mealItemsCreated += mealPayloads.reduce((s, m) => s + m.items.length, 0);
  stats.scheduledExercisesCreated += exercisePayloads.length;
}

async function preloadExistingLogs(userIds: string[]): Promise<Map<string, ExistingLog>> {
  const map = new Map<string, ExistingLog>();
  const chunk = 300;
  for (let i = 0; i < userIds.length; i += chunk) {
    const slice = userIds.slice(i, i + chunk);
    const rows = await prisma.dailyLog.findMany({
      where: { userId: { in: slice } },
      select: { id: true, userId: true, date: true, notes: true }
    });
    for (const r of rows) map.set(`${r.userId}|${dateKey(r.date)}`, { id: r.id, notes: r.notes });
  }
  return map;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const idMap = loadIdMap();
  const stats = emptyStats();

  const sessions = buildSessionIndex();
  const targetClient = resolveTargetClient(args);

  // Group resolved plans by (legacyClientId -> dateKey -> DayPlan), keeping the
  // plan attached to the highest session_number when a day has multiple.
  const byUser = new Map<string, Map<string, DayPlan>>();

  const ingest = (
    table: 'nutritionPrograms' | 'exercisePrograms',
    kind: 'nutrition' | 'exercise'
  ) => {
    for (const row of parseTable(DUMP_PATH, table)) {
      const session = sessions.get(String(row.owner_id));
      if (!session) {
        if (kind === 'nutrition') stats.nutritionNoSession += 1;
        else stats.exerciseNoSession += 1;
        continue;
      }
      const lc = session.legacyClientId;
      if (targetClient && lc !== targetClient) continue;
      if (!idMap.users[lc]) {
        if (kind === 'nutrition') stats.nutritionUnmigrated += 1;
        else stats.exerciseUnmigrated += 1;
        continue;
      }
      if (kind === 'nutrition') stats.nutritionResolved += 1;
      else stats.exerciseResolved += 1;

      const dk = dateKey(session.date);
      let days = byUser.get(lc);
      if (!days) {
        days = new Map();
        byUser.set(lc, days);
      }
      const day = days.get(dk) ?? { date: session.date };
      const slot = day[kind];
      if (slot && slot.sessionNumber >= session.sessionNumber) {
        stats.droppedSameDayAlternates += 1;
        continue;
      }
      if (slot) stats.droppedSameDayAlternates += 1;
      day[kind] = { sessionNumber: session.sessionNumber, row };
      days.set(dk, day);
    }
  };

  ingest('nutritionPrograms', 'nutrition');
  ingest('exercisePrograms', 'exercise');

  const clients = [...byUser.keys()].slice(0, args.limit ?? undefined);
  console.log(`Phase 4: historical daily plans${args.dryRun ? ' (DRY RUN)' : ''}`);
  console.log(`  Users to process: ${clients.length}${args.limit ? ` (limited from ${byUser.size})` : ''}`);

  const userIds = [...new Set(clients.map((lc) => idMap.users[lc]).filter(Boolean))];
  console.log(`  Preloading existing daily logs for ${userIds.length} users...`);
  const existingByKey = await preloadExistingLogs(userIds);

  let processed = 0;
  for (const lc of clients) {
    const days = byUser.get(lc)!;
    for (const plan of days.values()) {
      await materializeDay(lc, plan, idMap, args, stats, existingByKey);
    }
    processed += 1;
    if (processed % 50 === 0) console.log(`  ...processed ${processed}/${clients.length} users`);
  }

  if (!args.dryRun) saveIdMap(idMap);

  console.log('\nResults:');
  console.log(`  Nutrition plans resolved: ${stats.nutritionResolved} (no session: ${stats.nutritionNoSession}, unmigrated user: ${stats.nutritionUnmigrated})`);
  console.log(`  Exercise plans resolved:  ${stats.exerciseResolved} (no session: ${stats.exerciseNoSession}, unmigrated user: ${stats.exerciseUnmigrated})`);
  console.log(`  Same-day alternates dropped: ${stats.droppedSameDayAlternates}`);
  console.log(`  Daily logs created: ${stats.dailyLogsCreated}, updated: ${stats.dailyLogsUpdated}`);
  console.log(`  Daily logs skipped (already legacy): ${stats.dailyLogsSkippedExisting}, (real data present): ${stats.dailyLogsSkippedRealData}, (no program): ${stats.dailyLogsSkippedNoProgram}`);
  console.log(`  Meals: ${stats.mealsCreated}, meal items: ${stats.mealItemsCreated}`);
  console.log(`  Scheduled exercises: ${stats.scheduledExercisesCreated} (exercises created on the fly: ${stats.exercisesCreatedOnTheFly})`);
  console.log('Phase 4 complete.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
