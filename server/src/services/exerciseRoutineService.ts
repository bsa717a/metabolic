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
import { type TemplateItemPrescriptionOverride } from './exerciseTemplateApply.js';
import { ensureDailyLogByUserId } from './dailyLogService.js';
import { recalculateDailyLogTotals } from './totalsService.js';
import { normalizeRepScheme } from '../utils/repSchemes.js';
import { normalizeSpeedScheme } from '../utils/speedSchemes.js';
import { serializeTemplateSummary } from './exerciseTemplateService.js';
import { assertPlanUsable } from './exercisePlanService.js';
import {
  catalogDefaultsToPrescription,
  composeRoutineDayExercises,
  removalEmptiesRoutineDay,
  routineDateKeepsManualEdits,
  routineWeekdayIsRest,
  type RoutineExtraSnapshot,
  type RoutineTemplateItemSnapshot
} from './exerciseRoutineDayEdits.js';

const routineDayInclude = {
  template: { include: { items: true } },
  itemOverrides: true,
  exclusions: true,
  extras: {
    orderBy: { sortOrder: 'asc' as const },
    include: { exercise: { select: { id: true, name: true } } }
  }
} satisfies Prisma.ExerciseRoutineDayInclude;

const routineInclude = {
  days: {
    orderBy: { weekday: 'asc' as const },
    include: routineDayInclude
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
  durationSeconds?: number | null;
  distance?: number | null;
  weight?: number | null;
};

function serializeItemOverride(item: {
  templateItemId: string;
  sets: number | null;
  reps: string | null;
  speed: string | null;
  durationSeconds: number | null;
  distance: unknown;
  weight: unknown;
}) {
  return {
    templateItemId: item.templateItemId,
    sets: item.sets,
    reps: item.reps,
    speed: item.speed,
    durationSeconds: item.durationSeconds,
    distance: item.distance == null ? null : Number(item.distance),
    weight: item.weight == null ? null : Number(item.weight)
  };
}

function serializeExtra(extra: {
  id: string;
  exerciseId: string;
  sortOrder: number;
  sets: number | null;
  reps: string | null;
  speed: string | null;
  durationSeconds: number | null;
  distance: unknown;
  weight: unknown;
  exercise: { id: string; name: string };
}) {
  return {
    id: extra.id,
    exerciseId: extra.exerciseId,
    sortOrder: extra.sortOrder,
    sets: extra.sets,
    reps: extra.reps,
    speed: extra.speed,
    durationSeconds: extra.durationSeconds,
    distance: extra.distance == null ? null : Number(extra.distance),
    weight: extra.weight == null ? null : Number(extra.weight),
    exercise: { id: extra.exercise.id, name: extra.exercise.name }
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
  exclusions: { templateItemId: string }[];
  extras: Parameters<typeof serializeExtra>[0][];
}) {
  return {
    id: day.id,
    weekday: day.weekday,
    templateId: day.templateId,
    template: day.template
      ? serializeTemplateSummary({ ...day.template, items: day.template.items })
      : null,
    itemOverrides: day.itemOverrides.map(serializeItemOverride),
    excludedTemplateItemIds: day.exclusions.map((entry) => entry.templateItemId),
    extras: day.extras.map(serializeExtra)
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
    durationSeconds: number | null;
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
        durationSeconds: item.durationSeconds,
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

function templateItemsToSnapshots(
  items: {
    id: string;
    exerciseId: string;
    sortOrder: number;
    sets: number | null;
    reps: string | null;
    speed: string | null;
    durationSeconds: number | null;
    distance: unknown;
    weight: unknown;
  }[]
): RoutineTemplateItemSnapshot[] {
  return items.map((item) => ({
    id: item.id,
    exerciseId: item.exerciseId,
    sortOrder: item.sortOrder,
    sets: item.sets,
    reps: item.reps,
    speed: item.speed,
    durationSeconds: item.durationSeconds,
    distance: item.distance == null ? null : Number(item.distance),
    weight: item.weight == null ? null : Number(item.weight)
  }));
}

function extrasToSnapshots(
  extras: {
    id: string;
    exerciseId: string;
    sortOrder: number;
    sets: number | null;
    reps: string | null;
    speed: string | null;
    durationSeconds: number | null;
    distance: unknown;
    weight: unknown;
  }[]
): RoutineExtraSnapshot[] {
  return extras.map((extra) => ({
    id: extra.id,
    exerciseId: extra.exerciseId,
    sortOrder: extra.sortOrder,
    sets: extra.sets,
    reps: extra.reps,
    speed: extra.speed,
    durationSeconds: extra.durationSeconds,
    distance: extra.distance == null ? null : Number(extra.distance),
    weight: extra.weight == null ? null : Number(extra.weight)
  }));
}

async function loadWeekdayComposition(
  tx: Prisma.TransactionClient,
  programId: string,
  weekday: number
) {
  const routine = await tx.exerciseRoutine.findUnique({
    where: { programId },
    select: {
      days: {
        where: { weekday },
        select: {
          templateId: true,
          itemOverrides: true,
          exclusions: { select: { templateItemId: true } },
          extras: true
        }
      }
    }
  });
  return routine?.days[0] ?? null;
}

export async function materializeRoutineDay(
  tx: Prisma.TransactionClient,
  programId: string,
  userId: string,
  date: string,
  templateId: string | null
) {
  const day = parseDateParam(date);
  const weekday = weekdayIndexFromDate(day);
  const composition = await loadWeekdayComposition(tx, programId, weekday);
  const dayEdits = composition && composition.templateId === templateId ? composition : null;

  await tx.scheduledExercise.deleteMany({
    where: { userId, programId, scheduledDate: day }
  });

  let templateItems: RoutineTemplateItemSnapshot[] = [];
  if (templateId) {
    const template = await tx.exerciseTemplate.findUniqueOrThrow({
      where: { id: templateId },
      include: {
        items: {
          orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }]
        }
      }
    });
    templateItems = templateItemsToSnapshots(template.items);
  }

  const composed = composeRoutineDayExercises({
    templateItems,
    excludedTemplateItemIds: dayEdits?.exclusions.map((entry) => entry.templateItemId) ?? [],
    overridesByTemplateItemId: dayEdits ? overridesToMap(dayEdits.itemOverrides) : undefined,
    extras: dayEdits ? extrasToSnapshots(dayEdits.extras) : []
  });

  if (composed.length) {
    await tx.scheduledExercise.createMany({
      data: composed.map((item) => ({
        programId,
        userId,
        exerciseId: item.exerciseId,
        scheduledDate: day,
        sets: item.sets,
        reps: item.reps,
        speed: item.speed,
        durationSeconds: item.durationSeconds,
        distance: item.distance,
        weight: item.weight,
        status: ExerciseStatus.PLANNED,
        sortOrder: item.sortOrder
      }))
    });
  }

  const log = await tx.dailyLog.findUnique({
    where: { userId_date: { userId, date: day } }
  });
  if (log) {
    await tx.dailyLog.update({
      where: { id: log.id },
      data: {
        exercisesPlanned: composed.length,
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
    const loggedWork = await prisma.scheduledExercise.count({
      where: {
        userId,
        scheduledDate: day,
        status: { not: ExerciseStatus.PLANNED }
      }
    });
    if (
      routineDateKeepsManualEdits({
        exercisesManuallyEdited: log?.exercisesManuallyEdited,
        loggedWorkCount: loggedWork
      })
    ) {
      continue;
    }

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
  options?: { applyForward?: boolean; exercisePlanId?: string | null; resetDayEdits?: boolean }
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
        if (prior.templateId !== day.templateId || options?.resetDayEdits) {
          await tx.exerciseRoutineDayItem.deleteMany({ where: { routineDayId: prior.id } });
          await tx.exerciseRoutineDayExclusion.deleteMany({ where: { routineDayId: prior.id } });
          await tx.exerciseRoutineDayExtra.deleteMany({ where: { routineDayId: prior.id } });
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

type OverrideBase = {
  sets: number | null;
  reps: string | null;
  speed: string | null;
  durationSeconds: number | null;
  distance: number | null;
  weight: number | null;
};

function overrideBaseFrom(
  source: {
    sets: number | null;
    reps: string | null;
    speed: string | null;
    durationSeconds: number | null;
    distance: unknown;
    weight: unknown;
  }
): OverrideBase {
  return {
    sets: source.sets,
    reps: source.reps,
    speed: source.speed,
    durationSeconds: source.durationSeconds,
    distance: source.distance == null ? null : Number(source.distance),
    weight: source.weight == null ? null : Number(source.weight)
  };
}

function mergedOverrideValues(base: OverrideBase, patch: RoutineDayItemOverrideInput): OverrideBase {
  return {
    sets: patch.sets !== undefined ? patch.sets : base.sets,
    reps: patch.reps !== undefined ? normalizeRepScheme(patch.reps) : base.reps,
    speed: patch.speed !== undefined ? normalizeSpeedScheme(patch.speed) : base.speed,
    durationSeconds: patch.durationSeconds !== undefined ? patch.durationSeconds : base.durationSeconds,
    distance: patch.distance !== undefined ? patch.distance : base.distance,
    weight: patch.weight !== undefined ? patch.weight : base.weight
  };
}

async function loadAssignedRoutineDay(userId: string, weekday: number) {
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    throw new Error('Invalid weekday');
  }

  const program = await getActiveProgram(userId);
  if (!program) throw new Error('No active program found');

  const routine = await prisma.exerciseRoutine.findUnique({
    where: { programId: program.id },
    include: {
      days: {
        where: { weekday },
        include: {
          itemOverrides: true,
          exclusions: true,
          extras: true
        }
      }
    }
  });
  if (!routine) throw new Error('Weekly routine not found — save your routine first');

  const routineDay = routine.days[0];
  if (!routineDay) throw new Error('That weekday is not on the routine yet');

  return { program, routine, routineDay };
}

async function upsertDayItemOverride(
  routineDay: {
    id: string;
    templateId: string | null;
    itemOverrides: Array<{
      templateItemId: string;
      sets: number | null;
      reps: string | null;
      speed: string | null;
      durationSeconds: number | null;
      distance: unknown;
      weight: unknown;
    }>;
  },
  templateItem: {
    id: string;
    templateId: string;
    sets: number | null;
    reps: string | null;
    speed: string | null;
    durationSeconds: number | null;
    distance: unknown;
    weight: unknown;
  },
  patch: RoutineDayItemOverrideInput,
  db: Pick<typeof prisma, 'exerciseRoutineDayItem'> = prisma
) {
  if (!routineDay.templateId || templateItem.templateId !== routineDay.templateId) {
    throw new Error("Exercise is not part of this weekday's workout");
  }

  const existing = routineDay.itemOverrides.find((item) => item.templateItemId === templateItem.id);
  const next = mergedOverrideValues(overrideBaseFrom(existing ?? templateItem), patch);

  return db.exerciseRoutineDayItem.upsert({
    where: {
      routineDayId_templateItemId: {
        routineDayId: routineDay.id,
        templateItemId: templateItem.id
      }
    },
    create: {
      routineDayId: routineDay.id,
      templateItemId: templateItem.id,
      ...next
    },
    update: next
  });
}

async function applyRoutineForwardForWeekday(userId: string, programId: string, weekday: number) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  const today = parseDateParam(userDayKey(user?.timezone ?? null));
  const days = await getRoutineDaysForProgram(programId);
  const dayInputs: RoutineDayInput[] = (days ?? []).map((day) => ({
    weekday: day.weekday,
    templateId: day.templateId
  }));

  return applyRoutineForward(userId, dayInputs, today, {
    weekdayFilter: weekday
  });
}

export async function upsertRoutineDayItemOverride(
  userId: string,
  weekday: number,
  templateItemId: string,
  patch: RoutineDayItemOverrideInput
) {
  if (!Object.keys(patch).length) {
    throw new Error('At least one field is required');
  }

  const { program, routineDay } = await loadAssignedRoutineDay(userId, weekday);

  const templateItem = await prisma.exerciseTemplateItem.findUnique({
    where: { id: templateItemId }
  });
  if (!templateItem || templateItem.templateId !== routineDay.templateId) {
    throw new Error("Exercise is not part of this weekday's workout");
  }

  const override = await upsertDayItemOverride(routineDay, templateItem, patch);
  const { undoSnapshot, appliedDays } = await applyRoutineForwardForWeekday(userId, program.id, weekday);

  return {
    override: serializeItemOverride(override),
    day: await reloadSerializedRoutineDay(program.id, weekday),
    appliedDays,
    undoSnapshot
  };
}

export async function applyRoutineDayItemOverrides(
  userId: string,
  weekday: number,
  patch: RoutineDayItemOverrideInput
) {
  if (!Object.keys(patch).length) {
    throw new Error('At least one field is required');
  }

  const { program, routineDay } = await loadAssignedRoutineDay(userId, weekday);
  const templateId = routineDay.templateId;
  if (!templateId && routineDay.extras.length === 0) {
    throw new Error('That weekday is a rest day');
  }

  const excluded = new Set(routineDay.exclusions.map((entry) => entry.templateItemId));
  const templateItems = templateId
    ? await prisma.exerciseTemplateItem.findMany({ where: { templateId } })
    : [];
  const visibleItems = templateItems.filter((item) => !excluded.has(item.id));

  const overrides = await prisma.$transaction(async (tx) => {
    const nextOverrides = [];
    for (const templateItem of visibleItems) {
      nextOverrides.push(await upsertDayItemOverride(routineDay, templateItem, patch, tx));
    }
    for (const extra of routineDay.extras) {
      const next = mergedOverrideValues(overrideBaseFrom(extra), patch);
      await tx.exerciseRoutineDayExtra.update({ where: { id: extra.id }, data: next });
    }
    return nextOverrides;
  });

  const { undoSnapshot, appliedDays } = await applyRoutineForwardForWeekday(userId, program.id, weekday);
  const day = await reloadSerializedRoutineDay(program.id, weekday);

  return {
    overrides: overrides.map(serializeItemOverride),
    day,
    appliedDays,
    undoSnapshot
  };
}

async function reloadSerializedRoutineDay(programId: string, weekday: number) {
  const routine = await prisma.exerciseRoutine.findUnique({
    where: { programId },
    include: routineInclude
  });
  const day = routine?.days.find((entry) => entry.weekday === weekday);
  if (!day) throw new Error('That weekday is not on the routine yet');
  return serializeRoutineDay(day);
}

async function clearRoutineDayEdits(routineDayId: string) {
  await prisma.$transaction([
    prisma.exerciseRoutineDayItem.deleteMany({ where: { routineDayId } }),
    prisma.exerciseRoutineDayExclusion.deleteMany({ where: { routineDayId } }),
    prisma.exerciseRoutineDayExtra.deleteMany({ where: { routineDayId } }),
    prisma.exerciseRoutineDay.update({
      where: { id: routineDayId },
      data: { templateId: null }
    })
  ]);
}

export async function addRoutineDayExercise(userId: string, weekday: number, exerciseId: string) {
  const { program, routineDay } = await loadAssignedRoutineDay(userId, weekday);
  const exercise = await prisma.exercise.findUnique({ where: { id: exerciseId } });
  if (!exercise) throw new Error('Exercise not found');

  const excluded = new Set(routineDay.exclusions.map((entry) => entry.templateItemId));
  const templateItems = routineDay.templateId
    ? await prisma.exerciseTemplateItem.findMany({
        where: { templateId: routineDay.templateId },
        select: { id: true, exerciseId: true }
      })
    : [];
  const alreadyVisible =
    templateItems.some((item) => item.exerciseId === exerciseId && !excluded.has(item.id)) ||
    routineDay.extras.some((extra) => extra.exerciseId === exerciseId);
  if (alreadyVisible) throw new Error('That exercise is already on this day');

  const maxSort = routineDay.extras.reduce((max, extra) => Math.max(max, extra.sortOrder), -1);
  const prescription = catalogDefaultsToPrescription({
    defaultSets: exercise.defaultSets,
    defaultReps: exercise.defaultReps,
    defaultDurationSeconds: exercise.defaultDurationSeconds,
    defaultDistance: exercise.defaultDistance == null ? null : Number(exercise.defaultDistance)
  });
  await prisma.exerciseRoutineDayExtra.create({
    data: {
      routineDayId: routineDay.id,
      exerciseId: exercise.id,
      sortOrder: maxSort + 1,
      ...prescription
    }
  });

  const { undoSnapshot, appliedDays } = await applyRoutineForwardForWeekday(userId, program.id, weekday);
  return {
    day: await reloadSerializedRoutineDay(program.id, weekday),
    appliedDays,
    undoSnapshot,
    becameRest: false
  };
}

export async function updateRoutineDayExtra(
  userId: string,
  weekday: number,
  extraId: string,
  patch: RoutineDayItemOverrideInput
) {
  if (!Object.keys(patch).length) throw new Error('At least one field is required');

  const { program, routineDay } = await loadAssignedRoutineDay(userId, weekday);
  const extra = routineDay.extras.find((entry) => entry.id === extraId);
  if (!extra) throw new Error('That exercise is not on this day');

  const next = mergedOverrideValues(overrideBaseFrom(extra), patch);
  await prisma.exerciseRoutineDayExtra.update({ where: { id: extra.id }, data: next });

  const { undoSnapshot, appliedDays } = await applyRoutineForwardForWeekday(userId, program.id, weekday);
  return {
    day: await reloadSerializedRoutineDay(program.id, weekday),
    appliedDays,
    undoSnapshot
  };
}

/** Hides or drops an exercise on this weekday only. Does not change the shared plan template. */
export async function removeRoutineDayExercise(
  userId: string,
  weekday: number,
  remove: { templateItemId: string } | { extraId: string }
) {
  const { program, routineDay } = await loadAssignedRoutineDay(userId, weekday);
  const templateItems = routineDay.templateId
    ? await prisma.exerciseTemplateItem.findMany({
        where: { templateId: routineDay.templateId },
        select: { id: true }
      })
    : [];

  if ('templateItemId' in remove) {
    if (!templateItems.some((item) => item.id === remove.templateItemId)) {
      throw new Error("Exercise is not part of this weekday's workout");
    }
  } else if (!routineDay.extras.some((extra) => extra.id === remove.extraId)) {
    throw new Error('That exercise is not on this day');
  }

  const becameRest = removalEmptiesRoutineDay({
    templateItemIds: templateItems.map((item) => item.id),
    excludedTemplateItemIds: routineDay.exclusions.map((entry) => entry.templateItemId),
    extraIds: routineDay.extras.map((extra) => extra.id),
    remove
  });

  if (becameRest) {
    await clearRoutineDayEdits(routineDay.id);
  } else if ('templateItemId' in remove) {
    await prisma.exerciseRoutineDayExclusion.upsert({
      where: {
        routineDayId_templateItemId: {
          routineDayId: routineDay.id,
          templateItemId: remove.templateItemId
        }
      },
      create: { routineDayId: routineDay.id, templateItemId: remove.templateItemId },
      update: {}
    });
  } else {
    await prisma.exerciseRoutineDayExtra.delete({ where: { id: remove.extraId } });
  }

  const { undoSnapshot, appliedDays } = await applyRoutineForwardForWeekday(userId, program.id, weekday);
  return {
    day: await reloadSerializedRoutineDay(program.id, weekday),
    appliedDays,
    undoSnapshot,
    becameRest
  };
}

export async function getRoutineDaysForProgram(programId: string) {
  const routine = await prisma.exerciseRoutine.findUnique({
    where: { programId },
    include: { days: { include: { extras: { select: { id: true } } } } }
  });
  return routine?.days ?? null;
}

export async function isRoutineRestDay(userId: string, date: string) {
  const program = await getActiveProgram(userId);
  if (!program) return false;

  const days = await getRoutineDaysForProgram(program.id);
  if (!days?.length) return false;

  const weekday = weekdayIndexFromDate(parseDateParam(date));
  const day = days.find((entry) => entry.weekday === weekday);
  if (!day) return false;
  return routineWeekdayIsRest({ templateId: day.templateId, extraCount: day.extras.length });
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
