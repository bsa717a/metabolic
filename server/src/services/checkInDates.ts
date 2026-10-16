import { prisma } from '../db/prisma.js';
import { toDateKey } from '../utils/dates.js';

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Check-in dates on or before today, newest first. Drops blanks and duplicates. */
export function pastCheckInDates(dates: string[], todayKey: string): string[] {
  const kept = new Set<string>();
  for (const date of dates) {
    if (DATE_KEY_RE.test(date) && date <= todayKey) kept.add(date);
  }
  return [...kept].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
}

/**
 * Dates a client can jump to in meal and workout history.
 * Metric snapshots are check-ins. Legacy daily logs and legacy progress
 * snapshots are the imported training-session days. Copied filler days are
 * not included. This read does not create daily logs.
 */
export async function listPastCheckInDates(userId: string, todayKey: string): Promise<string[]> {
  const [snapshots, legacyLogs, legacyProgress] = await Promise.all([
    prisma.programMetricSnapshot.findMany({
      where: { program: { userId } },
      select: { date: true }
    }),
    prisma.dailyLog.findMany({
      where: { userId, notes: { startsWith: 'legacy:' } },
      select: { date: true }
    }),
    prisma.progressSnapshot.findMany({
      where: { userId, notes: { startsWith: 'legacy:' } },
      select: { snapshotDate: true }
    })
  ]);

  return pastCheckInDates(
    [
      ...snapshots.map((row) => toDateKey(row.date)),
      ...legacyLogs.map((row) => toDateKey(row.date)),
      ...legacyProgress.map((row) => toDateKey(row.snapshotDate))
    ],
    todayKey
  );
}
