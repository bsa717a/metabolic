import { ProgramMode, ProgramStatus, Role, Visibility, MealItemType, type ProgramMetric, type Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { parseDateParam, toDateKey, userDayKey } from '../utils/dates.js';
import { normalizeGender } from './bloodPanelMetrics.js';
import { buildProgramMetrics, missingProgramMetrics } from '../utils/programMetrics.js';
import { fatMassLbs, leanTissueMassLbs } from '../utils/bodyComposition.js';
import { ensureTodayDailyLog } from './dailyLogService.js';
import { applyTemplateExercisesToDate } from './exerciseTemplateApply.js';
import { applyStructureMealsToLog } from './structureMealsApply.js';
import { freezeTargetsOnPeriod } from './targetService.js';
import { notifyCoachRequest } from './coachRequestNotificationService.js';

const DEFAULT_PROGRAM_NAME = 'Master Your Metabolic';

const DEFAULT_EXERCISES = [
  { name: 'Morning walk', category: 'Cardio', defaultDurationMinutes: 30 },
  { name: 'Goblet squat', category: 'Strength', bodyPart: 'Legs', defaultSets: 3, defaultReps: 10 },
  { name: 'Push-up', category: 'Strength', bodyPart: 'Chest', defaultSets: 3, defaultReps: 8 },
  { name: 'Mobility flow', category: 'Recovery', defaultDurationMinutes: 15 }
] as const;

export async function userNeedsSetup(userId: string) {
  const [activeProgram, user] = await Promise.all([
    prisma.program.findFirst({
      where: { userId, status: ProgramStatus.ACTIVE }
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true }
    })
  ]);
  const hasTimezone = Boolean(user?.timezone?.trim());
  return !activeProgram || !hasTimezone;
}

function formatMetricValue(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return '';
  return String(numeric);
}

function resolveMetricNumber(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

export function hasValidCurrentWeight(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0;
}

export async function getSetupDraft(userId: string) {
  const [user, program] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        gender: true,
        birthDate: true,
        timezone: true,
        coachRequestedAt: true
      }
    }),
    prisma.program.findFirst({
      where: { userId, status: ProgramStatus.ACTIVE },
      include: { metrics: true }
    })
  ]);

  const weightMetric = program?.metrics.find((metric) => metric.metricType === 'WEIGHT');
  const bodyFatMetric = program?.metrics.find((metric) => metric.metricType === 'BODY_FAT');
  const gender = normalizeGender(user?.gender);
  const weight = formatMetricValue(weightMetric?.currentValue);

  return {
    weight,
    goalWeight: formatMetricValue(weightMetric?.goalValue),
    bodyFat: formatMetricValue(bodyFatMetric?.currentValue),
    goalBodyFat: formatMetricValue(bodyFatMetric?.goalValue),
    gender: gender ?? (user?.gender?.trim() ?? ''),
    birthDate: user?.birthDate ? toDateKey(user.birthDate) : '',
    timezone: user?.timezone?.trim() ?? '',
    wantsCoach: Boolean(user?.coachRequestedAt),
    hasExistingWeight: hasValidCurrentWeight(weightMetric?.currentValue ?? weight)
  };
}

async function findOrCreateExercise(
  definition: (typeof DEFAULT_EXERCISES)[number]
) {
  const existing = await prisma.exercise.findFirst({ where: { name: definition.name } });
  if (existing) return existing;

  return prisma.exercise.create({
    data: {
      name: definition.name,
      category: definition.category,
      bodyPart: 'bodyPart' in definition ? definition.bodyPart : undefined,
      defaultSets: 'defaultSets' in definition ? definition.defaultSets : undefined,
      defaultReps: 'defaultReps' in definition ? definition.defaultReps : undefined,
      defaultDurationMinutes:
        'defaultDurationMinutes' in definition ? definition.defaultDurationMinutes : undefined
    }
  });
}

