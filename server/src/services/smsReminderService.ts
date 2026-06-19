import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { getTodayDashboard } from './dashboardService.js';
import { isTwilioConfigured, isTwilioSenderPhone, sendOutboundMessage } from './twilioOutboundService.js';
import { localTimeParts } from '../utils/dates.js';
import { COMPLETED_MEAL_STATUSES, parsePlannedMinutes } from '../utils/meals.js';
import { n } from '../utils/numbers.js';

const REMIND_WINDOW_MIN = 15;
const REMIND_WINDOW_MAX = 30;
const RECAP_HOUR = 20;
const RECAP_WINDOW_MINUTES = 30;

type ReminderUser = {
  id: string;
  phone: string | null;
  timezone: string | null;
  firstName: string;
};

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** Reserves a nudge via the unique constraint. Returns false if it was already sent. */
async function reserveNudge(userId: string, kind: 'MEAL_REMINDER' | 'EVENING_RECAP', date: string, refId: string) {
  try {
    await prisma.smsNudgeLog.create({ data: { userId, kind, date, refId } });
    return true;
  } catch (error) {
    if (isUniqueViolation(error)) return false;
    throw error;
  }
}

/** Releases a reservation so a later tick can retry (used when delivery fails). */
async function releaseNudge(userId: string, kind: 'MEAL_REMINDER' | 'EVENING_RECAP', date: string, refId: string) {
  await prisma.smsNudgeLog.deleteMany({ where: { userId, kind, date, refId } });
}

async function deliverNudge(userId: string, phone: string, message: string, intent: string) {
  const outbound = await prisma.smsMessage.create({
    data: { phone, userId, direction: 'OUTBOUND', message, response: message, intent, status: 'PROCESSED' }
  });
  try {
    await sendOutboundMessage(phone, message);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Could not send text message.';
    await prisma.smsMessage.update({ where: { id: outbound.id }, data: { status: 'FAILED', response: detail } });
    return false;
  }
  return true;
}

function buildMealReminder(firstName: string, mealName: string, plannedTime: string | null) {
  const timePart = plannedTime ? ` around ${plannedTime}` : ' soon';
  return `Hey ${firstName}, ${mealName} is coming up${timePart}. Want ideas that fit your macros? Tell me where you are or what you're thinking, or send a photo when you eat and I'll log it.`;
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
  const phone = user.phone;
  const timezone = user.timezone;
  if (!phone || !timezone) return 0;
  if (isTwilioSenderPhone(phone)) return 0;

  const { dateKey, minutesOfDay, hour, minute } = localTimeParts(timezone, now);
  // Load the user's local calendar day so meal lists and recap totals match the
  // timezone-based send window rather than the UTC day.
  const dashboard = await getTodayDashboard(user.id, dateKey);
  if (!dashboard.program) return 0;

  let sent = 0;

  for (const meal of dashboard.meals) {
    if (COMPLETED_MEAL_STATUSES.has(meal.status)) continue;
    const mealMinutes = parsePlannedMinutes(meal.plannedTime);
    if (mealMinutes == null) continue;

    const minutesUntil = mealMinutes - minutesOfDay;
    if (minutesUntil < REMIND_WINDOW_MIN || minutesUntil > REMIND_WINDOW_MAX) continue;

    const reserved = await reserveNudge(user.id, 'MEAL_REMINDER', dateKey, meal.id);
    if (!reserved) continue;

    const message = buildMealReminder(user.firstName, meal.name, meal.plannedTime);
    if (await deliverNudge(user.id, phone, message, 'MEAL_REMINDER')) {
      sent += 1;
    } else {
      // Delivery failed: release the reservation so a later tick can retry.
      await releaseNudge(user.id, 'MEAL_REMINDER', dateKey, meal.id);
    }
  }

  if (hour === RECAP_HOUR && minute < RECAP_WINDOW_MINUTES && dashboard.dailyLog) {
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
      smsRemindersEnabled: true,
      status: 'ACTIVE'
    },
    select: { id: true, phone: true, timezone: true, firstName: true }
  });

  let sent = 0;
  for (const user of users) {
    try {
      sent += await processUserReminders(user, now);
    } catch {
      // Best-effort per user; skip on failure so one bad user does not block the batch.
    }
  }

  return { sent, considered: users.length };
}
