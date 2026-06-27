/**
 * Run proactive SMS reminder tick locally (pre-meal nudges + evening recap).
 *
 *   cd server && npx tsx --env-file=.env scripts/sms-reminder-tick.ts
 *   cd server && npx tsx --env-file=.env scripts/sms-reminder-tick.ts --debug
 *
 * Dev helpers (same DB as .env):
 *   ... --user Derek --meal Breakfast --minutes-from-now 5
 *   ... --user you@email.com --meal 1 --at 07:35
 */
import { prisma } from '../src/db/prisma.js';
import { getTodayDashboard } from '../src/services/dashboardService.js';
import { isMealReminderDue, runSmsReminderTick } from '../src/services/smsReminderService.js';
import { localTimeParts } from '../src/utils/dates.js';
import { COMPLETED_MEAL_STATUSES, normalizePlannedTimeStorage, parsePlannedMinutes } from '../src/utils/meals.js';
import { isTwilioSenderPhone } from '../src/services/twilioOutboundService.js';

function readArg(flag: string): string | undefined {
  const prefix = `${flag}=`;
  const eq = process.argv.find((arg) => arg.startsWith(prefix));
  if (eq) return eq.slice(prefix.length);
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith('--')) {
    return process.argv[idx + 1];
  }
  return undefined;
}

async function patchMealTimeForTest() {
  const userQuery = readArg('--user');
  const mealQuery = readArg('--meal');
  const at = readArg('--at');
  const minutesFromNow = readArg('--minutes-from-now');
  if (!userQuery || !mealQuery || (!at && !minutesFromNow)) return false;

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: { equals: userQuery, mode: 'insensitive' } },
        { firstName: { equals: userQuery, mode: 'insensitive' } }
      ]
    },
    select: { id: true, firstName: true, timezone: true }
  });
  if (!user) throw new Error(`User not found: ${userQuery}`);

  const timezone = user.timezone?.trim() || 'UTC';
  const parts = localTimeParts(timezone);
  const dashboard = await getTodayDashboard(user.id, parts.dateKey);
  if (!dashboard.program) throw new Error(`${user.firstName} has no active program`);

  const mealNumber = Number(mealQuery);
  const meal = dashboard.allMeals.find(
    (candidate) =>
      (!Number.isNaN(mealNumber) && candidate.mealNumber === mealNumber) ||
      candidate.name.toLowerCase() === mealQuery.toLowerCase()
  );
  if (!meal) throw new Error(`Meal not found for ${user.firstName}: ${mealQuery}`);

  let plannedTime: string;
  if (minutesFromNow) {
    const offset = Number(minutesFromNow);
    if (!Number.isFinite(offset) || offset < 0) throw new Error('--minutes-from-now must be a non-negative number');
    const totalMinutes = parts.minutesOfDay + offset;
    const hour = Math.floor(totalMinutes / 60) % 24;
    const minute = totalMinutes % 60;
    plannedTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  } else {
    const normalized = normalizePlannedTimeStorage(at!);
    if (!normalized) throw new Error(`Invalid --at time: ${at}`);
    plannedTime = normalized;
  }

  await prisma.meal.update({ where: { id: meal.id }, data: { plannedTime } });
  await prisma.smsNudgeLog.deleteMany({
    where: { userId: user.id, kind: 'MEAL_REMINDER', date: parts.dateKey, refId: meal.id }
  });

  console.log(`Updated ${user.firstName} "${meal.name}" plannedTime -> ${plannedTime} on ${parts.dateKey}`);
  return true;
}

async function printDebug() {
  const now = new Date();
  const users = await prisma.user.findMany({
    where: {
      phone: { not: null },
      timezone: { not: null },
      smsOptedOut: false,
      smsRemindersEnabled: true,
      status: 'ACTIVE'
    },
    select: { id: true, phone: true, timezone: true, firstName: true }
  });

  for (const user of users) {
    const phone = user.phone?.trim();
    const timezone = user.timezone?.trim();
    if (!phone || !timezone) continue;
    if (isTwilioSenderPhone(phone)) {
      console.log(`[skip] ${user.firstName}: phone matches Twilio sender`);
      continue;
    }

    const parts = localTimeParts(timezone, now);
    console.log(
      `\n${user.firstName} (${timezone}) local ${parts.dateKey} ${parts.hour}:${String(parts.minute).padStart(2, '0')} (${parts.minutesOfDay} min)`
    );

    const dashboard = await getTodayDashboard(user.id, parts.dateKey);
    if (!dashboard.program) {
      console.log('  no active program');
      continue;
    }

    for (const meal of dashboard.allMeals) {
      const mealMinutes = parsePlannedMinutes(meal.plannedTime);
      const minutesUntil = mealMinutes == null ? null : mealMinutes - parts.minutesOfDay;
      const timing =
        minutesUntil == null
          ? ''
          : minutesUntil > 0
            ? `, ${minutesUntil} min until`
            : minutesUntil === 0
              ? ', now'
              : `, ${Math.abs(minutesUntil)} min ago`;

      const due = isMealReminderDue(parts.minutesOfDay, meal.plannedTime);
      const completed = COMPLETED_MEAL_STATUSES.has(meal.status);
      const nudge = await prisma.smsNudgeLog.findFirst({
        where: { userId: user.id, kind: 'MEAL_REMINDER', date: parts.dateKey, refId: meal.id }
      });
      let reason = due && !completed && !nudge ? 'would send' : 'skip';
      if (completed) reason = 'skip (meal completed)';
      else if (nudge) reason = 'skip (already nudged today)';
      else if (meal.plannedTime && mealMinutes == null) {
        reason = 'skip (unrecognized planned time format)';
      } else if (!due) reason = 'skip (outside 0–30 min window)';
      console.log(`  ${meal.name} @ ${meal.plannedTime ?? '—'}${timing} — ${reason}`);
    }
  }
}

async function main() {
  if (await patchMealTimeForTest()) {
    console.log('');
  }

  if (process.argv.includes('--debug')) {
    await printDebug();
  }

  const result = await runSmsReminderTick();
  console.log(JSON.stringify(result, null, 2));

  if (result.sent === 0 && process.argv.includes('--debug')) {
    const recentFailures = await prisma.smsMessage.findMany({
      where: {
        intent: 'MEAL_REMINDER',
        status: 'FAILED',
        createdAt: { gte: new Date(Date.now() - 60_000) }
      },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { response: true, phone: true, createdAt: true }
    });
    for (const failure of recentFailures) {
      console.error(`delivery failed -> ${failure.phone}: ${failure.response}`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
