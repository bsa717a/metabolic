import { ProgramStatus, Role } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { runProgressionEvaluation } from '../gamification/progressionEngine.js';
import { canAccessUser, isAdmin, isCoach } from '../auth/requireRole.js';
import {
  BODY_COMP_METRIC_TYPES,
  reconcileProgramBodyCompMetricsFromLatestSnapshot,
  setProgramMetricCurrentValue,
  syncProgramMetricsFromSnapshotValues,
  syncTodayDailyLogBodyComp
} from '../utils/programBodyCompSync.js';
import { parseDateParam, userDayKey } from '../utils/dates.js';
import { metricUpdatesForLegacyGoals, missingProgramMetrics } from '../utils/programMetrics.js';
import { ensureDailyLogByUserId } from './dailyLogService.js';
import { freezeTargetsOnPeriod, resolveTargets } from './targetService.js';

const REQUIRED_METRICS = ['WEIGHT', 'BODY_FAT', 'LEAN_TISSUE_MASS', 'FAT_MASS', 'CALORIES', 'PROTEIN'] as const;
const MEASUREMENT_METRICS = ['WAIST', 'HIPS', 'CHEST'] as const;

function hasCompleteMetrics(metrics: Array<{ metricType: string }>) {
  const types = new Set(metrics.map((metric) => metric.metricType));
  return REQUIRED_METRICS.every((metricType) => types.has(metricType));
}

async function ensureCompleteProgramMetrics(programId: string) {
  const program = await prisma.program.findUnique({
    where: { id: programId },
    include: { metrics: true, user: true }
  });
  if (!program) return null;

  const weight = program.metrics.find((metric) => metric.metricType === 'WEIGHT');
  if (!weight) return program;

  const caloriesMetric = program.metrics.find((metric) => metric.metricType === 'CALORIES');
  const proteinMetric = program.metrics.find((metric) => metric.metricType === 'PROTEIN');
  const calories = Number(caloriesMetric?.startValue ?? 2200);
  const protein = Number(proteinMetric?.startValue ?? 190);

  const toCreate = missingProgramMetrics(
    programId,
    program.metrics,
    {
      weight: Number(weight.startValue),
      goalWeight: Number(weight.goalValue),
      bodyFat: 30,
      goalBodyFat: 18
    },
    calories,
    protein
  );

  const goalUpdates = metricUpdatesForLegacyGoals(program.metrics);

  if (!toCreate.length && !goalUpdates.length) return program;

  await prisma.$transaction(async (tx) => {
    if (toCreate.length) {
      await tx.programMetric.createMany({ data: toCreate });
    }
    for (const update of goalUpdates) {
      await tx.programMetric.update({
        where: { id: update.id },
        data: { goalValue: update.goalValue }
      });
    }
  });

  return prisma.program.findUniqueOrThrow({
    where: { id: programId },
    include: { metrics: true, user: true }
  });
}

async function ensureMeasurementProgramMetrics(programId: string, metrics: Array<{ metricType: string }>) {
  const existing = new Set(metrics.map((metric) => metric.metricType));
  const toCreate = MEASUREMENT_METRICS.filter((metricType) => !existing.has(metricType)).map((metricType) => ({
    programId,
    metricType,
    startValue: 0,
    currentValue: 0,
    goalValue: 0,
    unit: 'in'
  }));

  if (!toCreate.length) return;

  await prisma.programMetric.createMany({ data: toCreate });
}

async function reloadProgram(programId: string) {
  const header = await prisma.program.findUnique({ where: { id: programId }, select: { userId: true } });
  if (header) {
    await reconcileProgramBodyCompMetricsFromLatestSnapshot(programId, header.userId);
  }
  return prisma.program.findUniqueOrThrow({
    where: { id: programId },
    include: { metrics: true, user: true }
  });
}

const programWithMetricsInclude = { metrics: true, user: true } as const;

export async function listPrograms(user: { id: string; role: Role }) {
  const where = isAdmin(user) ? {} : isCoach(user) ? { coachId: user.id } : { userId: user.id };
  return prisma.program.findMany({
    where,
    include: programWithMetricsInclude,
    orderBy: { createdAt: 'desc' }
  });
}

