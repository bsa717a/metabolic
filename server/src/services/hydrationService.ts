import { HydrationSource, ProgramStatus } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { addUtcDays, parseDateKeyParam, parseDateParam, startOfUtcDay, userDayKey } from '../utils/dates.js';
import { parseWaterAmountOz } from '../utils/waterParse.js';
import { ensureDailyLogByUserId, userTodayDate } from './dailyLogService.js';
import { recordWaterGoalDay, revertWaterGoalDay } from '../gamification/progressionEngine.js';

export type HydrationSummary = {
  goalOz: number;
  targetOz: number;
  actualOz: number;
  fillFraction: number;
  goalMet: boolean;
  currentStreak: number;
  bestStreak: number;
  goalMetDays: number;
  last30DayHitPercent: number;
  recentEntries: Array<{
    id: string;
    amountOz: number;
    source: HydrationSource;
    createdAt: string;
  }>;
};

function fillFraction(targetOz: number, actualOz: number) {
  if (targetOz <= 0) return 0;
  return Math.max(0, Math.min(1, (targetOz - actualOz) / targetOz));
}

async function getWaterGoalMetDays(userId: string) {
  return prisma.dailyLog.count({
    where: { userId, waterGoalMet: true }
  });
}

async function getLast30DayHitPercent(userId: string) {
  const since = addUtcDays(startOfUtcDay(), -29);
  const logs = await prisma.dailyLog.findMany({
    where: { userId, date: { gte: since } },
    select: { waterGoalMet: true }
  });
  if (!logs.length) return 0;
  const met = logs.filter((log) => log.waterGoalMet).length;
  return Math.round((met / logs.length) * 100);
}

async function recalcDailyWater(dailyLogId: string) {
  const entries = await prisma.hydrationEntry.findMany({
    where: { dailyLogId },
    select: { amountOz: true }
  });
  const actualOz = entries.reduce((sum, entry) => sum + entry.amountOz, 0);
  const log = await prisma.dailyLog.findUnique({
    where: { id: dailyLogId },
    select: { waterTargetOz: true, userId: true }
  });
  if (!log) throw new Error('Daily log not found');

  const waterGoalMet = actualOz >= log.waterTargetOz;
  const updated = await prisma.dailyLog.update({
    where: { id: dailyLogId },
    data: { waterActualOz: actualOz, waterGoalMet }
  });

  if (waterGoalMet) {
    await recordWaterGoalDay(log.userId, dailyLogId);
  }

  return updated;
}

async function resolveDateKey(userId: string, dateKey?: string | null, timeZone?: string | null) {
  const explicit = parseDateKeyParam(dateKey);
  if (explicit) return explicit;
  const tz =
    timeZone ??
    (await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } }))?.timezone ??
    null;
  return userDayKey(tz);
}

async function ensureUserDailyLog(userId: string, dateKey?: string | null, timeZone?: string | null) {
  const resolved = await resolveDateKey(userId, dateKey, timeZone);
  const dailyLog = await ensureDailyLogByUserId(userId, resolved);
  if (!dailyLog) throw new Error('No active program found');
  return dailyLog;
}

export async function getHydrationSummary(
  userId: string,
  dateKey?: string | null,
  timeZone?: string | null
): Promise<HydrationSummary> {
  const [user, dailyLog, waterStreak, goalMetDays, last30DayHitPercent] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { waterGoalOz: true } }),
    ensureUserDailyLog(userId, dateKey, timeZone),
    prisma.userStreak.findUnique({
      where: { userId_streakType: { userId, streakType: 'WATER_GOAL_DAILY' } }
    }),
    getWaterGoalMetDays(userId),
    getLast30DayHitPercent(userId)
  ]);

  const entries = await prisma.hydrationEntry.findMany({
    where: { dailyLogId: dailyLog.id },
    orderBy: { createdAt: 'desc' },
    take: 10
  });

  const targetOz = dailyLog.waterTargetOz;
  const actualOz = dailyLog.waterActualOz;

  return {
    goalOz: user?.waterGoalOz ?? 64,
    targetOz,
    actualOz,
    fillFraction: fillFraction(targetOz, actualOz),
    goalMet: dailyLog.waterGoalMet,
    currentStreak: waterStreak?.currentCount ?? 0,
    bestStreak: waterStreak?.bestCount ?? 0,
    goalMetDays,
    last30DayHitPercent,
    recentEntries: entries.map((entry) => ({
      id: entry.id,
      amountOz: entry.amountOz,
      source: entry.source,
      createdAt: entry.createdAt.toISOString()
    }))
  };
}