async function seedDefaultExercises(userId: string, programId: string, date: Date) {
  const existing = await prisma.scheduledExercise.count({
    where: { userId, programId, scheduledDate: date }
  });
  if (existing) return;

  for (const [index, definition] of DEFAULT_EXERCISES.entries()) {
    const exercise = await findOrCreateExercise(definition);
    await prisma.scheduledExercise.create({
      data: {
        programId,
        userId,
        exerciseId: exercise.id,
        scheduledDate: date,
        sets: exercise.defaultSets,
        reps: exercise.defaultReps,
        durationMinutes: exercise.defaultDurationMinutes,
        status: 'PLANNED',
        sortOrder: index
      }
    });
  }
}

type SetupInput = {
  programName?: string;
  weight: number;
  goalWeight: number;
  bodyFat?: number;
  goalBodyFat?: number;
  calorieTarget?: number;
  proteinTarget?: number;
  coachCode?: string;
  wantsCoach?: boolean;
  trackingOnly?: boolean;
  heightFeet?: number;
  heightInches?: number;
  occupation?: string;
  activityLevel?: number;
  gender?: string;
  birthDate?: string;
  timezone?: string;
};

function normalizeCoachCode(value?: string) {
  const normalized = value?.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return normalized || null;
}

function buildClientProfileData(input: SetupInput) {
  const clientProfileData: {
    heightInches?: number;
    heightRaw?: string;
    occupation?: string;
    activityLevel?: number;
  } = {};
  if (input.heightFeet !== undefined || input.heightInches !== undefined) {
    const feet = input.heightFeet ?? 0;
    const inches = input.heightInches ?? 0;
    clientProfileData.heightInches = feet * 12 + inches;
    clientProfileData.heightRaw = `${feet}'${inches}"`;
  }
  if (input.occupation?.trim()) {
    clientProfileData.occupation = input.occupation.trim();
  }
  if (input.activityLevel !== undefined) {
    clientProfileData.activityLevel = input.activityLevel;
  }
  return clientProfileData;
}

async function upsertClientProfileFromSetup(
  userId: string,
  input: SetupInput,
  tx: Prisma.TransactionClient
) {
  const clientProfileData = buildClientProfileData(input);
  if (!Object.keys(clientProfileData).length) return;
  await tx.clientProfile.upsert({
    where: { userId },
    create: { userId, ...clientProfileData },
    update: clientProfileData
  });
}

async function findCoachByCode(code: string | null) {
  if (!code) return null;
  return prisma.user.findFirst({
    where: { role: Role.COACH, coachCode: { equals: code, mode: 'insensitive' } },
    select: { id: true, defaultNutritionTemplateId: true, defaultExerciseTemplateId: true }
  });
}

async function findGlobalNutritionTemplate() {
  return prisma.nutritionPlanTemplate.findFirst({
    where: { visibility: Visibility.GLOBAL },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, calorieTarget: true, proteinTarget: true }
  });
}

/**
 * Formula era: only a coach's hand-picked default template attaches at onboarding
 * (coach-custom plans). Everyone else is templateless — targets come from resolution
 * (freezeTargetsOnPeriod below) and food from the card system's meal structure.
 */
async function resolveDefaultNutritionTemplateId(
  _input: SetupInput,
  coach: Awaited<ReturnType<typeof findCoachByCode>>
) {
  return coach?.defaultNutritionTemplateId ?? null;
}

async function findGlobalExerciseTemplate() {
  return prisma.exerciseTemplate.findFirst({
    where: { visibility: Visibility.GLOBAL },
    orderBy: { updatedAt: 'desc' },
    select: { id: true }
  });
}

type CoachSupportResult = {
  coach: Awaited<ReturnType<typeof findCoachByCode>>;
  shouldNotifyCoachRequest: boolean;
};

