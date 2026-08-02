import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { getTodayDashboard } from './dashboardService.js';
import { capSms } from './smsIntentService.js';
import { isTwilioConfigured, isTwilioSenderPhone, resolveOutboundChannel, sendOutboundMessage } from './twilioOutboundService.js';
import { localTimeParts } from '../utils/dates.js';
import { foodEmoji } from '../utils/foodEmoji.js';
import { COMPLETED_MEAL_STATUSES, parsePlannedMinutes } from '../utils/meals.js';
import { n } from '../utils/numbers.js';

/** Send once while the meal is 0–30 minutes away (scheduler runs every 5 min). */
const REMIND_WINDOW_MAX = 30;
const RECAP_HOUR = 20;
const RECAP_WINDOW_MINUTES = 30;

type ReminderUser = {
  id: string;
  phone: string | null;
  timezone: string | null;
  firstName: string;
  smsMealRemindersEnabled: boolean;
  smsEveningRecapEnabled: boolean;
};

type PlannedMealItem = {
  type: string;
  nameSnapshot: string;
  quantity: unknown;
  unit: string;
};

type MealReminderCandidate = {
  id: string;
  name: string;
  status: string;
  plannedTime: string | null;
  items: PlannedMealItem[];
};

export function isMealReminderDue(minutesOfDay: number, plannedTime: string | null): boolean {
  const mealMinutes = parsePlannedMinutes(plannedTime);
  if (mealMinutes == null) return false;
  const minutesUntil = mealMinutes - minutesOfDay;
  return minutesUntil >= 0 && minutesUntil <= REMIND_WINDOW_MAX;
}

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

type NudgeKind = 'MEAL_REMINDER' | 'EVENING_RECAP' | 'GUIDED_DISCOVERY_PROMPT';

/** Reserves a nudge via the unique constraint. Returns false if it was already sent. */
async function reserveNudge(userId: string, kind: NudgeKind, date: string, refId: string) {
  try {
    await prisma.smsNudgeLog.create({ data: { userId, kind, date, refId } });
    return true;
  } catch (error) {
    if (isUniqueViolation(error)) return false;
    throw error;
  }
}

/** Releases a reservation so a later tick can retry (used when delivery fails). */
async function releaseNudge(userId: string, kind: NudgeKind, date: string, refId: string) {
  await prisma.smsNudgeLog.deleteMany({ where: { userId, kind, date, refId } });
}

async function deliverNudge(userId: string, phone: string, message: string, intent: string) {
  const outbound = await prisma.smsMessage.create({
    data: { phone, userId, direction: 'OUTBOUND', message, response: message, intent, status: 'PROCESSED' }
  });
  try {
    await sendOutboundMessage(phone, message, resolveOutboundChannel(phone));
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Could not send text message.';
    await prisma.smsMessage.update({ where: { id: outbound.id }, data: { status: 'FAILED', response: detail } });
    return false;
  }
  return true;
}

function formatPlannedItemLine(item: PlannedMealItem): string | null {
  if (item.type !== 'PLANNED') return null;
  const name = item.nameSnapshot.trim();
  if (!name) return null;
  const icon = foodEmoji(name);
  const qty = n(item.quantity);
  const unit = item.unit?.trim();
  if (qty > 0 && unit) {
    const qtyLabel = Number.isInteger(qty) ? String(Math.round(qty)) : String(qty);
    return `${icon} ${qtyLabel} ${unit} ${name}`;
  }
  return `${icon} ${name}`;
}

export function buildMealReminder(
  firstName: string,
  mealName: string,
  plannedTime: string | null,
  items: PlannedMealItem[] = []
) {
  const timePart = plannedTime ? ` around ${plannedTime}` : ' soon';
  const intro = `Hey ${firstName}, ${mealName} is coming up${timePart}.`;
  const plannedLines = items.map(formatPlannedItemLine).filter((line): line is string => Boolean(line));
  if (!plannedLines.length) return intro;

  const numbered = plannedLines.map((line, index) => `${index + 1}. ${line}`).join('\n');
  return `${intro}\n\nPlanned:\n${numbered}`;
}

function buildEveningRecap(
  firstName: string,
  mealsCompleted: number,
  mealsPlanned: number,
  caloriesActual: number,
  calorieTarget: number
) {
  const mealsPart = mealsPlanned > 0 ? `${mealsCompleted}/${mealsPlanned} meals logged` : 'a fresh start tomorrow';
  const caloriePart = calorieTarget > 0 ? `, ${Math.round(caloriesActual)} of ${Math.round(calorieTarget)} cal` : '';
  return `Evening check-in, ${firstName}: ${mealsPart}${caloriePart} today. Anything you still need to log? Text me what you ate and I'll take care of it.`;
}

