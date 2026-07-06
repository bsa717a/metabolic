import type { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { parseDateParam, startOfUtcDay, userDayKey } from './dates.js';
import { fatMassLbs, leanTissueMassLbs } from './bodyComposition.js';
import { n } from './numbers.js';

export const BODY_COMP_METRIC_TYPES = ['WEIGHT', 'BODY_FAT', 'LEAN_TISSUE_MASS', 'FAT_MASS'] as const;
type BodyCompMetricType = (typeof BODY_COMP_METRIC_TYPES)[number];

type Db = Prisma.TransactionClient | typeof prisma;

type DatedValue = { date: Date; value: number; updatedAt?: Date };

type ProgramMetricRow = {
  id: string;
  metricType: string;
  currentValue: unknown;
  updatedAt: Date;
};

function isBodyCompMetricType(type: string): type is BodyCompMetricType {
  return (BODY_COMP_METRIC_TYPES as readonly string[]).includes(type);
}

function pickLatest(candidates: DatedValue[]): DatedValue | null {
  if (!candidates.length) return null;
  return (
    [...candidates].sort((a, b) => {
      const dateDiff = b.date.getTime() - a.date.getTime();
      if (dateDiff !== 0) return dateDiff;
      const aStamp = a.updatedAt?.getTime() ?? a.date.getTime();
      const bStamp = b.updatedAt?.getTime() ?? b.date.getTime();
      return bStamp - aStamp;
    })[0] ?? null
  );
}

async function userTodayDate(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  return parseDateParam(userDayKey(user?.timezone ?? null));
}

/** True when a direct program-metric edit should win over an older logged value. */
export function shouldPreferProgramMetric(
  metricUpdatedAt: Date,
  logDate: Date,
  metricValue: number,
  logValue: number
) {
  if (metricValue === logValue) return true;
  const logDay = startOfUtcDay(logDate).getTime();
  const metricDay = startOfUtcDay(metricUpdatedAt).getTime();
  if (metricDay > logDay) return true;
  if (metricDay === logDay && metricUpdatedAt.getTime() > logDate.getTime()) return true;
  return false;
}

type WeightMetricRef = { currentValue: unknown; updatedAt: Date };

/** Daily log row copied from program metrics (not an independent weigh-in). */
export function isLikelySyncedDailyLogEcho(
  log: { date: Date; weight: unknown; updatedAt: Date },
  metric: WeightMetricRef
) {
  const metricDay = startOfUtcDay(metric.updatedAt).getTime();
  const logDay = startOfUtcDay(log.date).getTime();
  if (logDay !== metricDay) return false;
  return n(log.weight) === n(metric.currentValue) && log.updatedAt.getTime() > metric.updatedAt.getTime();
}

async function resolveLatestIndependentDailyLogWeight(
  userId: string,
  weightMetric?: WeightMetricRef | null
): Promise<DatedValue | null> {
  const userToday = await userTodayDate(userId);
  const logs = await prisma.dailyLog.findMany({
    where: { userId, weight: { not: null }, date: { lte: userToday } },
    orderBy: [{ date: 'desc' }, { updatedAt: 'desc' }],
    take: 30,
    select: { date: true, weight: true, updatedAt: true }
  });

  for (const log of logs) {
    if (weightMetric && isLikelySyncedDailyLogEcho(log, weightMetric)) continue;
    return { date: log.date, value: n(log.weight), updatedAt: log.updatedAt };
  }

  return null;
}

/** Most recent independently logged weight (daily logs + progress snapshots; not blueprint snapshots). */
export async function resolveLatestWeight(userId: string, programId: string): Promise<DatedValue | null> {
  const userToday = await userTodayDate(userId);

  const [weightMetric, progressWeight] = await Promise.all([
    prisma.programMetric.findFirst({
      where: { programId, metricType: 'WEIGHT' },
      select: { currentValue: true, updatedAt: true }
    }),
    prisma.progressSnapshot.findFirst({
      where: { userId, weight: { not: null }, snapshotDate: { lte: userToday } },
      orderBy: [{ snapshotDate: 'desc' }, { updatedAt: 'desc' }],
      select: { snapshotDate: true, weight: true, updatedAt: true }
    })
  ]);

  const dailyLogWeight = await resolveLatestIndependentDailyLogWeight(userId, weightMetric);

  return pickLatest([
    ...(dailyLogWeight ? [dailyLogWeight] : []),
    ...(progressWeight?.weight != null
      ? [
          {
            date: progressWeight.snapshotDate,
            value: n(progressWeight.weight),
            updatedAt: progressWeight.updatedAt
          }
        ]
      : [])
  ]);
}

/** Most recent body-fat % from blueprint snapshots or daily logs. */
async function resolveLatestBodyFat(userId: string, programId: string): Promise<DatedValue | null> {
  const userToday = await userTodayDate(userId);

  const [snapshotBodyFat, dailyLogBodyFat] = await Promise.all([
    prisma.programMetricSnapshotValue.findFirst({
      where: { metricType: 'BODY_FAT', snapshot: { programId, date: { lte: userToday } } },
      orderBy: [{ snapshot: { date: 'desc' } }, { snapshot: { updatedAt: 'desc' } }],
      select: { currentValue: true, snapshot: { select: { date: true } } }
    }),
    prisma.dailyLog.findFirst({
      where: { userId, bodyFat: { not: null }, date: { lte: userToday } },
      orderBy: [{ date: 'desc' }, { updatedAt: 'desc' }],
      select: { date: true, bodyFat: true, updatedAt: true }
    })
  ]);

  return pickLatest([
    ...(snapshotBodyFat
      ? [{ date: snapshotBodyFat.snapshot.date, value: n(snapshotBodyFat.currentValue) }]
      : []),
    ...(dailyLogBodyFat?.bodyFat != null
      ? [{ date: dailyLogBodyFat.date, value: n(dailyLogBodyFat.bodyFat), updatedAt: dailyLogBodyFat.updatedAt }]
      : [])
  ]);
}

async function latestSnapshotValue(programId: string, metricType: BodyCompMetricType): Promise<DatedValue | null> {
  const row = await prisma.programMetricSnapshotValue.findFirst({
    where: { metricType, snapshot: { programId } },
    orderBy: [{ snapshot: { date: 'desc' } }, { snapshot: { updatedAt: 'desc' } }],
    select: { currentValue: true, snapshot: { select: { date: true } } }
  });
  return row ? { date: row.snapshot.date, value: n(row.currentValue) } : null;
}

export async function setProgramMetricCurrentValue(
  programId: string,
  metricType: BodyCompMetricType,
  currentValue: number,
  db: Db = prisma
) {
  const metric = await db.programMetric.findFirst({
    where: { programId, metricType },
    select: { id: true }
  });
  if (!metric) return;

  await db.programMetric.update({
    where: { id: metric.id },
    data: { currentValue: n(currentValue) }
  });
}

export async function syncTodayDailyLogBodyComp(
  userId: string,
  programId: string,
  day: Date,
  db: Db = prisma
) {
  const [weightMetric, bodyFatMetric] = await Promise.all([
    db.programMetric.findFirst({ where: { programId, metricType: 'WEIGHT' } }),
    db.programMetric.findFirst({ where: { programId, metricType: 'BODY_FAT' } })
  ]);
  if (!weightMetric && !bodyFatMetric) return;

  await db.dailyLog.updateMany({
    where: { userId, programId, date: day },
    data: {
      ...(weightMetric ? { weight: weightMetric.currentValue } : {}),
      ...(bodyFatMetric ? { bodyFat: bodyFatMetric.currentValue } : {})
    }
  });
}

async function applyDerivedBodyComp(
  programId: string,
  weight: number,
  bodyFat: number,
  db: Db = prisma
) {
  await setProgramMetricCurrentValue(programId, 'LEAN_TISSUE_MASS', leanTissueMassLbs(weight, bodyFat), db);
  await setProgramMetricCurrentValue(programId, 'FAT_MASS', fatMassLbs(weight, bodyFat), db);
}

/**
 * When a blueprint session snapshot is saved, copy body-comp values onto the program's
 * stored "current" metrics — but only if this snapshot is the most recent session date.
 */
export async function syncProgramMetricsFromSnapshotValues(
  programId: string,
  snapshotDate: Date,
  values: Array<{ metricType: string; currentValue: unknown }>,
  db: Db = prisma
): Promise<boolean> {
  const bodyCompValues = values.filter((value) => isBodyCompMetricType(value.metricType));
  if (!bodyCompValues.length) return false;

  const latest = await db.programMetricSnapshot.findFirst({
    where: { programId },
    orderBy: [{ date: 'desc' }, { updatedAt: 'desc' }],
    select: { date: true }
  });
  if (!latest || latest.date.getTime() > snapshotDate.getTime()) return false;

  for (const value of bodyCompValues) {
    await setProgramMetricCurrentValue(programId, value.metricType as BodyCompMetricType, n(value.currentValue), db);
  }

  const weightVal = bodyCompValues.find((value) => value.metricType === 'WEIGHT');
  const bodyFatVal = bodyCompValues.find((value) => value.metricType === 'BODY_FAT');
  if (weightVal && bodyFatVal) {
    await applyDerivedBodyComp(programId, n(weightVal.currentValue), n(bodyFatVal.currentValue), db);
  }

  return true;
}

async function maybeSyncMetricFromLog(
  userId: string,
  metric: ProgramMetricRow | undefined,
  latest: DatedValue | null
): Promise<number | null> {
  if (!metric || !latest) return null;
  const current = n(metric.currentValue);
  if (current === latest.value) return null;

  const metricDay = startOfUtcDay(metric.updatedAt);
  const echoLog = await prisma.dailyLog.findFirst({
    where: { userId, date: metricDay, weight: { not: null } },
    select: { date: true, weight: true, updatedAt: true }
  });
  if (echoLog && isLikelySyncedDailyLogEcho(echoLog, metric)) {
    return latest.value;
  }

  const logTimestamp = latest.updatedAt ?? latest.date;
  if (shouldPreferProgramMetric(metric.updatedAt, logTimestamp, current, latest.value)) return null;
  return latest.value;
}

/** Repair stored program metrics from the latest logged body-comp data. */
export async function reconcileProgramBodyCompMetricsFromLatestSnapshot(
  programId: string,
  userId?: string
): Promise<boolean> {
  const program = await prisma.program.findUnique({
    where: { id: programId },
    select: {
      userId: true,
      metrics: {
        where: { metricType: { in: [...BODY_COMP_METRIC_TYPES] } },
        select: { id: true, metricType: true, currentValue: true, updatedAt: true }
      }
    }
  });
  if (!program) return false;

  const resolvedUserId = userId ?? program.userId;
  let updated = false;
  const byType = new Map(program.metrics.map((metric) => [metric.metricType, metric]));

  // Current weight is owned by Metabolic Blueprint (Edit metrics / session save), not daily logs.
  const latestBodyFat = await resolveLatestBodyFat(resolvedUserId, programId);
  const nextBodyFat = await maybeSyncMetricFromLog(resolvedUserId, byType.get('BODY_FAT'), latestBodyFat);
  if (nextBodyFat != null) {
    await setProgramMetricCurrentValue(programId, 'BODY_FAT', nextBodyFat);
    updated = true;
  }

  for (const metricType of ['LEAN_TISSUE_MASS', 'FAT_MASS'] as const) {
    const latest = await latestSnapshotValue(programId, metricType);
    const next = await maybeSyncMetricFromLog(resolvedUserId, byType.get(metricType), latest);
    if (next != null) {
      await setProgramMetricCurrentValue(programId, metricType, next);
      updated = true;
    }
  }

  const weight = byType.get('WEIGHT') ? n(byType.get('WEIGHT')!.currentValue) : null;
  const bodyFat =
    nextBodyFat ??
    (byType.get('BODY_FAT') ? n(byType.get('BODY_FAT')!.currentValue) : latestBodyFat?.value ?? null);
  if (weight != null && bodyFat != null) {
    const lean = leanTissueMassLbs(weight, bodyFat);
    const fat = fatMassLbs(weight, bodyFat);
    const leanMetric = byType.get('LEAN_TISSUE_MASS');
    const fatMetric = byType.get('FAT_MASS');
    if (leanMetric && n(leanMetric.currentValue) !== lean) {
      await setProgramMetricCurrentValue(programId, 'LEAN_TISSUE_MASS', lean);
      updated = true;
    }
    if (fatMetric && n(fatMetric.currentValue) !== fat) {
      await setProgramMetricCurrentValue(programId, 'FAT_MASS', fat);
      updated = true;
    }
  }

  if (updated && nextBodyFat != null) {
    const today = await userTodayDate(resolvedUserId);
    await syncTodayDailyLogBodyComp(resolvedUserId, programId, today);
  }

  return updated;
}