async function applyCoachSupport(
  userId: string,
  input: SetupInput,
  options?: { programId?: string }
): Promise<CoachSupportResult> {
  const coach = await findCoachByCode(normalizeCoachCode(input.coachCode));

  if (coach) {
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.coachAssignment.updateMany({
        where: { userId, status: 'ACTIVE' },
        data: { status: 'COMPLETED', accessEndsAt: now }
      });
      await tx.coachAssignment.create({
        data: { coachId: coach.id, userId, status: 'ACTIVE', accessStartedAt: now }
      });
      if (options?.programId) {
        await tx.program.update({
          where: { id: options.programId },
          data: { coachId: coach.id }
        });
      }
      await tx.user.update({
        where: { id: userId },
        data: {
          plan: 'COACH_LED',
          subscriptionStatus: 'COACH_MANAGED',
          gracePeriodEndsAt: null,
          nextPlanAfterCoach: null,
          ...(input.wantsCoach || input.coachCode?.trim() ? { coachRequestedAt: null } : {})
        }
      });
    });
    return { coach, shouldNotifyCoachRequest: false };
  }

  if (input.wantsCoach || input.coachCode?.trim()) {
    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { coachRequestedAt: true }
    });
    const hadPriorCoachRequest = Boolean(existing?.coachRequestedAt);

    if (!hadPriorCoachRequest) {
      await prisma.user.update({
        where: { id: userId },
        data: { coachRequestedAt: new Date() }
      });
    }

    return {
      coach: null,
      shouldNotifyCoachRequest: Boolean(input.wantsCoach) && !hadPriorCoachRequest
    };
  }

  return { coach: null, shouldNotifyCoachRequest: false };
}

