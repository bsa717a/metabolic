/**
 * Rename imported meal names that are a height or a clock time.
 *
 * Dry-run by default. Nothing is written unless --apply is passed.
 * Covers mmv1 nutrition template meals and daily meals for migrated clients,
 * including days the app copied forward from an imported plan.
 *
 *   cd server && npx tsx --env-file=.env scripts/migration/rename-bad-imported-meal-names.ts
 *   cd server && npx tsx --env-file=.env scripts/migration/rename-bad-imported-meal-names.ts --apply
 *
 * --apply writes to whatever DATABASE_URL points at. Do not pass it against
 * production until the dry-run list has been reviewed.
 */
import { prisma } from '../../src/db/prisma.js';
import { toDateKey } from '../../src/utils/dates.js';
import { renameImportedMeal } from './legacyMealNames.js';

const apply = process.argv.includes('--apply');

type ClientRow = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
};

type Change = {
  kind: 'template' | 'daily';
  id: string;
  userId: string;
  from: string;
  to: string;
  plannedTime: string | null;
  date: string | null;
};

function safeError(error: unknown): string {
  if (!(error instanceof Error)) return 'database unreachable';
  const cleaned = error.message.replace(/postgres(?:ql)?:\/\/\S+/gi, 'postgresql://***');
  const line = cleaned.split('\n').map((part) => part.trim()).find(Boolean) ?? 'database unreachable';
  return line.slice(0, 240);
}

function clientLabel(client: ClientRow): string {
  const name = `${client.firstName} ${client.lastName}`.trim();
  return `${name} <${client.email}>`;
}

async function migratedClients(): Promise<ClientRow[]> {
  return prisma.user.findMany({
    where: {
      OR: [
        { dailyLogs: { some: { notes: { startsWith: 'legacy:' } } } },
        { progressSnapshots: { some: { notes: { startsWith: 'legacy:' } } } },
        { nutritionPlanTemplatesCreated: { some: { description: { startsWith: 'mmv1:' } } } },
        { programs: { some: { defaultNutritionTemplate: { description: { startsWith: 'mmv1:' } } } } },
        { firebaseUid: { startsWith: 'legacy-' } }
      ]
    },
    select: { id: true, email: true, firstName: true, lastName: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { email: 'asc' }]
  });
}

async function collectChanges(clients: ClientRow[]): Promise<Change[]> {
  const userIds = clients.map((client) => client.id);
  const userIdSet = new Set(userIds);
  if (!userIds.length) return [];

  const [templateMeals, dailyMeals] = await Promise.all([
    prisma.nutritionTemplateMeal.findMany({
      where: {
        template: {
          description: { startsWith: 'mmv1:' },
          OR: [
            { createdById: { in: userIds } },
            { programs: { some: { userId: { in: userIds } } } }
          ]
        }
      },
      select: {
        id: true,
        name: true,
        mealNumber: true,
        plannedTime: true,
        template: {
          select: {
            createdById: true,
            programs: { where: { userId: { in: userIds } }, select: { userId: true } }
          }
        }
      }
    }),
    prisma.meal.findMany({
      where: { userId: { in: userIds } },
      select: {
        id: true,
        userId: true,
        name: true,
        mealNumber: true,
        plannedTime: true,
        dailyLog: { select: { date: true } }
      }
    })
  ]);

  const changes: Change[] = [];

  for (const meal of templateMeals) {
    const next = renameImportedMeal(meal.name, meal.mealNumber, meal.plannedTime);
    if (!next) continue;
    const currentTime = meal.plannedTime?.trim() || null;
    const owner =
      meal.template.createdById && userIdSet.has(meal.template.createdById)
        ? meal.template.createdById
        : meal.template.programs[0]?.userId;
    if (!owner) continue;
    changes.push({
      kind: 'template',
      id: meal.id,
      userId: owner,
      from: meal.name,
      to: next.name,
      plannedTime: next.plannedTime && next.plannedTime !== currentTime ? next.plannedTime : null,
      date: null
    });
  }

  for (const meal of dailyMeals) {
    const next = renameImportedMeal(meal.name, meal.mealNumber, meal.plannedTime);
    if (!next) continue;
    const currentTime = meal.plannedTime?.trim() || null;
    changes.push({
      kind: 'daily',
      id: meal.id,
      userId: meal.userId,
      from: meal.name,
      to: next.name,
      plannedTime: next.plannedTime && next.plannedTime !== currentTime ? next.plannedTime : null,
      date: toDateKey(meal.dailyLog.date)
    });
  }

  return changes;
}

function printReport(clients: ClientRow[], changes: Change[]) {
  const byUser = new Map<string, Change[]>();
  for (const change of changes) {
    const list = byUser.get(change.userId);
    if (list) list.push(change);
    else byUser.set(change.userId, [change]);
  }

  const affected = clients.filter((client) => byUser.has(client.id));
  console.log(apply ? 'APPLY: renaming imported meal names' : 'Dry-run. No rows written. Pass --apply to rename.');
  console.log(`Migrated clients checked: ${clients.length}`);
  console.log(`Affected clients: ${affected.length}`);
  console.log('');

  let templateMeals = 0;
  let dailyMeals = 0;
  const allDays = new Set<string>();

  for (const client of affected) {
    const rows = byUser.get(client.id) ?? [];
    const templates = rows.filter((row) => row.kind === 'template');
    const daily = rows.filter((row) => row.kind === 'daily');
    const days = new Set(daily.map((row) => row.date).filter((date): date is string => Boolean(date)));
    templateMeals += templates.length;
    dailyMeals += daily.length;
    for (const day of days) allDays.add(`${client.id}:${day}`);

    const samples = new Map<string, number>();
    for (const row of rows) {
      const key = `${JSON.stringify(row.from)} → ${row.to}`;
      samples.set(key, (samples.get(key) ?? 0) + 1);
    }
    const sampleText = [...samples.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => `${label} (${count})`)
      .join('; ');

    console.log(clientLabel(client));
    console.log(`  template meals: ${templates.length}`);
    console.log(`  daily meals: ${daily.length}`);
    console.log(`  days: ${days.size}`);
    console.log(`  renames: ${sampleText}`);
    console.log('');
  }

  console.log(
    `Totals: clients ${affected.length}, template meals ${templateMeals}, daily meals ${dailyMeals}, days ${allDays.size}`
  );
}

async function applyChanges(changes: Change[]) {
  const chunkSize = 40;
  for (let index = 0; index < changes.length; index += chunkSize) {
    const chunk = changes.slice(index, index + chunkSize);
    await prisma.$transaction(
      chunk.map((change) => {
        const data = {
          name: change.to,
          ...(change.plannedTime ? { plannedTime: change.plannedTime } : {})
        };
        return change.kind === 'template'
          ? prisma.nutritionTemplateMeal.update({ where: { id: change.id }, data })
          : prisma.meal.update({ where: { id: change.id }, data });
      })
    );
  }
  console.log(`Wrote ${changes.length} meal names.`);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Dry-run did not query a database. No counts.');
    process.exitCode = 1;
    return;
  }

  const clients = await migratedClients();
  const changes = await collectChanges(clients);
  printReport(clients, changes);
  if (apply) await applyChanges(changes);
}

main()
  .catch((error: unknown) => {
    console.error(`Rename dry-run failed: ${safeError(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
