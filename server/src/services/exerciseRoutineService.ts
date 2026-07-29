import { ExerciseStatus, Visibility, type Prisma } from '@prisma/client';
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
import {
  applyTemplateExercisesToDate,
  type TemplateItemPrescriptionOverride
} from './exerciseTemplateApply.js';
import { ensureDailyLogByUserId } from './dailyLogService.js';
import { recalculateDailyLogTotals } from './totalsService.js';
import { normalizeRepScheme } from '../utils/repSchemes.js';
import { normalizeSpeedScheme } from '../utils/speedSchemes.js';
import { serializeTemplateSummary } from './exerciseTemplateService.js';
import { assertPlanUsable } from './exercisePlanService.js';

const routineInclude = {
  days: {
    orderBy: { weekday: 'asc' as const },
    include: {
      template: { include: { items: true } },
      itemOverrides: true
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

export type RoutineDayItemOverrideInput = {
  sets?: number | null;
  reps?: string | number | null;
  speed?: string | number | null;
  durationMinutes?: number | null;
  distance?: number | null;
  weight?: number | null;
};

function serializeItemOverride(item: {
  templateItemId: string;
  sets: number | null;
  reps: string | null;
  speed: string | null;
  durationMinutes: number | null;
  distance: unknown;
  weight: unknown;
}) {
  return {
    templateItemId: item.templateItemId,
    sets: item.sets,
    reps: item.reps,
    speed: item.speed,
    durationMinutes: item.durationMinutes,
    distance: item.distance == null ? null : Number(item.distance),
    weight: item.weight == null ? null : Number(item.weight)
  };
}

function serializeRoutineDay(day: {
  id: string;
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
  itemOverrides: Parameters<typeof serializeItemOverride>[0][];
}) {
  return {
    id: day.id,
    weekday: day.weekday,
    templateId: day.templateId,
    template: day.template
      ? serializeTemplateSummary({ ...day.template, items: day.template.items })
      : null,
    itemOverrides: day.itemOverrides.map(serializeItemOverride)
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

function overridesToMap(
  items: {
    templateItemId: string;
    sets: number | null;
    reps: string | null;
    speed: string | null;
    durationMinutes: number | null;
    distance: unknown;
    weight: unknown;
  }[]
): Map<string, TemplateItemPrescriptionOverride> {
  return new Map(
    items.map((item) => [
      item.templateItemId,
      {
        sets: item.sets,
        reps: item.reps,
        speed: item.speed,
        durationMinutes: item.durationMinutes,
        distance: item.distance == null ? null : Number(item.distance),
        weight: item.weight == null ? null : Number(item.weight)
      }
    ])
  );
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

async function loadOverridesForProgramWeekday(
  tx: Prisma.TransactionClient,
  programId: string,
  weekday: number
) {
  const routine = await tx.exerciseRoutine.findUnique({
    where: { programId },
    select: {
      days: {
        where: { weekday },
        select: { itemOverrides: true }
      }
    }
  });
  const day = routine?.days[0];
  if (!day) return undefined;
  return overridesToMap(day.itemOverrides);
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
    const weekday = weekdayIndexFromDate(day);
    const overrides = await loadOverridesForProgramWeekday(tx, programId, weekday);
    await applyTemplateExercisesToDate(tx, templateId, programId, userId, date, overrides);
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

async function collectEligibleForwardDates(userId: string, fromDate: Date, weekdayFilter?: number) {
  const targetDates = routineApplyForwardDates(fromDate);
  const eligibleDates: string[] = [];

  for (const date of targetDates) {
    const day = parseDateParam(date);
    if (weekdayFilter != null && weekdayIndexFromDate(day) !== weekdayFilter) continue;

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

  return eligibleDates;
}

export async function applyRoutineForward(
  userId: string,
  days: RoutineDayInput[],
  fromDate: Date,
  options?: { weekdayFilter?: number }
) {
  const program = await getActiveProgram(userId);
  if (!program) throw new Error('No active program found');

  const eligibleDates = await collectEligibleForwardDates(userId, fromDate, options?.weekdayFilter);

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
    const existing = await tx.exerciseRoutine.findUnique({
      where: { programId: program.id },
      include: { days: true }
    });

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

    const existingByWeekday = new Map((existing?.days ?? []).map((day) => [day.weekday, day]));

    for (const day of dayInputs) {
      const prior = existingByWeekday.get(day.weekday);
      if (prior) {
        if (prior.templateId !== day.templateId) {
          await tx.exerciseRoutineDayItem.deleteMany({ where: { routineDayId: prior.id } });
        }
        await tx.exerciseRoutineDay.update({
          where: { id: prior.id },
          data: { templateId: day.templateId }
        });
      } else {
        await tx.exerciseRoutineDay.create({
          data: {
            routineId: routineRecord.id,
            weekday: day.weekday,
            templateId: day.templateId
          }
        });
      }
    }

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

export async function upsertRoutineDayItemOverride(
  userId: string,
  weekday: number,
  templateItemId: string,
  patch: RoutineDayItemOverrideInput
) {
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    throw new Error('Invalid weekday');
  }
  if (!Object.keys(patch).length) {
    throw new Error('At least one field is required');
  }

  const program = await getActiveProgram(userId);
  if (!program) throw new Error('No active program found');

  const routine = await prisma.exerciseRoutine.findUnique({
    where: { programId: program.id },
    include: {
      days: {
        where: { weekday },
        include: { itemOverrides: true }
      }
    }
  });
  if (!routine) throw new Error('Weekly routine not found — save your routine first');

  const routineDay = routine.days[0];
  if (!routineDay?.templateId) {
    throw new Error('That weekday is a rest day');
  }

  const templateItem = await prisma.exerciseTemplateItem.findUnique({
    where: { id: templateItemId }
  });
  if (!templateItem || templateItem.templateId !== routineDay.templateId) {
    throw new Error("Exercise is not part of this weekday's workout");
  }

  const existing = routineDay.itemOverrides.find((item) => item.templateItemId === templateItemId);
  const base = existing
    ? {
        sets: existing.sets,
        reps: existing.reps,
        speed: existing.speed,
        durationMinutes: existing.durationMinutes,
        distance: existing.distance == null ? null : Number(existing.distance),
        weight: existing.weight == null ? null : Number(existing.weight)
      }
    : {
        sets: templateItem.sets,
        reps: templateItem.reps,
        speed: templateItem.speed,
        durationMinutes: templateItem.durationMinutes,
        distance: templateItem.distance == null ? null : Number(templateItem.distance),
        weight: templateItem.weight == null ? null : Number(templateItem.weight)
      };

  const next = {
    sets: patch.sets !== undefined ? patch.sets : base.sets,
    reps: patch.reps !== undefined ? normalizeRepScheme(patch.reps) : base.reps,
    speed: patch.speed !== undefined ? normalizeSpeedScheme(patch.speed) : base.speed,
    durationMinutes: patch.durationMinutes !== undefined ? patch.durationMinutes : base.durationMinutes,
    distance: patch.distance !== undefined ? patch.distance : base.distance,
    weight: patch.weight !== undefined ? patch.weight : base.weight
  };

  const override = await prisma.exerciseRoutineDayItem.upsert({
    where: {
      routineDayId_templateItemId: {
        routineDayId: routineDay.id,
        templateItemId
      }
    },
    create: {
      routineDayId: routineDay.id,
      templateItemId,
      ...next
    },
    update: next
  });

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  const today = parseDateParam(userDayKey(user?.timezone ?? null));
  const days = await getRoutineDaysForProgram(program.id);
  const dayInputs: RoutineDayInput[] = (days ?? []).map((day) => ({
    weekday: day.weekday,
    templateId: day.templateId
  }));

  const { undoSnapshot, appliedDays } = await applyRoutineForward(userId, dayInputs, today, {
    weekdayFilter: weekday
  });

  return {
    override: serializeItemOverride(override),
    appliedDays,
    undoSnapshot
  };
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