async function updateActiveProgramFromSetup(
  userId: string,
  program: {
    id: string;
    coachId: string | null;
    metrics: ProgramMetric[];
  },
  input: SetupInput
) {
  const existingUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true }
  });
  const hasTimezone = Boolean(existingUser?.timezone?.trim());

  if (!hasTimezone && !input.timezone?.trim()) {
    throw new Error('A timezone is required to finish setup.');
  }

  const trackingOnly = input.trackingOnly === true;
  const timezone = input.timezone?.trim() || existingUser?.timezone || null;
  const today = parseDateParam(userDayKey(timezone));
  const todayKey = userDayKey(timezone);

  let coach: Awaited<ReturnType<typeof findCoachByCode>> = null;
  let defaultNutritionTemplateId: string | null = null;
  let defaultExerciseTemplateId: string | null = null;
  if (!trackingOnly) {
    coach = await findCoachByCode(normalizeCoachCode(input.coachCode));
    defaultNutritionTemplateId = await resolveDefaultNutritionTemplateId(input, coach);
    defaultExerciseTemplateId =
      coach?.defaultExerciseTemplateId ??
      (await findGlobalExerciseTemplate())?.id ??
      null;
  }

  const bodyFatMetric = program.metrics.find((metric) => metric.metricType === 'BODY_FAT');
  const bodyFat = input.bodyFat ?? resolveMetricNumber(bodyFatMetric?.currentValue, 30);
  const goalBodyFat = input.goalBodyFat ?? resolveMetricNumber(bodyFatMetric?.goalValue, 18);
  const caloriesMetric = program.metrics.find((metric) => metric.metricType === 'CALORIES');
  const proteinMetric = program.metrics.find((metric) => metric.metricType === 'PROTEIN');
  const calories = input.calorieTarget ?? resolveMetricNumber(caloriesMetric?.currentValue, 2200);
  const protein = input.proteinTarget ?? resolveMetricNumber(proteinMetric?.currentValue, 190);

  const updatesByType: Partial<Record<ProgramMetric['metricType'], { currentValue: number; goalValue: number }>> = {
    WEIGHT: { currentValue: input.weight, goalValue: input.goalWeight },
    BODY_FAT: { currentValue: bodyFat, goalValue: goalBodyFat },
    LEAN_TISSUE_MASS: {
      currentValue: leanTissueMassLbs(input.weight, bodyFat),
      goalValue: leanTissueMassLbs(input.goalWeight, goalBodyFat)
    },
    FAT_MASS: {
      currentValue: fatMassLbs(input.weight, bodyFat),
      goalValue: fatMassLbs(input.goalWeight, goalBodyFat)
    }
  };

  if (input.calorieTarget !== undefined) {
    updatesByType.CALORIES = {
      currentValue: input.calorieTarget,
      goalValue: Math.max(Math.round(input.calorieTarget - 150), 1200)
    };
  }
  if (input.proteinTarget !== undefined) {
    updatesByType.PROTEIN = {
      currentValue: input.proteinTarget,
      goalValue: input.proteinTarget + 15
    };
  }

  const profileUpdate: { timezone?: string; gender?: string | null; birthDate?: Date | null } = {};
  if (input.timezone?.trim()) {
    profileUpdate.timezone = input.timezone.trim();
  }
  if (input.gender) {
    profileUpdate.gender = normalizeGender(input.gender);
  }
  if (input.birthDate) {
    profileUpdate.birthDate = parseDateParam(input.birthDate);
  }

  await prisma.$transaction(async (tx) => {
    if (Object.keys(profileUpdate).length) {
      await tx.user.update({ where: { id: userId }, data: profileUpdate });
    }

    await upsertClientProfileFromSetup(userId, input, tx);

    await tx.program.update({
      where: { id: program.id },
      data: trackingOnly
        ? {
            mode: ProgramMode.SELF_DIRECTED,
            coachId: null,
            defaultNutritionTemplateId: null,
            defaultExerciseTemplateId: null
          }
        : {
            mode: ProgramMode.COACHED,
            coachId: coach?.id ?? program.coachId,
            defaultNutritionTemplateId,
            defaultExerciseTemplateId
          }
    });

    if (!trackingOnly) {
      const existingPeriod = await tx.planPeriod.findFirst({
        where: { programId: program.id, effectiveDate: today }
      });
      if (!existingPeriod) {
        await tx.planPeriod.create({
          data: {
            programId: program.id,
            effectiveDate: today,
            weekNumber: 1,
            nutritionTemplateId: defaultNutritionTemplateId,
            exerciseTemplateId: defaultExerciseTemplateId
          }
        });
      }
    }

    for (const metric of program.metrics) {
      const update = updatesByType[metric.metricType];
      if (!update) continue;
      await tx.programMetric.update({
        where: { id: metric.id },
        data: {
          currentValue: update.currentValue,
          goalValue: update.goalValue
        }
      });
    }

    const missing = missingProgramMetrics(
      program.id,
      program.metrics,
      {
        weight: input.weight,
        goalWeight: input.goalWeight,
        bodyFat,
        goalBodyFat,
        calorieTarget: input.calorieTarget,
        proteinTarget: input.proteinTarget
      },
      calories,
      protein
    );
    if (missing.length) {
      await tx.programMetric.createMany({ data: missing });
    }
  });

  const { shouldNotifyCoachRequest } = trackingOnly
    ? { shouldNotifyCoachRequest: false }
    : await applyCoachSupport(userId, input, { programId: program.id });

  const programWithMetrics = await prisma.program.findUniqueOrThrow({
    where: { id: program.id },
    include: { metrics: true }
  });

  if (!trackingOnly) {
    await freezeTargetsOnPeriod(userId, program.id, today);
  }

  const dailyLog = await ensureTodayDailyLog(userId, programWithMetrics);
  if (dailyLog && !trackingOnly && !defaultNutritionTemplateId) {
    const plannedItems = await prisma.mealItem.count({
      where: { meal: { dailyLogId: dailyLog.id }, type: 'PLANNED' }
    });
    if (plannedItems === 0) {
      await applyStructureMealsToLog(userId, dailyLog.id, today);
    }
  }
  if (!trackingOnly) {
    if (defaultExerciseTemplateId) {
      await prisma.$transaction(async (tx) => {
        await applyTemplateExercisesToDate(tx, defaultExerciseTemplateId, program.id, userId, todayKey);
      });
    } else {
      await seedDefaultExercises(userId, program.id, today);
    }
  }

  if (shouldNotifyCoachRequest) {
    await notifyCoachRequest(userId, { coachCode: input.coachCode });
  }

  return programWithMetrics;
}