export async function logWater(
  userId: string,
  input: { amountOz?: number; text?: string; source?: HydrationSource; dateKey?: string | null; timeZone?: string | null }
) {
  let amountOz = input.amountOz;
  if (amountOz == null && input.text) {
    amountOz = parseWaterAmountOz(input.text) ?? undefined;
  }
  if (amountOz == null || amountOz <= 0) {
    throw new Error('Could not parse a valid water amount. Try "16 oz water" or "drank a glass of water".');
  }

  const dailyLog = await ensureUserDailyLog(userId, input.dateKey, input.timeZone);
  const source = input.source ?? HydrationSource.MANUAL;

  await prisma.$transaction(async (tx) => {
    await tx.hydrationEntry.create({
      data: {
        dailyLogId: dailyLog.id,
        userId,
        amountOz: Math.round(amountOz),
        source
      }
    });
    await tx.dailyLog.update({
      where: { id: dailyLog.id },
      data: { waterActualOz: { increment: Math.round(amountOz) } }
    });
  });

  const updated = await recalcDailyWater(dailyLog.id);
  const summary = await getHydrationSummary(userId, input.dateKey, input.timeZone);

  return {
    amountOz: Math.round(amountOz),
    actualOz: updated.waterActualOz,
    targetOz: updated.waterTargetOz,
    goalMet: updated.waterGoalMet,
    fillFraction: fillFraction(updated.waterTargetOz, updated.waterActualOz),
    summary
  };
}

export async function undoLastEntry(userId: string, dateKey?: string | null, timeZone?: string | null) {
  const dailyLog = await ensureUserDailyLog(userId, dateKey, timeZone);
  const lastEntry = await prisma.hydrationEntry.findFirst({
    where: { dailyLogId: dailyLog.id },
    orderBy: { createdAt: 'desc' }
  });
  if (!lastEntry) throw new Error('No hydration entries to undo today');

  await prisma.hydrationEntry.delete({ where: { id: lastEntry.id } });
  const updated = await recalcDailyWater(dailyLog.id);
  if (!updated.waterGoalMet) {
    await revertWaterGoalDay(userId, dailyLog.date);
  }

  return getHydrationSummary(userId, dateKey, timeZone);
}

export async function setWaterGoal(
  userId: string,
  goalOz: number,
  dateKey?: string | null,
  timeZone?: string | null
) {
  if (!Number.isFinite(goalOz) || goalOz < 1 || goalOz > 512) {
    throw new Error('Water goal must be between 1 and 512 ounces');
  }

  const rounded = Math.round(goalOz);
  await prisma.user.update({
    where: { id: userId },
    data: { waterGoalOz: rounded }
  });

  const todayKey = await resolveDateKey(userId, dateKey, timeZone);
  const today = parseDateParam(todayKey);
  await prisma.dailyLog.updateMany({
    where: { userId, date: today },
    data: { waterTargetOz: rounded }
  });

  const dailyLog = await prisma.dailyLog.findUnique({
    where: { userId_date: { userId, date: today } }
  });
  if (dailyLog) {
    await recalcDailyWater(dailyLog.id);
  }

  return getHydrationSummary(userId, dateKey, timeZone);
}

export async function getCoachHydrationStats(userId: string) {
  const [user, goalMetDays, last30DayHitPercent] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { waterGoalOz: true } }),
    getWaterGoalMetDays(userId),
    getLast30DayHitPercent(userId)
  ]);

  const waterStreak = await prisma.userStreak.findUnique({
    where: { userId_streakType: { userId, streakType: 'WATER_GOAL_DAILY' } }
  });

  let todayActual = 0;
  let todayTarget = user?.waterGoalOz ?? 64;
  let todayGoalMet = false;

  const program = await prisma.program.findFirst({
    where: { userId, status: ProgramStatus.ACTIVE }
  });
  if (program) {
    const today = await userTodayDate(userId);
    const todayLog = await prisma.dailyLog.findUnique({
      where: { userId_date: { userId, date: today } }
    });
    if (todayLog) {
      todayActual = todayLog.waterActualOz;
      todayTarget = todayLog.waterTargetOz;
      todayGoalMet = todayLog.waterGoalMet;
    }
  }

  return {
    waterGoalOz: user?.waterGoalOz ?? 64,
    currentStreak: waterStreak?.currentCount ?? 0,
    goalMetDays,
    last30DayHitPercent,
    todayActualOz: todayActual,
    todayTargetOz: todayTarget,
    todayGoalMet
  };
}

