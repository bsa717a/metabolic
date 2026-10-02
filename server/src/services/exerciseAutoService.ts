import { randomUUID } from 'node:crypto';
import {
  ExerciseStatus,
  Visibility,
  type ExerciseAutoLevel,
  type ExerciseAutoLocation,
  type ExercisePageMode
} from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { parseDateParam, toDateKey } from '../utils/dates.js';
import { getActiveProgram } from './exerciseService.js';
import { ensureDailyLogByUserId } from './dailyLogService.js';
import { applyTemplateExercisesToDate } from './exerciseTemplateApply.js';
import {
  applyCheckIn,
  buildAutoView,
  buildTrackCatalog,
  initialProgress,
  progressEquals,
  type AutoChoice,
  type AutoLevel,
  type AutoLocation,
  type AutoPlanInput,
  type AutoProgress,
  type AutoTrackView
} from './exerciseAutoTrack.js';

export class ExerciseAutoError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export type ExerciseAutoResponse = {
  mode: 'MANUAL' | 'AUTOMATIC';
  location: AutoLocation;
  level: AutoLevel;
  track: AutoTrackView | null;
};

function num(value: unknown): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateKey(value: Date | null): string | null {
  return value ? toDateKey(value) : null;
}

function dbDate(value: string | null) {
  return value ? parseDateParam(value) : null;
}

async function loadPlans(): Promise<AutoPlanInput[]> {
  const plans = await prisma.exercisePlan.findMany({
    where: { visibility: Visibility.GLOBAL },
    include: {
      days: {
        include: {
          items: {
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            include: { exercise: { select: { name: true, bodyPart: true, requiresGym: true } } }
          }
        }
      }
    }
  });

  return plans.map((plan) => ({
    id: plan.id,
    name: plan.name,
    days: plan.days.map((day) => ({
      id: day.id,
      name: day.name,
      dayIndex: day.dayIndex,
      items: day.items.map((item) => ({
        id: item.id,
        sortOrder: item.sortOrder,
        sets: item.sets,
        reps: item.reps,
        speed: item.speed,
        durationSeconds: item.durationSeconds,
        distance: num(item.distance),
        weight: num(item.weight),
        exerciseName: item.exercise.name,
        bodyPart: item.exercise.bodyPart,
        requiresGym: item.exercise.requiresGym
      }))
    }))
  }));
}

async function syncAutoTracks(plans: AutoPlanInput[]) {
  const catalog = buildTrackCatalog(plans);
  const desired = catalog.flatMap((track) =>
    track.blocks.map((block, blockIndex) => ({
      location: track.location,
      level: track.level,
      blockIndex,
      planId: block.planId
    }))
  );
  const existing = await prisma.exerciseAutoTrackBlock.findMany({
    select: { location: true, level: true, blockIndex: true, planId: true }
  });
  const key = (row: { location: string; level: string; blockIndex: number; planId: string }) =>
    `${row.location}|${row.level}|${row.blockIndex}|${row.planId}`;
  const same =
    desired.length === existing.length &&
    desired.map(key).sort().join('\n') === existing.map(key).sort().join('\n');
  if (!same) {
    await prisma.$transaction(async (tx) => {
      await tx.exerciseAutoTrackBlock.deleteMany();
      if (desired.length) {
        await tx.exerciseAutoTrackBlock.createMany({
          data: desired.map((row) => ({ ...row, id: randomUUID(), updatedAt: new Date() }))
        });
      }
    });
  }
  return catalog;
}

function fromRow(row: {
  blockIndex: number;
  weekIndex: number;
  dayIndex: number;
  weekStartedOn: Date | null;
  dayCompletedOn: Date | null;
  pendingCheckIn: AutoProgress['pendingCheckIn'];
  appliedOn: Date | null;
  appliedTemplateId: string | null;
}): AutoProgress {
  return {
    blockIndex: row.blockIndex,
    weekIndex: row.weekIndex,
    dayIndex: row.dayIndex,
    weekStartedOn: dateKey(row.weekStartedOn),
    dayCompletedOn: dateKey(row.dayCompletedOn),
    pendingCheckIn: row.pendingCheckIn,
    appliedOn: dateKey(row.appliedOn),
    appliedTemplateId: row.appliedTemplateId
  };
}

async function readProgress(userId: string, location: AutoLocation, level: AutoLevel) {
  const row = await prisma.userExerciseAutoProgress.findUnique({
    where: { userId_location_level: { userId, location, level } }
  });
  return row ? fromRow(row) : null;
}

async function writeProgress(userId: string, location: AutoLocation, level: AutoLevel, progress: AutoProgress) {
  const data = {
    blockIndex: progress.blockIndex,
    weekIndex: progress.weekIndex,
    dayIndex: progress.dayIndex,
    weekStartedOn: dbDate(progress.weekStartedOn),
    dayCompletedOn: dbDate(progress.dayCompletedOn),
    pendingCheckIn: progress.pendingCheckIn,
    appliedOn: dbDate(progress.appliedOn),
    appliedTemplateId: progress.appliedTemplateId
  };
  await prisma.userExerciseAutoProgress.upsert({
    where: { userId_location_level: { userId, location, level } },
    create: { userId, location, level, ...data },
    update: data
  });
}