/** Read-only program fetch for GET endpoints — no reconciliation or metric backfill. */
export async function getProgramForRead(user: { id: string; role: Role }, id: string) {
  const program = await prisma.program.findUnique({ where: { id }, include: programWithMetricsInclude });
  if (!program) return null;
  if (!(await canAccessUser(user, program.userId)) && program.coachId !== user.id) return null;
  return program;
}

/** Program shown on the Metabolic Blueprint page for the signed-in user. */
export async function getBlueprintProgram(user: { id: string; role: Role }) {
  const own = await prisma.program.findFirst({
    where: { userId: user.id },
    include: { metrics: true },
    orderBy: { createdAt: 'desc' }
  });
  if (own) return own;

  if (!isAdmin(user) && !isCoach(user)) return null;

  const where = isAdmin(user) ? {} : { coachId: user.id };
  return prisma.program.findFirst({
    where,
    include: { metrics: true },
    orderBy: { createdAt: 'desc' }
  });
}

async function assertProgramAccess(user: { id: string; role: Role }, programId: string) {
  const program = await prisma.program.findUnique({
    where: { id: programId },
    select: { id: true, userId: true, coachId: true }
  });
  if (!program) throw new Error('Program not found');
  if (!(await canAccessUser(user, program.userId)) && program.coachId !== user.id) {
    throw new Error('Program not found');
  }
  return program;
}

async function prepareProgramForMutation(user: { id: string; role: Role }, id: string) {
  const program = await prisma.program.findUnique({ where: { id }, include: programWithMetricsInclude });
  if (!program) return null;
  if (!(await canAccessUser(user, program.userId)) && program.coachId !== user.id) return null;
  let resolved = program;
  if (hasCompleteMetrics(program.metrics)) {
    const goalUpdates = metricUpdatesForLegacyGoals(program.metrics);
    if (goalUpdates.length) {
      await prisma.$transaction(async (tx) => {
        for (const update of goalUpdates) {
          await tx.programMetric.update({
            where: { id: update.id },
            data: { goalValue: update.goalValue }
          });
        }
      });
      resolved = await prisma.program.findUniqueOrThrow({
        where: { id: program.id },
        include: programWithMetricsInclude
      });
    }
  } else {
    const completed = await ensureCompleteProgramMetrics(program.id);
    resolved = completed ?? program;
  }
  await ensureMeasurementProgramMetrics(resolved.id, resolved.metrics);
  return reloadProgram(resolved.id);
}

/** Full program load with metric repair — use on writes, not page loads. */
export async function getProgram(user: { id: string; role: Role }, id: string) {
  return prepareProgramForMutation(user, id);
}

export async function activateProgram(userId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    const program = await tx.program.findUniqueOrThrow({ where: { id } });
    await tx.program.updateMany({ where: { userId: program.userId, status: ProgramStatus.ACTIVE }, data: { status: ProgramStatus.PAUSED } });
    return tx.program.update({ where: { id }, data: { status: ProgramStatus.ACTIVE } });
  });
}

type MetricUpdate = { id: string; startValue?: number; currentValue?: number; goalValue?: number };

type SnapshotValueInput = { metricType: string; currentValue: number; unit: string };

function isBodyCompMetricType(type: string) {
  return (BODY_COMP_METRIC_TYPES as readonly string[]).includes(type);
}

/** Camera-save payloads can carry stale body-comp; always trust stored program metrics. */
function mergeBodyCompFromProgramMetrics(
  values: SnapshotValueInput[],
  programMetrics: Array<{ metricType: string; currentValue: unknown; unit: string }>
): SnapshotValueInput[] {
  const byType = new Map(
    programMetrics.filter((metric) => isBodyCompMetricType(metric.metricType)).map((metric) => [metric.metricType, metric])
  );

  const merged = values.map((value) => {
    const stored = byType.get(value.metricType);
    if (!stored) return value;
    return {
      metricType: value.metricType,
      currentValue: Number(stored.currentValue),
      unit: stored.unit
    };
  });

  for (const metric of programMetrics) {
    if (!isBodyCompMetricType(metric.metricType)) continue;
    if (merged.some((value) => value.metricType === metric.metricType)) continue;
    merged.push({
      metricType: metric.metricType,
      currentValue: Number(metric.currentValue),
      unit: metric.unit
    });
  }

  return merged;
}

