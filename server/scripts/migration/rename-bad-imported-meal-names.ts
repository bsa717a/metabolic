/**
 * Rename imported meal names that are a height or a clock time.
 *
 * Dry-run by default. Nothing is written unless --apply is passed.
 * Covers mmv1 nutrition template meals and daily meals for migrated clients,
 * including days the app copied forward from an imported plan.
 * Template meals are reported on the client whose program or plan period
 * uses the template, not on the coach who created it.
 *
 *   cd server && npx tsx --env-file=.env scripts/migration/rename-bad-imported-meal-names.ts
 *   cd server && npx tsx --env-file=.env scripts/migration/rename-bad-imported-meal-names.ts --apply
 *
 * --apply writes to whatever DATABASE_URL points at. Do not pass it against
 * production until the dry-run list has been reviewed.
 */
import { prisma } from '../../src/db/prisma.js';
import { toDateKey } from '../../src/utils/dates.js';
import { describeMealRename, renameImportedMeal, templateClientIds, uniqueMealNamesForDay } from './legacyMealNames.js';

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

type Slot = {
  kind: 'template' | 'daily';
  id: string;
  owners: string[];
  from: string;
  to: string;
  currentTime: string | null;
  nextTime: string | null;
  date: string | null;
  mealNumber: number;
  group: string;
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
        { programs: { some: { defaultNutritionTemplate: { description: { startsWith: 'mmv1:' } } } } },
        { programs: { some: { planPeriods: { some: { nutritionTemplate: { description: { startsWith: 'mmv1:' } } } } } } },
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
            { programs: { some: { userId: { in: userIds } } } },
            { planPeriods: { some: { program: { userId: { in: userIds } } } } }
          ]
        }
      },
      select: {
        id: true,
        name: true,
        mealNumber: true,
        plannedTime: true,
        templateId: true,
        template: {
          select: {
            programs: { where: { userId: { in: userIds } }, select: { userId: true } },
            planPeriods: {
              where: { program: { userId: { in: userIds } } },
              select: { program: { select: { userId: true } } }
            }
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

  const slots: Slot[] = [];

  for (const meal of templateMeals) {
    const currentTime = meal.plannedTime?.trim() || null;
    const next = renameImportedMeal(meal.name, meal.mealNumber, meal.plannedTime);
    const owners = templateClientIds({
      programUserIds: meal.template.programs.map((program) => program.userId),
      planPeriodUserIds: meal.template.planPeriods.map((period) => period.program.userId),
      clientIds: userIdSet
    });
    slots.push({
      kind: 'template',
      id: meal.id,
      owners,
      from: meal.name,
      to: next?.name ?? meal.name,
      currentTime,
      nextTime: next?.plannedTime ?? currentTime,
      date: null,
      mealNumber: meal.mealNumber,
      group: `template:${meal.templateId}`
    });
  }

  for (const meal of dailyMeals) {
    const currentTime = meal.plannedTime?.trim() || null;
    const next = renameImportedMeal(meal.name, meal.mealNumber, meal.plannedTime);
    const date = toDateKey(meal.dailyLog.date);
    slots.push({
      kind: 'daily',
      id: meal.id,
      owners: [meal.userId],
      from: meal.name,
      to: next?.name ?? meal.name,
      currentTime,
      nextTime: next?.plannedTime ?? currentTime,
      date,
      mealNumber: meal.mealNumber,
      group: `daily:${meal.userId}:${date}`
    });
  }

  const byGroup = new Map<string, Slot[]>();
  for (const slot of slots) {
    const list = byGroup.get(slot.group);
    if (list) list.push(slot);
    else byGroup.set(slot.group, [slot]);
  }
  for (const group of byGroup.values()) {
    if (!group.some((slot) => slot.to !== slot.from || slot.nextTime !== slot.currentTime)) continue;
    const unique = uniqueMealNamesForDay(
      group.map((slot) => ({ mealNumber: slot.mealNumber, name: slot.to, plannedTime: slot.nextTime }))
    );
    group.forEach((slot, index) => {
      slot.to = unique[index].name;
    });
  }

  const changes: Change[] = [];
  for (const slot of slots) {
    const movedTime = slot.nextTime && slot.nextTime !== slot.currentTime ? slot.nextTime : null;
    if (slot.to === slot.from && !movedTime) continue;
    for (const owner of slot.owners) {
      changes.push({
        kind: slot.kind,
        id: slot.id,
        userId: owner,
        from: slot.from,
        to: slot.to,
        plannedTime: movedTime,
        date: slot.date
      });
    }
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

  let dailyMeals = 0;
  const templateMealIds = new Set<string>();
  const allDays = new Set<string>();

  for (const client of affected) {
    const rows = byUser.get(client.id) ?? [];
    const templates = rows.filter((row) => row.kind === 'template');
    const daily = rows.filter((row) => row.kind === 'daily');
    const days = new Set(daily.map((row) => row.date).filter((date): date is string => Boolean(date)));
    for (const row of templates) templateMealIds.add(row.id);
    dailyMeals += daily.length;
    for (const day of days) allDays.add(`${client.id}:${day}`);

    const samples = new Map<string, number>();
    for (const row of rows) {
      const key = describeMealRename(row.from, row.to, row.plannedTime);
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
    `Totals: clients ${affected.length}, template meals ${templateMealIds.size}, daily meals ${dailyMeals}, days ${allDays.size}`
  );
}

async function applyChanges(changes: Change[]) {
  const seen = new Set<string>();
  const unique = changes.filter((change) => {
    const key = `${change.kind}:${change.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const chunkSize = 40;
  for (let index = 0; index < unique.length; index += chunkSize) {
    const chunk = unique.slice(index, index + chunkSize);
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
  console.log(`Wrote ${unique.length} meal names.`);
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
