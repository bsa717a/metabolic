import { ExerciseStatus, ProgramStatus } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { parseDateParam, toDateKey } from '../utils/dates.js';
import { ensureDailyLogByUserId } from './dailyLogService.js';
import { recalculateDailyLogTotals } from './totalsService.js';

export async function getActiveProgram(userId: string) {
  return prisma.program.findFirst({
    where: { userId, status: ProgramStatus.ACTIVE }
  });
}

async function recalculateForDate(userId: string, date: string) {
  const day = parseDateParam(date);
  const log = await prisma.dailyLog.findUnique({
    where: { userId_date: { userId, date: day } }
  });
  if (log) await recalculateDailyLogTotals(log.id);
}

export async function getExercises() {
  return prisma.exercise.findMany({ orderBy: { name: 'asc' } });
}

const completedExerciseStatuses = new Set<ExerciseStatus>(['DONE', 'SKIPPED', 'MISSED']);

export function sortScheduledExercises<T extends { status: ExerciseStatus; sortOrder: number }>(items: T[]) {
  return [...items].sort((a, b) => {
    const aCompleted = completedExerciseStatuses.has(a.status);
    const bCompleted = completedExerciseStatuses.has(b.status);
    if (aCompleted !== bCompleted) return aCompleted ? 1 : -1;
    return a.sortOrder - b.sortOrder;
  });
}

async function nextSortOrder(userId: string, date: string) {
  const maxOrder = await prisma.scheduledExercise.aggregate({
    where: { userId, scheduledDate: parseDateParam(date) },
    _max: { sortOrder: true }
  });
  return (maxOrder._max.sortOrder ?? -1) + 1;
}