export async function setupFirstProgram(userId: string, input: SetupInput) {
  const existingActiveProgram = await prisma.program.findFirst({
    where: { userId, status: ProgramStatus.ACTIVE },
    include: { metrics: true }
  });

  if (existingActiveProgram) {
    return updateActiveProgramFromSetup(userId, existingActiveProgram, input);
  }

  const [template, coach, globalNutritionTemplate, globalExerciseTemplate, existingUser] = await Promise.all([
    prisma.programTemplate.findFirst({ orderBy: { createdAt: 'asc' } }),
    findCoachByCode(normalizeCoachCode(input.coachCode)),
    findGlobalNutritionTemplate(),
    findGlobalExerciseTemplate(),
    prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } })
  ]);
  // Log-only ("just track my food"): a SELF_DIRECTED program with no coach, no templates, and no
  // exercise scaffolding — but it still captures the user's calorie/protein goals as metrics.
  const trackingOnly = input.trackingOnly === true;
  const defaultNutritionTemplateId = trackingOnly
    ? null
    : await resolveDefaultNutritionTemplateId(input, coach);
  const defaultExerciseTemplateId = trackingOnly ? null : coach?.defaultExerciseTemplateId ?? globalExerciseTemplate?.id ?? null;
  const calories = input.calorieTarget ?? Number(globalNutritionTemplate?.calorieTarget ?? template?.defaultCalories ?? 2200);
  const protein = input.proteinTarget ?? Number(globalNutritionTemplate?.proteinTarget ?? template?.defaultProtein ?? 190);
  const programName = input.programName?.trim() || DEFAULT_PROGRAM_NAME;
  const timezone = input.timezone?.trim() || existingUser?.timezone || null;
  const today = parseDateParam(userDayKey(timezone));
  const todayKey = userDayKey(timezone);
  const targetEndDate = new Date(today.getTime() + 16 * 7 * 86400000);

  const program = await prisma.$transaction(async (tx) => {
    const profileUpdate: { gender?: string | null; birthDate?: Date | null; timezone?: string } = {};
    if (input.gender) {
      profileUpdate.gender = normalizeGender(input.gender);
    }
    if (input.birthDate) {
      profileUpdate.birthDate = parseDateParam(input.birthDate);
    }
    if (input.timezone?.trim()) {
      profileUpdate.timezone = input.timezone.trim();
    }
    if (Object.keys(profileUpdate).length) {
      await tx.user.update({ where: { id: userId }, data: profileUpdate });
    }

    await upsertClientProfileFromSetup(userId, input, tx);

    const created = await tx.program.create({
      data: {
        userId,
        coachId: trackingOnly ? null : coach?.id ?? null,
        name: programName,
        status: ProgramStatus.ACTIVE,
        mode: trackingOnly ? ProgramMode.SELF_DIRECTED : ProgramMode.COACHED,
        startDate: today,
        targetEndDate,
        defaultNutritionTemplateId,
        defaultExerciseTemplateId
      }
    });

    await tx.programMetric.createMany({
      data: buildProgramMetrics(created.id, input, calories, protein)
    });

    if (!trackingOnly) {
      await tx.planPeriod.create({
        data: {
          programId: created.id,
          effectiveDate: today,
          weekNumber: 1,
          nutritionTemplateId: defaultNutritionTemplateId,
          exerciseTemplateId: defaultExerciseTemplateId
        }
      });
    }

    return created;
  });

  const { shouldNotifyCoachRequest } = trackingOnly
    ? { shouldNotifyCoachRequest: false }
    : await applyCoachSupport(userId, input, { programId: program.id });

  const programWithMetrics = await prisma.program.findUniqueOrThrow({
    where: { id: program.id },
    include: { metrics: true }
  });

  if (!trackingOnly) {
    await freezeTargetsOnPeriod(userId, program.id, today);
  }

  const dailyLog = await ensureTodayDailyLog(userId, programWithMetrics);
  if (dailyLog && !trackingOnly && !defaultNutritionTemplateId) {
    const plannedItems = await prisma.mealItem.count({
      where: { meal: { dailyLogId: dailyLog.id }, type: 'PLANNED' }
    });
    if (plannedItems === 0) {
      await applyStructureMealsToLog(userId, dailyLog.id, today);
    }
  }
  if (defaultExerciseTemplateId) {
    await prisma.$transaction(async (tx) => {
      await applyTemplateExercisesToDate(tx, defaultExerciseTemplateId, program.id, userId, todayKey);
    });
  } else if (!trackingOnly) {
    await seedDefaultExercises(userId, program.id, today);
  }

  if (shouldNotifyCoachRequest) {
    await notifyCoachRequest(userId, { coachCode: input.coachCode });
  }

  return programWithMetrics;
}