export async function listProgramMetricSnapshots(
  user: { id: string; role: Role },
  programId: string
) {
  const program = await assertProgramAccess(user, programId);

  return prisma.programMetricSnapshot.findMany({
    where: { programId },
    include: {
      values: true,
      coachSession: { select: { notes: true } }
    },
    orderBy: { date: 'desc' }
  }).then(async (snapshots) => {
    const needsFallback = snapshots.some((snapshot) => !snapshot.coachSession?.notes);
    if (!needsFallback || !program.coachId) return snapshots;

    const fallbackSessions = await prisma.coachSession.findMany({
      where: {
        userId: program.userId,
        coachId: program.coachId,
        notes: { not: '' }
      },
      select: { notes: true, occurredAt: true },
      orderBy: { occurredAt: 'desc' }
    });

    const notesByDate = new Map<string, string>();
    for (const session of fallbackSessions) {
      const dateKey = session.occurredAt.toISOString().slice(0, 10);
      if (!notesByDate.has(dateKey)) notesByDate.set(dateKey, session.notes);
    }

    return snapshots.map((snapshot) => {
      if (snapshot.coachSession?.notes) return snapshot;
      const dateKey = snapshot.date.toISOString().slice(0, 10);
      const fallbackNotes = notesByDate.get(dateKey);
      if (!fallbackNotes) return snapshot;
      return {
        ...snapshot,
        coachSession: { notes: fallbackNotes }
      };
    });
  });
}

export async function saveProgramMetricSnapshot(
  user: { id: string; role: Role },
  programId: string,
  values: SnapshotValueInput[]
) {
  const program = await getProgram(user, programId);
  if (!program) throw new Error('Program not found');

  const owner = await prisma.user.findUnique({ where: { id: program.userId }, select: { timezone: true } });
  const date = parseDateParam(userDayKey(owner?.timezone ?? null));
  const mergedValues = mergeBodyCompFromProgramMetrics(values, program.metrics);

  return prisma.$transaction(async (tx) => {
    const snapshot = await tx.programMetricSnapshot.upsert({
      where: { programId_date: { programId, date } },
      create: { programId, date },
      update: { updatedAt: new Date() }
    });

    for (const value of mergedValues) {
      await tx.programMetricSnapshotValue.upsert({
        where: {
          snapshotId_metricType: {
            snapshotId: snapshot.id,
            metricType: value.metricType as never
          }
        },
        create: {
          snapshotId: snapshot.id,
          metricType: value.metricType as never,
          currentValue: value.currentValue,
          unit: value.unit
        },
        update: {
          currentValue: value.currentValue,
          unit: value.unit
        }
      });
    }

    const result = await tx.programMetricSnapshot.findUniqueOrThrow({
      where: { id: snapshot.id },
      include: { values: true }
    });
    await syncProgramMetricsFromSnapshotValues(programId, date, result.values, tx);
    await syncTodayDailyLogBodyComp(program.userId, programId, date, tx);
    return result;
  }).then(async (result) => {
    const ownerTz = await prisma.user.findUnique({ where: { id: program.userId }, select: { timezone: true } });
    await ensureDailyLogByUserId(program.userId, userDayKey(ownerTz?.timezone ?? null));
    await syncTodayDailyLogBodyComp(program.userId, programId, date);
    void runProgressionEvaluation(program.userId);
    return result;
  });
}

export async function updateProgramMetricSnapshot(
  user: { id: string; role: Role },
  programId: string,
  snapshotId: string,
  values: SnapshotValueInput[]
) {
  const program = await getProgram(user, programId);
  if (!program) throw new Error('Program not found');

  const snapshot = await prisma.programMetricSnapshot.findFirst({
    where: { id: snapshotId, programId }
  });
  if (!snapshot) throw new Error('Snapshot not found');

  return prisma.$transaction(async (tx) => {
    await tx.programMetricSnapshotValue.deleteMany({ where: { snapshotId } });
    await tx.programMetricSnapshotValue.createMany({
      data: values.map((value) => ({
        snapshotId,
        metricType: value.metricType as never,
        currentValue: value.currentValue,
        unit: value.unit
      }))
    });

    const result = await tx.programMetricSnapshot.update({
      where: { id: snapshotId },
      data: { updatedAt: new Date() },
      include: { values: true }
    });
    const synced = await syncProgramMetricsFromSnapshotValues(programId, snapshot.date, result.values, tx);
    if (!synced) {
      const owner = await tx.user.findUnique({ where: { id: program.userId }, select: { timezone: true } });
      const userToday = parseDateParam(userDayKey(owner?.timezone ?? null));
      if (snapshot.date.getTime() >= userToday.getTime()) {
        for (const value of result.values) {
          if (!isBodyCompMetricType(value.metricType)) continue;
          await setProgramMetricCurrentValue(programId, value.metricType as never, Number(value.currentValue), tx);
        }
      }
    }
    await syncTodayDailyLogBodyComp(program.userId, programId, snapshot.date, tx);
    return result;
  }).then(async (result) => {
    const owner = await prisma.user.findUnique({ where: { id: program.userId }, select: { timezone: true } });
    const todayKey = userDayKey(owner?.timezone ?? null);
    if (result.date.toISOString().slice(0, 10) === todayKey) {
      await ensureDailyLogByUserId(program.userId, todayKey);
      await syncTodayDailyLogBodyComp(program.userId, programId, parseDateParam(todayKey));
    }
    void runProgressionEvaluation(program.userId);
    return result;
  });
}