export async function getScheduledExercises(userId: string, date: string) {
  const items = await prisma.scheduledExercise.findMany({
    where: { userId, scheduledDate: parseDateParam(date) },
    include: { exercise: true, log: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
  });
  return sortScheduledExercises(items);
}

export async function ensureExercisesForDate(userId: string, date: string) {
  const log = await ensureDailyLogByUserId(userId, date);
  if (!log) return null;
  return getScheduledExercises(userId, date);
}

const scheduleFields = {
  sets: (value: unknown) => (value === null || value === undefined ? null : Number(value)),
  reps: (value: unknown) => (value === null || value === undefined ? null : Number(value)),
  durationMinutes: (value: unknown) => (value === null || value === undefined ? null : Number(value)),
  distance: (value: unknown) => (value === null || value === undefined ? null : value),
  weight: (value: unknown) => (value === null || value === undefined ? null : value)
};

export async function createScheduledExercise(
  userId: string,
  date: string,
  data: {
    exerciseId: string;
    sets?: number | null;
    reps?: number | null;
    durationMinutes?: number | null;
    distance?: number | null;
    weight?: number | null;
    description?: string | null;
    category?: string | null;
    bodyPart?: string | null;
  }
) {
  const program = await getActiveProgram(userId);
  if (!program) throw new Error('No active program found');

  const catalog = await prisma.exercise.findUniqueOrThrow({ where: { id: data.exerciseId } });

  const catalogUpdates: { description?: string | null; category?: string | null; bodyPart?: string | null } = {};
  if (data.description !== undefined) catalogUpdates.description = data.description?.trim() || null;
  if (data.category !== undefined) catalogUpdates.category = data.category?.trim() || null;
  if (data.bodyPart !== undefined) catalogUpdates.bodyPart = data.bodyPart?.trim() || null;
  if (Object.keys(catalogUpdates).length) {
    await prisma.exercise.update({ where: { id: data.exerciseId }, data: catalogUpdates });
  }

  const scheduled = await prisma.scheduledExercise.create({
    data: {
      programId: program.id,
      userId,
      exerciseId: data.exerciseId,
      scheduledDate: parseDateParam(date),
      sets: data.sets ?? catalog.defaultSets,
      reps: data.reps ?? catalog.defaultReps,
      durationMinutes: data.durationMinutes ?? catalog.defaultDurationMinutes,
      distance: data.distance ?? catalog.defaultDistance,
      weight: data.weight ?? null,
      status: ExerciseStatus.PLANNED,
      sortOrder: await nextSortOrder(userId, date)
    },
    include: { exercise: true, log: true }
  });

  await recalculateForDate(userId, date);
  return scheduled;
}

export async function updateScheduledExercise(
  userId: string,
  id: string,
  data: Partial<{
    sets: number | null;
    reps: number | null;
    durationMinutes: number | null;
    distance: number | null;
    weight: number | null;
    description: string | null;
    category: string | null;
    bodyPart: string | null;
  }>
) {
  const existing = await prisma.scheduledExercise.findFirstOrThrow({ where: { id, userId } });

  const catalogUpdates: { description?: string | null; category?: string | null; bodyPart?: string | null } = {};
  if (data.description !== undefined) catalogUpdates.description = data.description?.trim() || null;
  if (data.category !== undefined) catalogUpdates.category = data.category?.trim() || null;
  if (data.bodyPart !== undefined) catalogUpdates.bodyPart = data.bodyPart?.trim() || null;
  if (Object.keys(catalogUpdates).length) {
    await prisma.exercise.update({ where: { id: existing.exerciseId }, data: catalogUpdates });
  }

  const scheduled = await prisma.scheduledExercise.update({
    where: { id },
    data: {
      ...(data.sets !== undefined ? { sets: scheduleFields.sets(data.sets) } : {}),
      ...(data.reps !== undefined ? { reps: scheduleFields.reps(data.reps) } : {}),
      ...(data.durationMinutes !== undefined ? { durationMinutes: scheduleFields.durationMinutes(data.durationMinutes) } : {}),
      ...(data.distance !== undefined ? { distance: scheduleFields.distance(data.distance) } : {}),
      ...(data.weight !== undefined ? { weight: scheduleFields.weight(data.weight) } : {})
    },
    include: { exercise: true, log: true }
  });
  await recalculateForDate(userId, toDateKey(existing.scheduledDate));
  return scheduled;
}

export async function deleteScheduledExercise(userId: string, id: string) {
  const existing = await prisma.scheduledExercise.findFirstOrThrow({ where: { id, userId } });
  await prisma.scheduledExercise.delete({ where: { id } });
  await recalculateForDate(userId, toDateKey(existing.scheduledDate));
  return { ok: true };
}

async function copyExercisesToDate(
  userId: string,
  programId: string,
  targetDate: Date,
  sourceExercises: Awaited<ReturnType<typeof getScheduledExercises>>,
  replace: boolean
) {
  if (replace) {
    await prisma.scheduledExercise.deleteMany({
      where: { userId, programId, scheduledDate: targetDate }
    });
  }

  if (!sourceExercises.length) return [];

  await prisma.scheduledExercise.createMany({
    data: sourceExercises.map((item) => ({
      programId,
      userId,
      exerciseId: item.exerciseId,
      scheduledDate: targetDate,
      sets: item.sets,
      reps: item.reps,
      durationMinutes: item.durationMinutes,
      distance: item.distance,
      weight: item.weight,
      status: ExerciseStatus.PLANNED,
      sortOrder: item.sortOrder
    }))
  });

  return getScheduledExercises(userId, toDateKey(targetDate));
}

export async function copyExercisesFromDate(
  userId: string,
  targetDate: string,
  sourceDate: string,
  options: { replace?: boolean } = {}
) {
  const program = await getActiveProgram(userId);
  if (!program) throw new Error('No active program found');

  const source = await getScheduledExercises(userId, sourceDate);
  if (!source.length) throw new Error(`No exercises found on ${sourceDate}`);

  await ensureDailyLogByUserId(userId, targetDate);
  const result = await copyExercisesToDate(
    userId,
    program.id,
    parseDateParam(targetDate),
    source,
    options.replace ?? true
  );
  await recalculateForDate(userId, targetDate);
  return result;
}

export async function copyExercisesFromPreviousDay(userId: string, targetDate: string) {
  const program = await getActiveProgram(userId);
  if (!program) throw new Error('No active program found');

  const target = parseDateParam(targetDate);
  const prior = await prisma.scheduledExercise.findFirst({
    where: { userId, programId: program.id, scheduledDate: { lt: target } },
    orderBy: { scheduledDate: 'desc' }
  });

  if (!prior) throw new Error('No prior day with exercises to copy');

  return copyExercisesFromDate(userId, targetDate, toDateKey(prior.scheduledDate), { replace: true });
}

export async function toggleSkipScheduledExercise(userId: string, id: string) {
  const existing = await prisma.scheduledExercise.findFirstOrThrow({ where: { id, userId } });
  if (existing.status === ExerciseStatus.SKIPPED) {
    return markScheduledExercise(userId, id, ExerciseStatus.PLANNED);
  }
  if (existing.status === ExerciseStatus.PLANNED) {
    return markScheduledExercise(userId, id, ExerciseStatus.SKIPPED);
  }
  throw new Error('Only planned exercises can be skipped');
}

export async function markScheduledExercise(userId: string, id: string, status: ExerciseStatus) {
  const existing = await prisma.scheduledExercise.findFirstOrThrow({ where: { id, userId } });
  const scheduled = await prisma.scheduledExercise.update({
    where: { id },
    data: { status },
    include: { exercise: true, log: true }
  });
  await recalculateForDate(userId, toDateKey(existing.scheduledDate));
  return scheduled;
}

export async function markDone(userId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.scheduledExercise.findFirstOrThrow({ where: { id, userId } });
    const scheduled = await tx.scheduledExercise.update({
      where: { id },
      data: { status: ExerciseStatus.DONE },
      include: { exercise: true, log: true }
    });
    await tx.exerciseLog.upsert({
      where: { scheduledExerciseId: id },
      update: { completed: true, completedAt: new Date() },
      create: { scheduledExerciseId: id, userId, completed: true, completedAt: new Date() }
    });
    const log = await tx.dailyLog.findUnique({
      where: { userId_date: { userId, date: existing.scheduledDate } }
    });
    if (log) await recalculateDailyLogTotals(log.id, tx);
    return scheduled;
  });
}

