/**
 * Import one or more legacy astermet users (profile, metrics history, weekly
 * meal/exercise history, and current plan) into the Metabolic database.
 *
 * Weekly nutrition and exercise rows stay linked the way the old app stored
 * them: `owner_id` is the training session id. Rows are not dropped because
 * the date or session number looks stale. An email that already exists is
 * refreshed in place.
 *
 * Dry-run by default:
 *   cd server && npx tsx --env-file=.env scripts/migration/import-one-legacy-user.ts \
 *     --email grobrien@gmail.com
 *
 *   npx tsx --env-file=.env scripts/migration/import-one-legacy-user.ts \
 *     --email iammorgancrawford@gmail.com --email joebieker@gmail.com
 *
 *   LEGACY_DUMP_PATH=/Users/derekfowler/Downloads/astermet_app.sql \
 *   npx tsx --env-file=.env scripts/migration/import-one-legacy-user.ts \
 *     --email grobrien@gmail.com --apply
 *
 * Auth only (creates the Firebase email/password from the legacy bcrypt hash
 * when that email does not already exist):
 *   npx tsx --env-file=.env scripts/migration/import-one-legacy-user.ts \
 *     --email grobrien@gmail.com --apply --auth-only
 */
import {
  ExerciseStatus,
  MealItemType,
  MealStatus,
  MetricType,
  PlanTier,
  PrismaClient,
  ProgramMode,
  ProgramStatus,
  Role,
  SubscriptionStatus,
  UserStatus,
  Visibility
} from '@prisma/client';
import { DUMP_PATH, SKIP_FIREBASE, legacyUid } from './config.js';
import { loadIdMap, saveIdMap, type IdMap } from './idmap.js';
import {
  cleanText,
  num,
  numPositive,
  parseHeightInches,
  parseLegacyDate,
  parseTable,
  parseTimestamp,
  splitName,
  type LegacyRow
} from './mysqlDumpParser.js';
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
  toNumber,
  type LegacyCircuitItem
} from './legacyPlanParse.js';
import {
  accountAction,
  currentPlanTitle,
  displayNameFromLegacy,
  foreignSessionPrograms,
  parseImportArgs,
  type ImportArgs
} from './legacyUserImport.js';

const prisma = new PrismaClient();
const LEGACY_DAY_NOTE = 'legacy:daily-plan';
const LEGACY_SESSION_NOTE = 'legacy:session';
const CURRENT_NUTRITION_TAG_PREFIX = 'mmv1:nutritionProgram:';
const CURRENT_EXERCISE_TAG_PREFIX = 'mmv1:exerciseProgram:';

const BCRYPT_RE = /^\$2[aby]\$\d{2}\$.{53}$/;

