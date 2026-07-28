import { ExerciseStatus, ProgramStatus, Visibility, type Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import {
  addUtcDays,
  parseDateParam,
  startOfUtcDay,
  startOfUtcWeek,
  toDateKey,
  userDayKey,
  weekdayIndexFromDate
} from '../utils/dates.js';
import { getActiveProgram, snapshotExercisePlanForDates } from './exerciseService.js';
import { applyTemplateExercisesToDate } from './exerciseTemplateApply.js';
import { ensureDailyLogByUserId } from './dailyLogService.js';
import { recalculateDailyLogTotals } from './totalsService.js';
import { serializeTemplateSummary } from './exerciseTemplateService.js';
import { assertPlanUsable } from './exercisePlanService.js';

const routineInclude = {
  days: {
    orderBy: { weekday: 'asc' as const },
    include: {
      template: { include: { items: true } }
    }
  },
  exercisePlan: {
    select: { id: true, name: true }
  }
} satisfies Prisma.ExerciseRoutineInclude;

export type RoutineDayInput = {
  weekday: number;
  templateId: string | null;
};

function serializeRoutineDay(day: {
  weekday: number;
  templateId: string | null;
  template: {
    id: string;
    name: string;
    description: string | null;
    visibility: Visibility;
    planId?: string | null;
    dayIndex?: number | null;
    createdAt: Date;
    updatedAt: Date;
    items: unknown[];
  } | null;
}) {
  return {
    weekday: day.weekday,
    templateId: day.templateId,
    template: day.template
      ? serializeTemplateSummary({ ...day.template, items: day.template.items })
      : null
  };
}

function serializeRoutine(routine: {
  id: string;
  programId: string;
  exercisePlanId: string | null;
  exercisePlan?: { id: string; name: string } | null;
  days: Parameters<typeof serializeRoutineDay>[0][];
}) {
  return {
    id: routine.id,
    programId: routine.programId,
    exercisePlanId: routine.exercisePlanId,
    exercisePlan: routine.exercisePlan
      ? { id: routine.exercisePlan.id, name: routine.exercisePlan.name }
      : null,
    days: routine.days.map(serializeRoutineDay)
  };
}

async function assertTemplateUsable(templateId: string, userId: string) {
  const template = await prisma.exerciseTemplate.findUnique({ where: { id: templateId } });
  if (!template) throw new Error('Workout not found');
  if (template.visibility !== Visibility.GLOBAL && template.createdById !== userId) {
    throw new Error('Workout not available');
  }
  return template;
}

export async function getRoutineForUser(userId: string) {
  const program = await getActiveProgram(userId);
  if (!program) return null;

  const routine = await prisma.exerciseRoutine.findUnique({
    where: { programId: program.id },
    include: routineInclude
  });
  if (!routine) return null;
  return serializeRoutine(routine);
}

export function resolveTemplateIdForDate(
  days: { weekday: number; templateId: string | null }[],
  date: Date
): string | null | undefined {
  const weekday = weekdayIndexFromDate(date);
  const entry = days.find((day) => day.weekday === weekday);
  if (!entry) return undefined;
  return entry.templateId;
}

/** Dates from today through Sunday of next week (inclusive). */
export function routineApplyForwardDates(fromDate: Date) {
  const today = startOfUtcDay(fromDate);
  const endSunday = addUtcDays(startOfUtcWeek(today), 13);
  const dates: string[] = [];
  for (let cursor = today; cursor <= endSunday; cursor = addUtcDays(cursor, 1)) {
    dates.push(toDateKey(cursor));
  }
  return dates;
}

export async function materializeRoutineDay(
  tx: Prisma.TransactionClient,
  programId: string,
  userId: string,
  date: string,
  templateId: string | null
) {
  const day = parseDateParam(date);

  await tx.scheduledExercise.deleteMany({
    where: { userId, programId, scheduledDate: day }
  });

  if (templateId) {
    await applyTemplateExercisesToDate(tx, templateId, programId, userId, date);
  } else {
    const log = await tx.dailyLog.findUnique({
      where: { userId_date: { userId, date: day } }
    });
    if (log) {
      await tx.dailyLog.update({
        where: { id: log.id },
        data: { exercisesPlanned: 0 }
      });
    }
  }

  const log = await tx.dailyLog.findUnique({
    where: { userId_date: { userId, date: day } }
  });
  if (log) {
    await tx.dailyLog.update({
      where: { id: log.id },
      data: {
        exercisesInitializedAt: new Date(),
        exercisesManuallyEdited: false
      }
    });
    await recalculateDailyLogTotals(log.id, tx);
  }
}

export async function applyRoutineToDateIfNeeded(
  tx: Prisma.TransactionClient,
  programId: string,
  userId: string,
  date: string,
  days: RoutineDayInput[]
) {
  const day = parseDateParam(date);
  const log = await tx.dailyLog.findUnique({
    where: { userId_date: { userId, date: day } }
  });
  if (log?.exercisesInitializedAt) return;

  const templateId = resolveTemplateIdForDate(days, day);
  if (templateId === undefined) return;

  await materializeRoutineDay(tx, programId, userId, date, templateId);
}

export async function applyRoutineForward(
  userId: string,
  days: RoutineDayInput[],
  fromDate: Date
) {
  const program = await getActiveProgram(userId);
  if (!program) throw new Error('No active program found');

  const targetDates = routineApplyForwardDates(fromDate);
  const eligibleDates: string[] = [];

  for (const date of targetDates) {
    const day = parseDateParam(date);
    const log = await prisma.dailyLog.findUnique({
      where: { userId_date: { userId, date: day } },
      select: { exercisesManuallyEdited: true }
    });
    if (log?.exercisesManuallyEdited) continue;

    const loggedWork = await prisma.scheduledExercise.count({
      where: {
        userId,
        scheduledDate: day,
        status: { not: ExerciseStatus.PLANNED }
      }
    });
    if (loggedWork > 0) continue;

    eligibleDates.push(date);
  }

  const undoSnapshot =
    eligibleDates.length > 0 ? await snapshotExercisePlanForDates(userId, eligibleDates) : undefined;

  await prisma.$transaction(async (tx) => {
    for (const date of eligibleDates) {
      const templateId = resolveTemplateIdForDate(days, parseDateParam(date));
      if (templateId === undefined) continue;
      await materializeRoutineDay(tx, program.id, userId, date, templateId);
    }
  });

  return { appliedDays: eligibleDates.length, undoSnapshot };
}

export async function upsertRoutine(
  userId: string,
  dayInputs: RoutineDayInput[],
  options?: { applyForward?: boolean; exercisePlanId?: string | null }
) {
  const program = await getActiveProgram(userId);
  if (!program) throw new Error('No active program found');

  if (dayInputs.length !== 7) throw new Error('Routine must include all 7 weekdays');
  const weekdays = new Set(dayInputs.map((day) => day.weekday));
  if (weekdays.size !== 7 || [...weekdays].some((w) => w < 0 || w > 6)) {
    throw new Error('Invalid weekday assignments');
  }

  const exercisePlanId =
    options?.exercisePlanId === undefined ? undefined : options.exercisePlanId;

  let planDayIds: Set<string> | null = null;
  if (exercisePlanId) {
    const plan = await assertPlanUsable(exercisePlanId, userId);
    planDayIds = new Set(plan.days.map((day) => day.id));
  }

  for (const day of dayInputs) {
    if (!day.templateId) continue;
    const template = await assertTemplateUsable(day.templateId, userId);
    if (planDayIds && !planDayIds.has(template.id)) {
      throw new Error('Workout is not part of the selected exercise plan');
    }
    if (exercisePlanId === null && template.planId) {
      // Custom mode is for loose workouts only — plan day templates need a selected plan.
      throw new Error('Custom routine days cannot use workouts that belong to an exercise plan');
    }
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  const today = parseDateParam(userDayKey(user?.timezone ?? null));

  const routine = await prisma.$transaction(async (tx) => {
    const existing = await tx.exerciseRoutine.findUnique({ where: { programId: program.id } });

    const planData =
      exercisePlanId === undefined ? {} : { exercisePlanId: exercisePlanId };

    const routineRecord = existing
      ? await tx.exerciseRoutine.update({
          where: { id: existing.id },
          data: { updatedAt: new Date(), ...planData }
        })
      : await tx.exerciseRoutine.create({
          data: {
            programId: program.id,
            userId,
            ...(exercisePlanId !== undefined ? { exercisePlanId } : {})
          }
        });

    await tx.exerciseRoutineDay.deleteMany({ where: { routineId: routineRecord.id } });
    await tx.exerciseRoutineDay.createMany({
      data: dayInputs.map((day) => ({
        routineId: routineRecord.id,
        weekday: day.weekday,
        templateId: day.templateId
      }))
    });

    return tx.exerciseRoutine.findUniqueOrThrow({
      where: { id: routineRecord.id },
      include: routineInclude
    });
  });

  const { undoSnapshot } =
    options?.applyForward !== false
      ? await applyRoutineForward(userId, dayInputs, today)
      : { undoSnapshot: undefined };

  const serialized = serializeRoutine(routine);
  return { routine: serialized, undoSnapshot };
}

export async function getRoutineDaysForProgram(programId: string) {
  const routine = await prisma.exerciseRoutine.findUnique({
    where: { programId },
    include: { days: true }
  });
  return routine?.days ?? null;
}

export async function isRoutineRestDay(userId: string, date: string) {
  const program = await getActiveProgram(userId);
  if (!program) return false;

  const days = await getRoutineDaysForProgram(program.id);
  if (!days?.length) return false;

  const templateId = resolveTemplateIdForDate(days, parseDateParam(date));
  return templateId === null;
}

export async function markExercisesManuallyEdited(userId: string, date: string) {
  const log = await ensureDailyLogByUserId(userId, date);
  if (!log) return;
  await prisma.dailyLog.update({
    where: { id: log.id },
    data: {
      exercisesManuallyEdited: true,
      exercisesInitializedAt: log.exercisesInitializedAt ?? new Date()
    }
  });
}