export async function markAllPlannedExercisesDone(userId: string, date: string) {
  const planned = await getScheduledExercises(userId, date);
  const toComplete = planned.filter((item) => item.status === ExerciseStatus.PLANNED);
  for (const item of toComplete) {
    await markDone(userId, item.id);
  }
  return toComplete.map((item) => item.exercise.name);
}

export async function reorderScheduledExercises(userId: string, date: string, orderedIds: string[]) {
  const day = parseDateParam(date);
  const items = await prisma.scheduledExercise.findMany({
    where: { userId, scheduledDate: day },
    select: { id: true, status: true, sortOrder: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
  });

  const planned = items.filter((item) => item.status === ExerciseStatus.PLANNED);
  const completed = items.filter((item) => item.status !== ExerciseStatus.PLANNED);
  const plannedIds = new Set(planned.map((item) => item.id));

  if (orderedIds.length !== planned.length || orderedIds.some((id) => !plannedIds.has(id))) {
    throw new Error('Invalid exercise order');
  }

  await prisma.$transaction([
    ...orderedIds.map((id, index) =>
      prisma.scheduledExercise.update({ where: { id }, data: { sortOrder: index } })
    ),
    ...completed.map((item, index) =>
      prisma.scheduledExercise.update({
        where: { id: item.id },
        data: { sortOrder: orderedIds.length + index }
      })
    )
  ]);

  return getScheduledExercises(userId, date);
}