async function processUserReminders(user: ReminderUser, now: Date): Promise<number> {
  const phone = user.phone?.trim();
  const timezone = user.timezone?.trim();
  if (!phone || !timezone) return 0;
  if (isTwilioSenderPhone(phone)) return 0;

  const { dateKey, minutesOfDay, hour, minute } = localTimeParts(timezone, now);
  // Load the user's local calendar day so meal lists and recap totals match the
  // timezone-based send window rather than the UTC day.
  const dashboard = await getTodayDashboard(user.id, dateKey);
  if (!dashboard.program) return 0;

  const meals = dashboard.allMeals as MealReminderCandidate[];

  let sent = 0;

  if (user.smsMealRemindersEnabled) {
    for (const meal of meals) {
      if (COMPLETED_MEAL_STATUSES.has(meal.status)) continue;
      if (!isMealReminderDue(minutesOfDay, meal.plannedTime)) continue;

      const reserved = await reserveNudge(user.id, 'MEAL_REMINDER', dateKey, meal.id);
      if (!reserved) continue;

      const message = capSms(buildMealReminder(user.firstName, meal.name, meal.plannedTime, meal.items));
      if (await deliverNudge(user.id, phone, message, 'MEAL_REMINDER')) {
        sent += 1;
      } else {
        await releaseNudge(user.id, 'MEAL_REMINDER', dateKey, meal.id);
      }
    }
  }

  if (
    user.smsEveningRecapEnabled &&
    hour === RECAP_HOUR &&
    minute < RECAP_WINDOW_MINUTES &&
    dashboard.dailyLog
  ) {
    const reserved = await reserveNudge(user.id, 'EVENING_RECAP', dateKey, 'day');
    if (reserved) {
      const message = buildEveningRecap(
        user.firstName,
        dashboard.dailyLog.mealsCompleted ?? 0,
        dashboard.dailyLog.mealsPlanned ?? 0,
        n(dashboard.dailyLog.caloriesActual),
        n(dashboard.dailyLog.calorieTarget)
      );
      if (await deliverNudge(user.id, phone, message, 'EVENING_RECAP')) {
        sent += 1;
      } else {
        await releaseNudge(user.id, 'EVENING_RECAP', dateKey, 'day');
      }
    }
  }

  return sent;
}

async function processGuidedDiscoveryReminders(now: Date): Promise<number> {
  const { listActiveDiscoveryReminderCandidates } = await import('./guidedJourneyService.js');
  const candidates = await listActiveDiscoveryReminderCandidates(now);
  let sent = 0;

  for (const candidate of candidates) {
    if (isTwilioSenderPhone(candidate.phone)) continue;

    const already = await prisma.smsNudgeLog.count({
      where: {
        userId: candidate.userId,
        kind: 'GUIDED_DISCOVERY_PROMPT',
        date: candidate.dateKey
      }
    });
    if (already >= candidate.maxRemindersPerDay) continue;

    const refId = `${candidate.discoveryId}:${already + 1}`;
    const reserved = await reserveNudge(
      candidate.userId,
      'GUIDED_DISCOVERY_PROMPT',
      candidate.dateKey,
      refId
    );
    if (!reserved) continue;

    const message = capSms(candidate.prompt);
    if (await deliverNudge(candidate.userId, candidate.phone, message, 'GUIDED_DISCOVERY_PROMPT')) {
      sent += 1;
    } else {
      await releaseNudge(candidate.userId, 'GUIDED_DISCOVERY_PROMPT', candidate.dateKey, refId);
    }
  }

  return sent;
}

/** Sends due pre-meal reminders and evening recaps. Designed to be called every few minutes by a scheduler. */
export async function runSmsReminderTick(now = new Date()) {
  if (!isTwilioConfigured()) {
    return { sent: 0, considered: 0, skipped: 'twilio-not-configured' as const };
  }

  const users = await prisma.user.findMany({
    where: {
      phone: { not: null },
      timezone: { not: null },
      smsOptedOut: false,
      status: 'ACTIVE',
      OR: [{ smsMealRemindersEnabled: true }, { smsEveningRecapEnabled: true }]
    },
    select: {
      id: true,
      phone: true,
      timezone: true,
      firstName: true,
      smsMealRemindersEnabled: true,
      smsEveningRecapEnabled: true
    }
  });

  const eligibleUsers = users.filter((user) => user.phone?.trim() && user.timezone?.trim());

  let sent = 0;
  let errors = 0;
  for (const user of eligibleUsers) {
    try {
      sent += await processUserReminders(user, now);
    } catch (error) {
      errors += 1;
      console.error('[sms-reminder] failed for user', user.id, error);
    }
  }

  try {
    sent += await processGuidedDiscoveryReminders(now);
  } catch (error) {
    errors += 1;
    console.error('[sms-reminder] guided journey prompts failed', error);
  }

  return { sent, considered: eligibleUsers.length, errors };
}