export async function updateProgramMetrics(
  user: { id: string; role: Role },
  programId: string,
  updates: MetricUpdate[]
) {
  const program = await getProgram(user, programId);
  if (!program) throw new Error('Program not found');

  const metricIds = new Set(program.metrics.map((metric) => metric.id));
  for (const update of updates) {
    if (!metricIds.has(update.id)) throw new Error('Metric not found');
  }

  return prisma.$transaction(async (tx) => {
    const results = [];
    for (const update of updates) {
      results.push(
        await tx.programMetric.update({
          where: { id: update.id },
          data: {
            startValue: update.startValue,
            currentValue: update.currentValue,
            goalValue: update.goalValue
          }
        })
      );
    }

    const bodyCompMetrics = await tx.programMetric.findMany({
      where: { programId, metricType: { in: [...BODY_COMP_METRIC_TYPES] } }
    });
    if (bodyCompMetrics.length) {
      const owner = await tx.user.findUnique({ where: { id: program.userId }, select: { timezone: true } });
      const today = parseDateParam(userDayKey(owner?.timezone ?? null));
      const snapshot = await tx.programMetricSnapshot.upsert({
        where: { programId_date: { programId, date: today } },
        create: { programId, date: today },
        update: { updatedAt: new Date() }
      });
      for (const metric of bodyCompMetrics) {
        await tx.programMetricSnapshotValue.upsert({
          where: {
            snapshotId_metricType: {
              snapshotId: snapshot.id,
              metricType: metric.metricType as never
            }
          },
          create: {
            snapshotId: snapshot.id,
            metricType: metric.metricType as never,
            currentValue: metric.currentValue,
            unit: metric.unit
          },
          update: {
            currentValue: metric.currentValue,
            unit: metric.unit
          }
        });
      }
      await syncTodayDailyLogBodyComp(program.userId, programId, today, tx);
    }

    return results;
  }).then(async (results) => {
    const bodyCompUpdate = updates.some((update) =>
      program.metrics.some(
        (metric) =>
          metric.id === update.id &&
          update.currentValue != null &&
          (BODY_COMP_METRIC_TYPES as readonly string[]).includes(metric.metricType)
      )
    );
    const weightCurrentChanged = updates.some((update) =>
      program.metrics.some(
        (metric) =>
          metric.id === update.id &&
          metric.metricType === 'WEIGHT' &&
          update.currentValue != null &&
          Number(metric.currentValue) !== Number(update.currentValue)
      )
    );
    if (bodyCompUpdate) {
      const owner = await prisma.user.findUnique({ where: { id: program.userId }, select: { timezone: true } });
      const todayKey = userDayKey(owner?.timezone ?? null);
      await ensureDailyLogByUserId(program.userId, todayKey);
      await syncTodayDailyLogBodyComp(program.userId, programId, parseDateParam(todayKey));
    }
    if (weightCurrentChanged) {
      const owner = await prisma.user.findUnique({ where: { id: program.userId }, select: { timezone: true } });
      const todayKey = userDayKey(owner?.timezone ?? null);
      const today = parseDateParam(todayKey);
      const resolved = await resolveTargets(program.userId);
      if (resolved) {
        const activePeriod = await prisma.planPeriod.findFirst({
          where: { programId: program.id, effectiveDate: { lte: today } },
          orderBy: { effectiveDate: 'desc' },
          select: { effectiveDate: true }
        });
        if (activePeriod) {
          await freezeTargetsOnPeriod(program.userId, program.id, activePeriod.effectiveDate);
        }
        const log = await ensureDailyLogByUserId(program.userId, todayKey);
        if (log) {
          await prisma.dailyLog.update({
            where: { id: log.id },
            data: {
              calorieTarget: resolved.calories,
              proteinTarget: resolved.protein,
              carbTarget: resolved.carbs,
              fatTarget: resolved.fat
            }
          });
        }
      }
    }
    return results;
  });
}