async function todayWorkoutComplete(
  userId: string,
  today: string,
  progress: AutoProgress,
  templateId: string | undefined
) {
  if (!templateId || progress.appliedOn !== today || progress.appliedTemplateId !== templateId) return false;
  const items = await prisma.scheduledExercise.findMany({
    where: { userId, scheduledDate: parseDateParam(today) },
    select: { status: true }
  });
  return items.length > 0 && items.every((item) => item.status === ExerciseStatus.DONE);
}

async function resolveTrack(userId: string, location: AutoLocation, level: AutoLevel, today: string) {
  const plans = await loadPlans();
  const catalog = await syncAutoTracks(plans);
  const blocks = catalog.find((track) => track.location === location && track.level === level)?.blocks ?? [];
  const existing = await readProgress(userId, location, level);
  const stored = existing ?? initialProgress(today);
  const block = blocks[Math.min(stored.blockIndex, Math.max(blocks.length - 1, 0))];
  const day = block?.days[stored.dayIndex];
  const complete = await todayWorkoutComplete(userId, today, stored, day?.id);
  const built = buildAutoView({
    blocks,
    progress: stored,
    today,
    todayWorkoutComplete: complete
  });
  if (!existing || !progressEquals(stored, built.progress)) {
    await writeProgress(userId, location, level, built.progress);
  }
  return { blocks, progress: built.progress, track: built.track };
}

async function readSetting(userId: string) {
  const setting = await prisma.userExerciseAutoSetting.findUnique({ where: { userId } });
  return {
    mode: (setting?.mode ?? 'MANUAL') as 'MANUAL' | 'AUTOMATIC',
    location: (setting?.location ?? 'GYM') as AutoLocation,
    level: (setting?.level ?? 'BEGINNER') as AutoLevel
  };
}

export async function getExerciseAuto(userId: string, today: string): Promise<ExerciseAutoResponse> {
  const setting = await readSetting(userId);
  if (setting.mode !== 'AUTOMATIC') return { ...setting, mode: 'MANUAL', track: null };
  const { track } = await resolveTrack(userId, setting.location, setting.level, today);
  return { ...setting, mode: 'AUTOMATIC', track };
}

export async function updateExerciseAuto(
  userId: string,
  today: string,
  patch: { mode?: ExercisePageMode; location?: ExerciseAutoLocation; level?: ExerciseAutoLevel }
): Promise<ExerciseAutoResponse> {
  const current = await readSetting(userId);
  const mode = patch.mode ?? current.mode;
  const location = (patch.location ?? current.location) as AutoLocation;
  const level = (patch.level ?? current.level) as AutoLevel;
  await prisma.userExerciseAutoSetting.upsert({
    where: { userId },
    create: { userId, mode, location, level },
    update: { mode, location, level }
  });
  if (mode !== 'AUTOMATIC') return { mode: 'MANUAL', location, level, track: null };
  const { track } = await resolveTrack(userId, location, level, today);
  return { mode: 'AUTOMATIC', location, level, track };
}

export async function answerExerciseAutoCheckIn(
  userId: string,
  today: string,
  choice: AutoChoice
): Promise<ExerciseAutoResponse> {
  const setting = await readSetting(userId);
  if (setting.mode !== 'AUTOMATIC') throw new ExerciseAutoError('Switch to Automatic before answering');
  const { blocks, progress } = await resolveTrack(userId, setting.location, setting.level, today);
  const answered = applyCheckIn(progress, choice, today, Math.max(blocks.length, 1));
  const built = buildAutoView({
    blocks,
    progress: answered,
    today,
    todayWorkoutComplete: false
  });
  await writeProgress(userId, setting.location, setting.level, built.progress);
  return { ...setting, mode: 'AUTOMATIC', track: built.track };
}

export async function startExerciseAutoWorkout(userId: string, today: string) {
  const state = await getExerciseAuto(userId, today);
  const todayPlan = state.track?.today;
  if (state.mode !== 'AUTOMATIC' || !state.track || state.track.empty || !todayPlan || !state.track.scheme) {
    throw new ExerciseAutoError('No automatic workout is available');
  }
  if (state.track.pendingCheckIn !== 'NONE') {
    throw new ExerciseAutoError('Answer the check-in before starting');
  }
  if (todayPlan.complete) throw new ExerciseAutoError("Today's workout is already complete");

  const program = await getActiveProgram(userId);
  if (!program) throw new ExerciseAutoError('No active program found');
  const log = await ensureDailyLogByUserId(userId, today);
  if (!log) throw new ExerciseAutoError('No active program found');

  const progress = (await readProgress(userId, state.location, state.level)) ?? initialProgress(today);
  if (progress.appliedOn === today && progress.appliedTemplateId === todayPlan.templateId) {
    const count = await prisma.scheduledExercise.count({
      where: { userId, scheduledDate: parseDateParam(today) }
    });
    if (count > 0) return { date: today };
  }

  const plans = await loadPlans();
  const day = plans.flatMap((plan) => plan.days).find((entry) => entry.id === todayPlan.templateId);
  if (!day) throw new ExerciseAutoError('That workout is no longer on a plan');
  const scheme = state.track.scheme;
  const overrides = new Map(
    day.items
      .filter((item) => item.reps != null && item.reps.trim() !== '')
      .map((item) => [item.id, { reps: scheme }] as const)
  );

  await prisma.$transaction(async (tx) => {
    await applyTemplateExercisesToDate(tx, todayPlan.templateId, program.id, userId, today, overrides);
  });

  await writeProgress(userId, state.location, state.level, {
    ...progress,
    appliedOn: today,
    appliedTemplateId: todayPlan.templateId
  });
  return { date: today };
}