function safeError(error: unknown): string {
  if (!(error instanceof Error)) return 'database unreachable';
  const cleaned = error.message.replace(/postgres(?:ql)?:\/\/\S+/gi, 'postgresql://***');
  const lines = cleaned.split('\n').map((part) => part.trim()).filter(Boolean);
  const useful = lines.find((line) => /DATABASE_URL|Environment variable|Can't reach|ECONNREFUSED|connect/i.test(line));
  return (useful || lines.at(-1) || 'database unreachable').slice(0, 240);
}

async function describeAccountAction(email: string): Promise<string> {
  if (!process.env.DATABASE_URL) {
    return 'Action: lookup-skipped (DATABASE_URL is not set). Apply refreshes an existing email in place and creates a user only when that email is absent.';
  }
  const failed = (detail: string) =>
    `Action: lookup-failed (${detail}). Apply refreshes an existing email in place and creates a user only when that email is absent.`;
  const lookup = prisma.user
    .findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true }
    })
    .then((existing) => {
      const action = accountAction(Boolean(existing));
      return action === 'refresh'
        ? `Action: refresh (existing user ${existing?.id}; no second account)`
        : 'Action: create';
    })
    .catch((error: unknown) => failed(safeError(error)));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<string>((resolve) => {
    timer = setTimeout(() => resolve(failed('timed out')), 8000);
  });
  try {
    return await Promise.race([lookup, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function dateLabel(row: LegacyRow): string {
  return parseLegacyDate(row.date)?.toISOString().slice(0, 10) ?? (row.date ?? '').trim();
}

function legacyPasswordHash(row: LegacyRow): string | null {
  const hash = (row.password ?? '').trim().replace(/^\$2y\$/, '$2a$');
  return BCRYPT_RE.test(hash) ? hash : null;
}

async function importFirebaseLogin(row: LegacyRow, apply: boolean): Promise<string | null> {
  const email = (row.email ?? '').trim().toLowerCase();
  const { firstName, lastName } = splitName(row.name);
  const passwordHash = legacyPasswordHash(row);
  const uid = legacyUid(row.id ?? email);

  if (SKIP_FIREBASE) {
    console.log('Firebase: SKIP_FIREBASE=1, leaving login uncreated');
    return null;
  }
  if (!passwordHash) {
    console.log('Firebase: no usable bcrypt hash on the legacy user');
    return null;
  }
  if (!apply) {
    console.log(`Firebase: would import ${email} as ${uid} with the legacy bcrypt hash when that email does not already exist`);
    return uid;
  }

  const { getFirebaseAdmin } = await import('../../src/auth/firebaseAdmin.js');
  const auth = getFirebaseAdmin().auth();

  try {
    const existing = await auth.getUserByEmail(email);
    console.log(`Firebase: ${email} already exists as ${existing.uid}; keeping that account`);
    return existing.uid;
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    if (code !== 'auth/user-not-found') throw error;
  }

  const result = await auth.importUsers(
    [
      {
        uid,
        email,
        displayName: `${firstName} ${lastName}`.trim(),
        passwordHash: Buffer.from(passwordHash, 'utf8')
      }
    ],
    { hash: { algorithm: 'BCRYPT' } }
  );
  if (result.failureCount) {
    const message = result.errors[0]?.error.message ?? 'unknown Firebase import error';
    throw new Error(`Firebase import failed for ${email}: ${message}`);
  }
  console.log(`Firebase: imported ${email} as ${uid} with the legacy password`);
  return uid;
}

function sessionDate(row: LegacyRow): Date | null {
  const direct = parseLegacyDate(row.date);
  if (direct) return direct;
  const ts = parseTimestamp(row.created_at);
  return ts ? new Date(Date.UTC(ts.getUTCFullYear(), ts.getUTCMonth(), ts.getUTCDate())) : null;
}

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function parseDurationSeconds(reps: unknown): number | null {
  if (typeof reps !== 'string') return null;
  const lower = reps.toLowerCase();
  const sec = lower.match(/(\d+)\s*sec/);
  if (sec) return Math.max(1, Number(sec[1]));
  const min = lower.match(/(\d+)\s*min/);
  if (min) return Number(min[1]) * 60;
  return null;
}

function parseSpeed(value: unknown): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed || /^n\/?a$/i.test(trimmed)) return null;
  return trimmed;
}

function parseReps(value: unknown): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function mealPlannedTime(meal: { name?: string; time?: string }): string | null {
  return parsePlannedTime(meal.time) ?? parsePlannedTime(meal.name);
}

interface SessionMetrics {
  legacySessionId: string;
  date: Date;
  sessionNumber: number;
  weight: number | null;
  bodyFat: number | null;
  waist: number | null;
  hips: number | null;
  chest: number | null;
  neck: number | null;
  arm: number | null;
  bicep: number | null;
  thigh: number | null;
  calf: number | null;
  forearm: number | null;
  fatMass: number | null;
  leanMass: number | null;
}

const ENUM_METRICS: { type: MetricType; unit: string; pick: (m: SessionMetrics) => number | null }[] = [
  { type: MetricType.WEIGHT, unit: 'lbs', pick: (m) => m.weight },
  { type: MetricType.BODY_FAT, unit: '%', pick: (m) => m.bodyFat },
  { type: MetricType.WAIST, unit: 'in', pick: (m) => m.waist },
  { type: MetricType.HIPS, unit: 'in', pick: (m) => m.hips },
  { type: MetricType.CHEST, unit: 'in', pick: (m) => m.chest },
  { type: MetricType.FAT_MASS, unit: 'lbs', pick: (m) => m.fatMass },
  { type: MetricType.LEAN_TISSUE_MASS, unit: 'lbs', pick: (m) => m.leanMass }
];

function toMetrics(row: LegacyRow): SessionMetrics | null {
  const date = sessionDate(row);
  if (!date) return null;
  const weight = numPositive(row.weight);
  const bodyFat = numPositive(row.body_fat);
  const fatMass = weight !== null && bodyFat !== null ? Math.round(weight * (bodyFat / 100) * 100) / 100 : null;
  const leanMass = weight !== null && fatMass !== null ? Math.round((weight - fatMass) * 100) / 100 : null;
  return {
    legacySessionId: String(row.id),
    date,
    sessionNumber: Number(row.session_number) || 0,
    weight,
    bodyFat,
    waist: numPositive(row.waist),
    hips: numPositive(row.hips),
    chest: numPositive(row.chest),
    neck: numPositive(row.neck),
    arm: numPositive(row.arm),
    bicep: numPositive(row.bicep),
    thigh: numPositive(row.thigh),
    calf: numPositive(row.calf),
    forearm: numPositive(row.forearm),
    fatMass,
    leanMass
  };
}

function dedupeByDay(sessions: SessionMetrics[]): SessionMetrics[] {
  const byDay = new Map<string, SessionMetrics>();
  for (const session of sessions) {
    const key = dateKey(session.date);
    const existing = byDay.get(key);
    if (!existing || session.sessionNumber >= existing.sessionNumber) byDay.set(key, session);
  }
  return [...byDay.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
}

function firstNonNull(sessions: SessionMetrics[], pick: (m: SessionMetrics) => number | null): number | null {
  for (const session of sessions) {
    const value = pick(session);
    if (value !== null) return value;
  }
  return null;
}

function lastNonNull(sessions: SessionMetrics[], pick: (m: SessionMetrics) => number | null): number | null {
  for (let i = sessions.length - 1; i >= 0; i -= 1) {
    const value = pick(sessions[i]);
    if (value !== null) return value;
  }
  return null;
}

async function getOrCreateFood(name: string, item: { portion_name?: string; calories?: unknown; proteins?: unknown; carbs?: unknown; fats?: unknown }, idMap: IdMap): Promise<string | null> {
  const key = name.trim();
  if (!key) return null;
  if (idMap.foods[key]) return idMap.foods[key];
  const existing = await prisma.food.findFirst({ where: { name: key } });
  if (existing) {
    idMap.foods[key] = existing.id;
    return existing.id;
  }
  const created = await prisma.food.create({
    data: {
      name: key,
      servingSize: 1,
      servingUnit: (item.portion_name ?? 'serving').trim() || 'serving',
      calories: toNumber(item.calories),
      protein: toNumber(item.proteins),
      carbs: toNumber(item.carbs),
      fat: toNumber(item.fats),
      source: 'IMPORTED',
      visibility: Visibility.GLOBAL,
      verified: true
    }
  });
  idMap.foods[key] = created.id;
  return created.id;
}

async function getOrCreateExercise(name: string, category: string | null, idMap: IdMap): Promise<string | null> {
  const key = name.trim();
  if (!key) return null;
  if (idMap.exercises[key]) return idMap.exercises[key];
  const existing = await prisma.exercise.findFirst({ where: { name: key } });
  if (existing) {
    idMap.exercises[key] = existing.id;
    return existing.id;
  }
  const created = await prisma.exercise.create({ data: { name: key, category } });
  idMap.exercises[key] = created.id;
  return created.id;
}

function exerciseItemPayload(item: LegacyCircuitItem & { speed?: string }, sortOrder: number, exerciseId: string) {
  const repsRaw = item.reps;
  const durationSeconds = parseDurationSeconds(repsRaw);
  const numericReps = durationSeconds == null ? parseIntLoose(repsRaw) : null;
  return {
    exerciseId,
    sortOrder,
    sets: parseIntLoose(item.sets),
    reps: durationSeconds == null ? parseReps(repsRaw) ?? (numericReps != null ? String(numericReps) : null) : null,
    speed: parseSpeed(item.speed),
    durationSeconds,
    weight: parseWeight(item.weight)
  };
}

async function upsertPerson(row: LegacyRow, role: Role, apply: boolean) {
  const email = (row.email ?? '').trim().toLowerCase();
  const { firstName, lastName } = splitName(row.name);
  const phoneRaw = (row.phone ?? '').replace(/[^\d+]/g, '');
  const data = {
    firebaseUid: legacyUid(row.id ?? email),
    email,
    firstName,
    lastName,
    phone: phoneRaw || null,
    gender: (row.gender ?? '').trim().toLowerCase() || null,
    role,
    status: (row.status ?? '').trim().toLowerCase() === 'active' || !(row.status ?? '').trim() ? UserStatus.ACTIVE : UserStatus.DISABLED,
    timezone: 'America/Denver',
    ...(role === Role.USER
      ? { plan: PlanTier.COACH_LED, subscriptionStatus: SubscriptionStatus.COACH_MANAGED }
      : {})
  };
  if (!apply) {
    const existing = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
    return existing ?? { id: `dry-run-${row.id}`, ...data };
  }
  const existing = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
  if (existing && role !== Role.USER) {
    return existing;
  }
  const profileUpdate = {
    firstName: data.firstName,
    lastName: data.lastName,
    phone: data.phone,
    gender: data.gender,
    role: data.role,
    status: data.status,
    timezone: data.timezone,
    ...(role === Role.USER
      ? { plan: PlanTier.COACH_LED, subscriptionStatus: SubscriptionStatus.COACH_MANAGED }
      : {})
  };
  if (existing) {
    console.log(`Account: refresh ${email} (${existing.id})`);
    return prisma.user.update({ where: { id: existing.id }, data: profileUpdate });
  }
  console.log(`Account: create ${email}`);
  return prisma.user.create({ data });
}

async function upsertCoachAssignment(coachId: string, userId: string): Promise<void> {
  const existing = await prisma.coachAssignment.findFirst({
    where: { userId, status: 'ACTIVE' }
  });
  if (existing?.coachId === coachId) return;
  if (existing) {
    await prisma.coachAssignment.update({
      where: { id: existing.id },
      data: { status: 'COMPLETED', accessEndsAt: new Date() }
    });
  }
  await prisma.coachAssignment.create({ data: { coachId, userId, status: 'ACTIVE' } });
}

async function importCurrentNutritionTemplate(
  latest: LegacyRow,
  createdById: string,
  apply: boolean,
  displayName: string
) {
  const meals = parseMeals(latest.meals);
  const payloads = meals
    .map((meal, idx) => {
      const items = mealItems(meal);
      if (!items.length) return null;
      let calories = 0;
      let protein = 0;
      let carbs = 0;
      let fat = 0;
      const itemCreates = items.map((item) => {
        calories += toNumber(item.calories);
        protein += toNumber(item.proteins);
        carbs += toNumber(item.carbs);
        fat += toNumber(item.fats);
        return {
          nameSnapshot: (item.name ?? '').trim(),
          quantity: parseQuantity(item.mulipiler),
          unit: (item.portion_name ?? 'serving').trim() || 'serving',
          calories: toNumber(item.calories),
          protein: toNumber(item.proteins),
          carbs: toNumber(item.carbs),
          fat: toNumber(item.fats)
        };
      });
      return {
        mealNumber: meal.mealnum ?? idx + 1,
        name: (meal.name ?? '').trim() || `Meal ${meal.mealnum ?? idx + 1}`,
        plannedTime: mealPlannedTime(meal),
        calorieTarget: Math.round(calories),
        items: itemCreates,
        calories,
        protein,
        carbs,
        fat
      };
    })
    .filter((meal): meal is NonNullable<typeof meal> => Boolean(meal));

  const totals = payloads.reduce(
    (acc, meal) => ({
      calories: acc.calories + meal.calories,
      protein: acc.protein + meal.protein,
      carbs: acc.carbs + meal.carbs,
      fat: acc.fat + meal.fat
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
  const tag = `${CURRENT_NUTRITION_TAG_PREFIX}${latest.id}`;
  const waterTargetOz = parseWaterOz(latest.water_intake);

  if (!apply) {
    return { id: `dry-run-nutrition-${latest.id}`, totals, waterTargetOz, mealCount: payloads.length, tag };
  }

  const existing = await prisma.nutritionPlanTemplate.findFirst({ where: { description: tag } });
  if (existing) {
    await prisma.nutritionTemplateMeal.deleteMany({ where: { templateId: existing.id } });
    await prisma.nutritionPlanTemplate.delete({ where: { id: existing.id } });
  }

  const created = await prisma.nutritionPlanTemplate.create({
    data: {
      name: currentPlanTitle(displayName, 'meals', dateLabel(latest)),
      description: tag,
      visibility: Visibility.USER,
      createdById,
      calorieTarget: Math.round(totals.calories),
      proteinTarget: Math.round(totals.protein),
      carbTarget: Math.round(totals.carbs),
      fatTarget: Math.round(totals.fat),
      meals: {
        create: payloads.map((meal) => ({
          mealNumber: meal.mealNumber,
          name: meal.name,
          plannedTime: meal.plannedTime,
          calorieTarget: meal.calorieTarget,
          items: { create: meal.items }
        }))
      }
    }
  });
  return { id: created.id, totals, waterTargetOz, mealCount: payloads.length, tag };
}

async function importCurrentExercisePlan(
  latest: LegacyRow,
  createdById: string,
  idMap: IdMap,
  apply: boolean,
  displayName: string
) {
  const circuits = parseCircuits(latest.circuits).filter((circuit) => circuitItems(circuit).length > 0);
  const tag = `${CURRENT_EXERCISE_TAG_PREFIX}${latest.id}`;
  if (!apply) {
    return {
      planId: `dry-run-exercise-${latest.id}`,
      dayTemplateIds: circuits.map((_, index) => `dry-run-day-${index}`),
      dayCount: circuits.length,
      tag
    };
  }

  const existing = await prisma.exercisePlan.findFirst({ where: { description: tag } });
  const plan = existing
    ? await prisma.exercisePlan.update({
        where: { id: existing.id },
        data: {
          name: currentPlanTitle(displayName, 'workouts', dateLabel(latest)),
          visibility: Visibility.USER,
          createdById
        }
      })
    : await prisma.exercisePlan.create({
        data: {
          name: currentPlanTitle(displayName, 'workouts', dateLabel(latest)),
          description: tag,
          visibility: Visibility.USER,
          createdById
        }
      });
  if (existing) {
    await prisma.exerciseTemplate.deleteMany({ where: { planId: plan.id } });
  }

  const dayTemplateIds: string[] = [];
  for (const [index, circuit] of circuits.entries()) {
    const items = circuitItems(circuit);
    const itemCreates = [];
    for (const [itemIndex, item] of items.entries()) {
      const exerciseId = await getOrCreateExercise((item.name ?? '').trim(), (item.category ?? '').trim() || null, idMap);
      if (!exerciseId) continue;
      itemCreates.push(exerciseItemPayload(item, itemIndex, exerciseId));
    }
    const day = await prisma.exerciseTemplate.create({
      data: {
        name: (circuit.name ?? '').trim() || `Routine ${index + 1}`,
        description: (circuit.notes ?? '').trim() || null,
        visibility: Visibility.USER,
        createdById,
        planId: plan.id,
        dayIndex: circuit.circuitnum ?? index + 1,
        items: { create: itemCreates }
      }
    });
    dayTemplateIds.push(day.id);
  }

  return { planId: plan.id, dayTemplateIds, dayCount: circuits.length, tag };
}

interface LegacyBundle {
  usersByEmail: Map<string, LegacyRow>;
  usersById: Map<string, LegacyRow>;
  sessionsByUserId: Map<string, LegacyRow[]>;
  sessionOwnerById: Map<string, string>;
  nutritionBySessionId: Map<string, LegacyRow[]>;
  exerciseBySessionId: Map<string, LegacyRow[]>;
}

function pushGrouped(map: Map<string, LegacyRow[]>, key: string, row: LegacyRow) {
  const list = map.get(key);
  if (list) list.push(row);
  else map.set(key, [row]);
}

function loadLegacyBundle(emails: string[]): LegacyBundle {
  console.log('Reading legacy dump tables...');
  const usersByEmail = new Map<string, LegacyRow>();
  const usersById = new Map<string, LegacyRow>();
  for (const row of parseTable(DUMP_PATH, 'users')) {
    const email = (row.email ?? '').trim().toLowerCase();
    if (email && !usersByEmail.has(email)) usersByEmail.set(email, row);
    if (row.id != null) usersById.set(String(row.id), row);
  }
  const targetUserIds = new Set<string>();
  for (const email of emails) {
    const user = usersByEmail.get(email);
    if (user?.id != null) targetUserIds.add(String(user.id));
  }
  const sessionsByUserId = new Map<string, LegacyRow[]>();
  const sessionOwnerById = new Map<string, string>();
  const targetSessionIds = new Set<string>();
  for (const row of parseTable(DUMP_PATH, 'training_sessions', (session) => {
    const owner = String(session.owner_id ?? '');
    const id = session.id != null ? String(session.id) : '';
    if (id) sessionOwnerById.set(id, owner);
    return targetUserIds.has(owner);
  })) {
    const owner = String(row.owner_id ?? '');
    const id = row.id != null ? String(row.id) : '';
    pushGrouped(sessionsByUserId, owner, row);
    if (id) targetSessionIds.add(id);
  }
  const keepProgram = (row: LegacyRow) => {
    const owner = String(row.owner_id ?? '');
    return targetSessionIds.has(owner) || targetUserIds.has(owner);
  };
  const nutritionBySessionId = new Map<string, LegacyRow[]>();
  for (const row of parseTable(DUMP_PATH, 'nutritionPrograms', keepProgram)) {
    pushGrouped(nutritionBySessionId, String(row.owner_id ?? ''), row);
  }
  const exerciseBySessionId = new Map<string, LegacyRow[]>();
  for (const row of parseTable(DUMP_PATH, 'exercisePrograms', keepProgram)) {
    pushGrouped(exerciseBySessionId, String(row.owner_id ?? ''), row);
  }
  return { usersByEmail, usersById, sessionsByUserId, sessionOwnerById, nutritionBySessionId, exerciseBySessionId };
}

function rowsForSessions(index: Map<string, LegacyRow[]>, sessionIds: Iterable<string>): LegacyRow[] {
  const rows: LegacyRow[] = [];
  for (const id of sessionIds) {
    const linked = index.get(id);
    if (linked) rows.push(...linked);
  }
  return rows;
}

function latestProgram(rows: LegacyRow[], sessionById: Map<string, SessionMetrics>): LegacyRow | undefined {
  return [...rows]
    .sort((a, b) => {
      const sessionA = sessionById.get(String(a.owner_id));
      const sessionB = sessionById.get(String(b.owner_id));
      return (sessionA?.sessionNumber ?? 0) - (sessionB?.sessionNumber ?? 0);
    })
    .at(-1);
}

function programHasMeals(row: LegacyRow): boolean {
  return parseMeals(row.meals).some((meal) => mealItems(meal).length > 0);
}

function programHasExercises(row: LegacyRow): boolean {
  return parseCircuits(row.circuits).some((circuit) => circuitItems(circuit).length > 0);
}

function describePrograms(rows: LegacyRow[], sessionById: Map<string, SessionMetrics>): string[] {
  return [...rows]
    .sort((a, b) => {
      const sessionA = sessionById.get(String(a.owner_id));
      const sessionB = sessionById.get(String(b.owner_id));
      return (sessionA?.date.getTime() ?? 0) - (sessionB?.date.getTime() ?? 0);
    })
    .map((row) => {
      const session = sessionById.get(String(row.owner_id));
      const number = session ? ` #${session.sessionNumber}` : '';
      return `  #${row.id} ${dateLabel(row)} session ${row.owner_id}${number}`;
    });
}

async function importOne(email: string, args: ImportArgs, bundle: LegacyBundle, idMap: IdMap): Promise<void> {
  const legacyUser = bundle.usersByEmail.get(email);
  if (!legacyUser) throw new Error(`No legacy user found for ${email}`);

  const userId = String(legacyUser.id);
  const displayName = displayNameFromLegacy(legacyUser.name, email);
  const coachIdLegacy = legacyUser.owner_id && legacyUser.owner_id !== '0' ? String(legacyUser.owner_id) : null;
  const legacyCoach = coachIdLegacy ? bundle.usersById.get(coachIdLegacy) ?? null : null;

  const rawSessionRows = bundle.sessionsByUserId.get(userId) ?? [];
  const rawSessionIds = new Set(rawSessionRows.map((row) => String(row.id)));
  const rawSessions = rawSessionRows.map(toMetrics).filter((row): row is SessionMetrics => Boolean(row));
  const sessions = dedupeByDay(rawSessions);
  const droppedSameDay = rawSessions.length - sessions.length;
  const sessionById = new Map(sessions.map((session) => [session.legacySessionId, session]));

  const nutritionRows = rowsForSessions(bundle.nutritionBySessionId, sessionById.keys());
  const exerciseRows = rowsForSessions(bundle.exerciseBySessionId, sessionById.keys());
  const latestNutrition = latestProgram(nutritionRows, sessionById);
  const latestExercise = latestProgram(exerciseRows, sessionById);
  const mealTitle = latestNutrition ? currentPlanTitle(displayName, 'meals', dateLabel(latestNutrition)) : null;
  const workoutTitle = latestExercise ? currentPlanTitle(displayName, 'workouts', dateLabel(latestExercise)) : null;

  const foreign = foreignSessionPrograms({
    userId,
    ownSessionIds: rawSessionIds,
    candidates: [
      ...(bundle.nutritionBySessionId.get(userId) ?? []).map((row) => ({
        kind: 'nutrition' as const,
        id: String(row.id),
        date: row.date ?? '',
        ownerId: String(row.owner_id ?? '')
      })),
      ...(bundle.exerciseBySessionId.get(userId) ?? []).map((row) => ({
        kind: 'exercise' as const,
        id: String(row.id),
        date: row.date ?? '',
        ownerId: String(row.owner_id ?? '')
      }))
    ],
    sessionOwnerById: bundle.sessionOwnerById
  });

  console.log(`\n== ${email} ==`);
  console.log(`Legacy user #${userId} ${displayName} (${legacyUser.email})`);
  console.log(`Coach: ${legacyCoach ? `${legacyCoach.name} <${legacyCoach.email}> (legacy owner_id ${coachIdLegacy})` : 'none'}`);
  console.log(`Sessions: ${sessions.length} kept, ${droppedSameDay} same-day duplicates removed`);
  for (const session of sessions) {
    console.log(`  #${session.sessionNumber} ${dateKey(session.date)}`);
  }
  console.log(`Nutrition programs: ${nutritionRows.length} session-linked kept (${nutritionRows.filter(programHasMeals).length} with meals)`);
  for (const line of describePrograms(nutritionRows, sessionById)) console.log(line);
  console.log(`Exercise programs: ${exerciseRows.length} session-linked kept (${exerciseRows.filter(programHasExercises).length} with exercises)`);
  for (const line of describePrograms(exerciseRows, sessionById)) console.log(line);
  console.log(`Current meal plan title: ${mealTitle ?? 'none'}`);
  console.log(`Current workout plan title: ${workoutTitle ?? 'none'}`);
  for (const note of foreign) {
    const owner = bundle.usersById.get(note.sessionOwnerUserId);
    const who = owner ? `${note.sessionOwnerUserId} ${owner.name} <${owner.email}>` : note.sessionOwnerUserId;
    console.log(`Stored as-is: ${note.kind} #${note.id} (${note.date}) stays on training session ${note.ownerId} for legacy user ${who}. Not copied onto this account.`);
  }
  if (latestNutrition) {
    const meals = parseMeals(latestNutrition.meals);
    console.log(`Latest meals ${latestNutrition.date}: ${meals.map((meal) => meal.name).join(', ')}`);
  }
  if (latestExercise) {
    const circuits = parseCircuits(latestExercise.circuits);
    console.log(`Latest workouts ${latestExercise.date}: ${circuits.map((circuit) => circuit.name || 'Untitled').join(', ')}`);
  }

  if (!args.apply) {
    console.log(await describeAccountAction(email));
  }

  const firebaseUid = await importFirebaseLogin(legacyUser, args.apply);

  if (!args.apply) {
    console.log('No changes written (dry-run).');
    return;
  }

  if (args.authOnly) {
    const existing = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } }
    });
    if (!existing) throw new Error(`No local user found for ${email}. Run a full --apply first.`);
    if (firebaseUid && existing.firebaseUid !== firebaseUid) {
      await prisma.user.update({ where: { id: existing.id }, data: { firebaseUid } });
      console.log(`Linked ${email} to Firebase UID ${firebaseUid}`);
    }
    return;
  }

  const coach = legacyCoach ? await upsertPerson(legacyCoach, Role.COACH, true) : null;
  const user = await upsertPerson(legacyUser, Role.USER, true);
  if (firebaseUid && user.firebaseUid !== firebaseUid) {
    await prisma.user.update({ where: { id: user.id }, data: { firebaseUid } });
    user.firebaseUid = firebaseUid;
  }
  idMap.users[String(legacyUser.id)] = user.id;
  if (coach && legacyCoach) idMap.coaches[String(legacyCoach.id)] = coach.id;

  const profile = {
    addressLine1: cleanText(legacyUser.addr_line_1),
    addressLine2: cleanText(legacyUser.addr_line_2),
    city: cleanText(legacyUser.city),
    state: cleanText(legacyUser.state),
    zip: cleanText(legacyUser.zip),
    emergencyContactName: cleanText(legacyUser.ec_name),
    emergencyContactPhone: cleanText(legacyUser.ec_phone),
    emergencyContactRelationship: cleanText(legacyUser.ec_relationship),
    medicalConditions: cleanText(legacyUser.med_cond),
    exerciseConditions: cleanText(legacyUser.exer_cond),
    foodConditions: cleanText(legacyUser.food_cond),
    dietNotes: cleanText(legacyUser.diet_cond),
    coachNotes: cleanText(legacyUser.notes),
    heightInches: parseHeightInches(legacyUser.height),
    heightRaw: cleanText(legacyUser.height),
    targetBodyFat: num(cleanText(legacyUser.target_bf)),
    targetMeasurement: num(cleanText(legacyUser.target_mg))
  };
  await prisma.clientProfile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...profile },
    update: profile
  });
  if (coach) await upsertCoachAssignment(coach.id, user.id);

  const first = sessions[0];
  const last = sessions.at(-1);
  const startDate = first?.date ?? new Date();
  const existingProgram = await prisma.program.findFirst({ where: { userId: user.id, name: 'Legacy Program' } });
  const program = existingProgram
    ? await prisma.program.update({
        where: { id: existingProgram.id },
        data: { startDate, coachId: coach?.id ?? null, status: ProgramStatus.ACTIVE, mode: ProgramMode.COACHED }
      })
    : await prisma.program.create({
        data: {
          userId: user.id,
          name: 'Legacy Program',
          status: ProgramStatus.ACTIVE,
          mode: ProgramMode.COACHED,
          startDate,
          coachId: coach?.id ?? null
        }
      });
  idMap.programs[String(legacyUser.id)] = program.id;

  const targetBf = numPositive(legacyUser.target_bf);
  for (const def of ENUM_METRICS) {
    const start = firstNonNull(sessions, def.pick);
    if (start === null) continue;
    const current = lastNonNull(sessions, def.pick) ?? start;
    let goal = current;
    if (def.type === MetricType.BODY_FAT && targetBf != null) goal = targetBf;
    await prisma.programMetric.upsert({
      where: { programId_metricType: { programId: program.id, metricType: def.type } },
      create: { programId: program.id, metricType: def.type, startValue: start, currentValue: current, goalValue: goal, unit: def.unit },
      update: { startValue: start, currentValue: current, goalValue: goal, unit: def.unit }
    });
  }

  let snapshots = 0;
  for (const session of sessions) {
    const values = ENUM_METRICS
      .map((def) => ({ metricType: def.type, currentValue: def.pick(session), unit: def.unit }))
      .filter((value): value is { metricType: MetricType; currentValue: number; unit: string } => value.currentValue !== null);
    if (!values.length) continue;
    const snapshot = await prisma.programMetricSnapshot.upsert({
      where: { programId_date: { programId: program.id, date: session.date } },
      create: { programId: program.id, date: session.date },
      update: {}
    });
    await prisma.programMetricSnapshotValue.deleteMany({ where: { snapshotId: snapshot.id } });
    await prisma.programMetricSnapshotValue.createMany({
      data: values.map((value) => ({ snapshotId: snapshot.id, metricType: value.metricType, currentValue: value.currentValue, unit: value.unit }))
    });
    snapshots += 1;
  }

  await prisma.progressSnapshot.deleteMany({ where: { userId: user.id, notes: { startsWith: 'legacy:' } } });
  let progressSnapshots = 0;
  for (const session of sessions) {
    const measurements: Record<string, number> = {};
    const add = (key: string, value: number | null) => {
      if (value !== null) measurements[key] = value;
    };
    add('bodyFat', session.bodyFat);
    add('waist', session.waist);
    add('hips', session.hips);
    add('chest', session.chest);
    add('neck', session.neck);
    add('arm', session.arm);
    add('bicep', session.bicep);
    add('thigh', session.thigh);
    add('calf', session.calf);
    add('forearm', session.forearm);
    if (session.weight === null && !Object.keys(measurements).length) continue;
    await prisma.progressSnapshot.create({
      data: {
        userId: user.id,
        programId: program.id,
        snapshotDate: session.date,
        weight: session.weight,
        measurements: Object.keys(measurements).length ? measurements : undefined,
        completionStatus: 'COMPLETE',
        completedAt: session.date,
        notes: LEGACY_SESSION_NOTE
      }
    });
    progressSnapshots += 1;
  }

  const byDay = new Map<string, { date: Date; nutrition?: LegacyRow; exercise?: LegacyRow; sessionNumber: number }>();
  const attach = (row: LegacyRow, kind: 'nutrition' | 'exercise') => {
    const session = sessionById.get(String(row.owner_id));
    if (!session) return;
    const key = dateKey(session.date);
    const existing = byDay.get(key);
    if (existing && existing.sessionNumber > session.sessionNumber) return;
    const day = existing ?? { date: session.date, sessionNumber: session.sessionNumber };
    day.sessionNumber = session.sessionNumber;
    day[kind] = row;
    byDay.set(key, day);
  };
  for (const row of nutritionRows) attach(row, 'nutrition');
  for (const row of exerciseRows) attach(row, 'exercise');

  let dailyLogs = 0;
  let mealsCreated = 0;
  let exercisesCreated = 0;
  for (const plan of [...byDay.values()].sort((a, b) => a.date.getTime() - b.date.getTime())) {
    const existing = await prisma.dailyLog.findUnique({
      where: { userId_date: { userId: user.id, date: plan.date } },
      select: { id: true, notes: true }
    });
    if (existing && !existing.notes?.startsWith('legacy:') && !args.force) continue;
    if (existing && existing.notes?.startsWith('legacy:') && !args.force) {
      dailyLogs += 1;
      continue;
    }

    const meals = plan.nutrition ? parseMeals(plan.nutrition.meals) : [];
    const mealPayloads = [];
    let dayCalories = 0;
    let dayProtein = 0;
    let dayCarbs = 0;
    let dayFat = 0;
    for (const [idx, meal] of meals.entries()) {
      const items = mealItems(meal);
      if (!items.length) continue;
      let calories = 0;
      let protein = 0;
      let carbs = 0;
      let fat = 0;
      const itemCreates = [];
      for (const item of items) {
        const name = (item.name ?? '').trim();
        const foodId = await getOrCreateFood(name, item, idMap);
        calories += toNumber(item.calories);
        protein += toNumber(item.proteins);
        carbs += toNumber(item.carbs);
        fat += toNumber(item.fats);
        itemCreates.push({
          foodId,
          type: MealItemType.PLANNED,
          nameSnapshot: name,
          quantity: parseQuantity(item.mulipiler),
          unit: (item.portion_name ?? 'serving').trim() || 'serving',
          calories: toNumber(item.calories),
          protein: toNumber(item.proteins),
          carbs: toNumber(item.carbs),
          fat: toNumber(item.fats)
        });
      }
      dayCalories += calories;
      dayProtein += protein;
      dayCarbs += carbs;
      dayFat += fat;
      mealPayloads.push({
        userId: user.id,
        mealNumber: meal.mealnum ?? idx + 1,
        name: (meal.name ?? '').trim() || `Meal ${meal.mealnum ?? idx + 1}`,
        plannedTime: mealPlannedTime(meal),
        status: MealStatus.PLANNED,
        plannedCalories: calories,
        plannedProtein: protein,
        plannedCarbs: carbs,
        plannedFat: fat,
        items: { create: itemCreates }
      });
    }

    const circuits = plan.exercise ? parseCircuits(plan.exercise.circuits) : [];
    const scheduled = [];
    let sortOrder = 0;
    for (const circuit of circuits) {
      for (const item of circuitItems(circuit)) {
        const exerciseId = await getOrCreateExercise((item.name ?? '').trim(), (item.category ?? '').trim() || null, idMap);
        if (!exerciseId) continue;
        scheduled.push({
          programId: program.id,
          userId: user.id,
          scheduledDate: plan.date,
          status: ExerciseStatus.PLANNED,
          ...exerciseItemPayload(item, sortOrder++, exerciseId)
        });
      }
    }

    if (existing) {
      await prisma.meal.deleteMany({ where: { dailyLogId: existing.id } });
      await prisma.scheduledExercise.deleteMany({ where: { programId: program.id, scheduledDate: plan.date } });
      await prisma.dailyLog.update({
        where: { id: existing.id },
        data: {
          calorieTarget: Math.round(dayCalories),
          proteinTarget: Math.round(dayProtein),
          carbTarget: Math.round(dayCarbs),
          fatTarget: Math.round(dayFat),
          waterTargetOz: (plan.nutrition ? parseWaterOz(plan.nutrition.water_intake) : null) ?? 64,
          mealsPlanned: mealPayloads.length,
          exercisesPlanned: scheduled.length,
          mealsInitializedAt: new Date(),
          exercisesInitializedAt: new Date(),
          exercisesManuallyEdited: true,
          notes: LEGACY_DAY_NOTE
        }
      });
      for (const meal of mealPayloads) {
        await prisma.meal.create({ data: { dailyLogId: existing.id, ...meal } });
      }
      if (scheduled.length) await prisma.scheduledExercise.createMany({ data: scheduled });
    } else {
      await prisma.dailyLog.create({
        data: {
          programId: program.id,
          userId: user.id,
          date: plan.date,
          calorieTarget: Math.round(dayCalories),
          proteinTarget: Math.round(dayProtein),
          carbTarget: Math.round(dayCarbs),
          fatTarget: Math.round(dayFat),
          waterTargetOz: (plan.nutrition ? parseWaterOz(plan.nutrition.water_intake) : null) ?? 64,
          mealsPlanned: mealPayloads.length,
          exercisesPlanned: scheduled.length,
          mealsInitializedAt: new Date(),
          exercisesInitializedAt: new Date(),
          exercisesManuallyEdited: true,
          notes: LEGACY_DAY_NOTE,
          meals: { create: mealPayloads }
        }
      });
      if (scheduled.length) await prisma.scheduledExercise.createMany({ data: scheduled });
    }
    dailyLogs += 1;
    mealsCreated += mealPayloads.length;
    exercisesCreated += scheduled.length;
  }

  const nutritionTemplate = latestNutrition
    ? await importCurrentNutritionTemplate(latestNutrition, coach?.id ?? user.id, true, displayName)
    : null;
  const exercisePlan = latestExercise
    ? await importCurrentExercisePlan(latestExercise, coach?.id ?? user.id, idMap, true, displayName)
    : null;

  if (nutritionTemplate?.waterTargetOz) {
    await prisma.user.update({ where: { id: user.id }, data: { waterGoalOz: nutritionTemplate.waterTargetOz } });
  }
  if (nutritionTemplate) {
    await prisma.programMetric.upsert({
      where: { programId_metricType: { programId: program.id, metricType: MetricType.CALORIES } },
      create: {
        programId: program.id,
        metricType: MetricType.CALORIES,
        startValue: Math.round(nutritionTemplate.totals.calories),
        currentValue: Math.round(nutritionTemplate.totals.calories),
        goalValue: Math.round(nutritionTemplate.totals.calories),
        unit: 'kcal'
      },
      update: {
        currentValue: Math.round(nutritionTemplate.totals.calories),
        goalValue: Math.round(nutritionTemplate.totals.calories)
      }
    });
    await prisma.programMetric.upsert({
      where: { programId_metricType: { programId: program.id, metricType: MetricType.PROTEIN } },
      create: {
        programId: program.id,
        metricType: MetricType.PROTEIN,
        startValue: Math.round(nutritionTemplate.totals.protein),
        currentValue: Math.round(nutritionTemplate.totals.protein),
        goalValue: Math.round(nutritionTemplate.totals.protein),
        unit: 'g'
      },
      update: {
        currentValue: Math.round(nutritionTemplate.totals.protein),
        goalValue: Math.round(nutritionTemplate.totals.protein)
      }
    });
    await prisma.program.update({
      where: { id: program.id },
      data: {
        defaultNutritionTemplateId: nutritionTemplate.id,
        defaultExerciseTemplateId: exercisePlan?.dayTemplateIds[0] ?? undefined,
        pinnedCalorieTarget: Math.round(nutritionTemplate.totals.calories),
        pinnedProteinTarget: Math.round(nutritionTemplate.totals.protein),
        pinnedCarbTarget: Math.round(nutritionTemplate.totals.carbs),
        pinnedFatTarget: Math.round(nutritionTemplate.totals.fat)
      }
    });
  }

  if (exercisePlan) {
    const routine = await prisma.exerciseRoutine.upsert({
      where: { programId: program.id },
      create: { programId: program.id, userId: user.id, exercisePlanId: exercisePlan.planId },
      update: { exercisePlanId: exercisePlan.planId }
    });
    await prisma.exerciseRoutineDay.deleteMany({ where: { routineId: routine.id } });
    for (let weekday = 0; weekday < 7; weekday += 1) {
      await prisma.exerciseRoutineDay.create({
        data: {
          routineId: routine.id,
          weekday,
          templateId: exercisePlan.dayTemplateIds[weekday] ?? null
        }
      });
    }
  }

  const latestDate = last?.date ?? new Date();
  await prisma.planPeriod.upsert({
    where: { programId_effectiveDate: { programId: program.id, effectiveDate: latestDate } },
    create: {
      programId: program.id,
      effectiveDate: latestDate,
      weekNumber: last?.sessionNumber ?? sessions.length,
      calorieTarget: nutritionTemplate ? Math.round(nutritionTemplate.totals.calories) : null,
      proteinTarget: nutritionTemplate ? Math.round(nutritionTemplate.totals.protein) : null,
      carbTarget: nutritionTemplate ? Math.round(nutritionTemplate.totals.carbs) : null,
      fatTarget: nutritionTemplate ? Math.round(nutritionTemplate.totals.fat) : null,
      nutritionTemplateId: nutritionTemplate?.id ?? null,
      exerciseTemplateId: exercisePlan?.dayTemplateIds[0] ?? null,
      notes: 'Imported from latest legacy weekly session',
      createdById: coach?.id ?? user.id
    },
    update: {
      weekNumber: last?.sessionNumber ?? sessions.length,
      calorieTarget: nutritionTemplate ? Math.round(nutritionTemplate.totals.calories) : null,
      proteinTarget: nutritionTemplate ? Math.round(nutritionTemplate.totals.protein) : null,
      carbTarget: nutritionTemplate ? Math.round(nutritionTemplate.totals.carbs) : null,
      fatTarget: nutritionTemplate ? Math.round(nutritionTemplate.totals.fat) : null,
      nutritionTemplateId: nutritionTemplate?.id ?? null,
      exerciseTemplateId: exercisePlan?.dayTemplateIds[0] ?? null
    }
  });

  saveIdMap(idMap);
  console.log('\nImported:');
  console.log(`  User ${user.id}  coach ${coach?.id ?? 'none'}`);
  console.log(`  Program ${program.id}`);
  console.log(`  Metric snapshots: ${snapshots}  progress snapshots: ${progressSnapshots}`);
  console.log(`  Historical daily logs: ${dailyLogs}  meals: ${mealsCreated}  scheduled exercises: ${exercisesCreated}`);
  console.log(`  Current nutrition template: ${nutritionTemplate?.id ?? 'none'} (${nutritionTemplate?.mealCount ?? 0} meals, ${Math.round(nutritionTemplate?.totals.calories ?? 0)} kcal)`);
  console.log(`  Current meal plan title: ${mealTitle ?? 'none'}`);
  console.log(`  Current exercise plan: ${exercisePlan?.planId ?? 'none'} (${exercisePlan?.dayCount ?? 0} days)`);
  console.log(`  Current workout plan title: ${workoutTitle ?? 'none'}`);
}

async function main(): Promise<void> {
  const args = parseImportArgs(process.argv.slice(2));
  const idMap = loadIdMap();
  console.log(`${args.apply ? 'APPLY' : 'DRY RUN'} import for ${args.emails.length} user(s): ${args.emails.join(', ')}`);
  console.log(`Dump: ${DUMP_PATH}`);
  const bundle = loadLegacyBundle(args.emails);
  for (const email of args.emails) {
    await importOne(email, args, bundle, idMap);
  }
  if (!args.apply) {
    console.log('\nNo changes written (dry-run). Re-run with --apply to import.');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