export async function upsertSnapshotMeasurement(
  user: { id: string; role: Role },
  programId: string,
  input: { date: string; metricType: string; currentValue: number; unit: string }
) {
  const program = await getProgram(user, programId);
  if (!program) throw new Error('Program not found');

  const day = parseDateParam(input.date);

  return prisma.$transaction(async (tx) => {
    const snapshot = await tx.programMetricSnapshot.upsert({
      where: { programId_date: { programId, date: day } },
      create: { programId, date: day },
      update: { updatedAt: new Date() }
    });

    await tx.programMetricSnapshotValue.upsert({
      where: {
        snapshotId_metricType: {
          snapshotId: snapshot.id,
          metricType: input.metricType as never
        }
      },
      create: {
        snapshotId: snapshot.id,
        metricType: input.metricType as never,
        currentValue: input.currentValue,
        unit: input.unit
      },
      update: {
        currentValue: input.currentValue,
        unit: input.unit
      }
    });

    const result = await tx.programMetricSnapshot.findUniqueOrThrow({
      where: { id: snapshot.id },
      include: { values: true }
    });
    const synced = await syncProgramMetricsFromSnapshotValues(programId, day, result.values, tx);
    if (!synced && isBodyCompMetricType(input.metricType)) {
      const owner = await tx.user.findUnique({ where: { id: program.userId }, select: { timezone: true } });
      const userToday = parseDateParam(userDayKey(owner?.timezone ?? null));
      if (day.getTime() >= userToday.getTime()) {
        await setProgramMetricCurrentValue(programId, input.metricType as never, input.currentValue, tx);
      }
    }
    await syncTodayDailyLogBodyComp(program.userId, programId, day, tx);
    return result;
  }).then(async (result) => {
    if (isBodyCompMetricType(input.metricType)) {
      await ensureDailyLogByUserId(program.userId, input.date);
      await syncTodayDailyLogBodyComp(program.userId, programId, day);
    }
    void runProgressionEvaluation(program.userId);
    return result;
  });
}

function serializeProgressPhotoSet(photoSet: {
  id: string;
  date: Date;
  frontUrl: string | null;
  sideUrl: string | null;
  backUrl: string | null;
}) {
  return {
    id: photoSet.id,
    date: photoSet.date.toISOString().slice(0, 10),
    frontUrl: photoSet.frontUrl,
    sideUrl: photoSet.sideUrl,
    backUrl: photoSet.backUrl
  };
}

export async function listProgressPhotoSets(user: { id: string; role: Role }, programId: string) {
  await assertProgramAccess(user, programId);

  const rows = await prisma.programProgressPhotoSet.findMany({
    where: { programId },
    orderBy: { date: 'desc' }
  });
  return rows.map(serializeProgressPhotoSet);
}

export async function upsertProgressPhotoSet(
  user: { id: string; role: Role },
  programId: string,
  input: { date: string; frontUrl?: string | null; sideUrl?: string | null; backUrl?: string | null; id?: string }
) {
  const program = await getProgram(user, programId);
  if (!program) throw new Error('Program not found');

  const day = parseDateParam(input.date);
  const data = {
    frontUrl: input.frontUrl?.trim() || null,
    sideUrl: input.sideUrl?.trim() || null,
    backUrl: input.backUrl?.trim() || null
  };

  let result;
  if (input.id) {
    const updated = await prisma.programProgressPhotoSet.update({
      where: { id: input.id },
      data
    });
    result = serializeProgressPhotoSet(updated);
  } else {
    const created = await prisma.programProgressPhotoSet.upsert({
      where: { programId_date: { programId, date: day } },
      create: { programId, date: day, ...data },
      update: { ...data, updatedAt: new Date() }
    });
    result = serializeProgressPhotoSet(created);
  }

  void runProgressionEvaluation(program.userId);
  return result;
}
