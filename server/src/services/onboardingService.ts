import { ProgramMode, ProgramStatus, Visibility, MealItemType, type ProgramMetric, type Prisma } from '@prisma/client';
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
import { applyCoachSupport, findCoachByCode, normalizeCoachCode } from './coachSupportService.js';
import { isVirtualCoachId } from '../data/virtualCoachPersonas.js';
import { normalizePhone } from '../utils/phone.js';
import { loadActiveCoachAssignment } from './userSerialization.js';
import {
  buildClientProfileData,
  heightFieldsFromProfile,
  shouldApplyImportedCoachChoice,
  shouldPreserveImportedProgram
} from './onboardingSetupGuards.js';

const DEFAULT_PROGRAM_NAME = 'Master Your Metabolic';

const DEFAULT_EXERCISES = [
  { name: 'Morning walk', category: 'Cardio', defaultDurationSeconds: 30 * 60 },
  { name: 'Goblet squat', category: 'Strength', bodyPart: 'Legs', defaultSets: 3, defaultReps: 10 },
  { name: 'Push-up', category: 'Strength', bodyPart: 'Chest', defaultSets: 3, defaultReps: 8 },
  { name: 'Mobility flow', category: 'Recovery', defaultDurationSeconds: 15 * 60 }
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
  const [user, program, profile, assignment] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        gender: true,
        birthDate: true,
        timezone: true,
        coachRequestedAt: true,
        phone: true
      }
    }),
    prisma.program.findFirst({
      where: { userId, status: ProgramStatus.ACTIVE },
      include: { metrics: true }
    }),
    prisma.clientProfile.findUnique({
      where: { userId },
      select: {
        heightInches: true,
        heightRaw: true,
        foodConditions: true,
        dietNotes: true,
        activityLevel: true,
        occupation: true
      }
    }),
    loadActiveCoachAssignment(userId)
  ]);

  const weightMetric = program?.metrics.find((metric) => metric.metricType === 'WEIGHT');
  const bodyFatMetric = program?.metrics.find((metric) => metric.metricType === 'BODY_FAT');
  const gender = normalizeGender(user?.gender);
  const weight = formatMetricValue(weightMetric?.currentValue);
  const height = heightFieldsFromProfile(profile?.heightInches, profile?.heightRaw);
  let assignedCoachName = [assignment?.coach.firstName, assignment?.coach.lastName].filter(Boolean).join(' ');
  if (!assignedCoachName && program?.coachId) {
    const linkedCoach = await prisma.user.findUnique({
      where: { id: program.coachId },
      select: { firstName: true, lastName: true }
    });
    assignedCoachName = [linkedCoach?.firstName, linkedCoach?.lastName].filter(Boolean).join(' ');
  }

  return {
    weight,
    goalWeight: formatMetricValue(weightMetric?.goalValue),
    bodyFat: formatMetricValue(bodyFatMetric?.currentValue),
    goalBodyFat: formatMetricValue(bodyFatMetric?.goalValue),
    gender: gender ?? (user?.gender?.trim() ?? ''),
    birthDate: user?.birthDate ? toDateKey(user.birthDate) : '',
    timezone: user?.timezone?.trim() ?? '',
    wantsCoach: Boolean(user?.coachRequestedAt),
    hasExistingWeight: hasValidCurrentWeight(weightMetric?.currentValue ?? weight),
    ...height,
    foodAllergies: profile?.foodConditions?.trim() ?? '',
    dietaryPreferences: profile?.dietNotes?.trim() ?? '',
    activityLevel: profile?.activityLevel != null ? String(profile.activityLevel) : '',
    phone: user?.phone?.trim() ?? '',
    occupation: profile?.occupation?.trim() ?? '',
    assignedCoachName,
    hasAssignedCoach: Boolean(assignment) || Boolean(program?.coachId)
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
      defaultDurationSeconds:
        'defaultDurationSeconds' in definition ? definition.defaultDurationSeconds : undefined
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
        reps: exercise.defaultReps == null ? null : String(exercise.defaultReps),
        durationSeconds: exercise.defaultDurationSeconds,
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
  phone?: string;
  foodAllergies?: string;
  dietaryPreferences?: string;
  textReminders?: boolean;
  selectedVirtualCoachId?: string;
};

function normalizeSetupPhone(value?: string) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return normalizePhone(trimmed);
}

function virtualCoachProfileFields(input: SetupInput) {
  if (input.selectedVirtualCoachId && isVirtualCoachId(input.selectedVirtualCoachId)) {
    return { selectedVirtualCoachId: input.selectedVirtualCoachId };
  }
  return {};
}

type SetupProfileUpdate = {
  timezone?: string;
  gender?: string | null;
  birthDate?: Date | null;
  phone?: string;
  selectedVirtualCoachId?: string;
  smsMealRemindersEnabled?: boolean;
  smsEveningRecapEnabled?: boolean;
  smsRemindersEnabled?: boolean;
};

function assignSetupProfileFields(profileUpdate: SetupProfileUpdate, input: SetupInput) {
  if (input.timezone?.trim()) {
    profileUpdate.timezone = input.timezone.trim();
  }
  if (input.gender) {
    profileUpdate.gender = normalizeGender(input.gender);
  }
  if (input.birthDate) {
    profileUpdate.birthDate = parseDateParam(input.birthDate);
  }
  const phone = normalizeSetupPhone(input.phone);
  if (phone) {
    profileUpdate.phone = phone;
  }
  Object.assign(profileUpdate, virtualCoachProfileFields(input));
  if (input.textReminders === true) {
    profileUpdate.smsMealRemindersEnabled = true;
    profileUpdate.smsEveningRecapEnabled = true;
    profileUpdate.smsRemindersEnabled = true;
  } else if (input.textReminders === false) {
    profileUpdate.smsMealRemindersEnabled = false;
    profileUpdate.smsEveningRecapEnabled = false;
    profileUpdate.smsRemindersEnabled = false;
  }
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

async function updateConfirmedProgramMetrics(
  tx: Prisma.TransactionClient,
  program: { id: string; metrics: ProgramMetric[] },
  input: SetupInput
) {
  const weightMetric = program.metrics.find((metric) => metric.metricType === 'WEIGHT');
  if (weightMetric) {
    await tx.programMetric.update({
      where: { id: weightMetric.id },
      data: { currentValue: input.weight, goalValue: input.goalWeight }
    });
  } else {
    await tx.programMetric.create({
      data: {
        programId: program.id,
        metricType: 'WEIGHT',
        startValue: input.weight,
        currentValue: input.weight,
        goalValue: input.goalWeight,
        unit: 'lbs'
      }
    });
  }

  const bodyFatMetric = program.metrics.find((metric) => metric.metricType === 'BODY_FAT');
  let bodyFat = input.bodyFat;
  let goalBodyFat = input.goalBodyFat;
  if (bodyFatMetric) {
    const data: { currentValue?: number; goalValue?: number } = {};
    if (input.bodyFat !== undefined) data.currentValue = input.bodyFat;
    if (input.goalBodyFat !== undefined) data.goalValue = input.goalBodyFat;
    if (Object.keys(data).length) {
      await tx.programMetric.update({ where: { id: bodyFatMetric.id }, data });
    }
    bodyFat = bodyFat ?? Number(bodyFatMetric.currentValue);
    goalBodyFat = goalBodyFat ?? Number(bodyFatMetric.goalValue);
  }

  if (
    bodyFat === undefined ||
    goalBodyFat === undefined ||
    !Number.isFinite(bodyFat) ||
    !Number.isFinite(goalBodyFat) ||
    bodyFat <= 0 ||
    goalBodyFat <= 0
  ) {
    return;
  }

  const derived = [
    {
      metricType: 'LEAN_TISSUE_MASS' as const,
      currentValue: leanTissueMassLbs(input.weight, bodyFat),
      goalValue: leanTissueMassLbs(input.goalWeight, goalBodyFat)
    },
    {
      metricType: 'FAT_MASS' as const,
      currentValue: fatMassLbs(input.weight, bodyFat),
      goalValue: fatMassLbs(input.goalWeight, goalBodyFat)
    }
  ];

  for (const next of derived) {
    const metric = program.metrics.find((item) => item.metricType === next.metricType);
    if (!metric) continue;
    await tx.programMetric.update({
      where: { id: metric.id },
      data: { currentValue: next.currentValue, goalValue: next.goalValue }
    });
  }
}

/**
 * Imported programs keep their meals, workouts, history, and any coach already
 * linked. Confirm profile fields and the goal weight in place. A code or a
 * coach request is applied only when this user has no coach yet.
 */
async function confirmImportedProgram(
  userId: string,
  program: { id: string; coachId: string | null; metrics: ProgramMetric[] },
  input: SetupInput,
  hasActiveCoachAssignment: boolean
) {
  const profileUpdate: SetupProfileUpdate = {};
  assignSetupProfileFields(profileUpdate, input);

  await prisma.$transaction(async (tx) => {
    if (Object.keys(profileUpdate).length) {
      await tx.user.update({ where: { id: userId }, data: profileUpdate });
    }
    await upsertClientProfileFromSetup(userId, input, tx);
    await updateConfirmedProgramMetrics(tx, program, input);
  });

  if (
    shouldApplyImportedCoachChoice({
      hasActiveCoachAssignment,
      programCoachId: program.coachId,
      coachCode: input.coachCode,
      wantsCoach: input.wantsCoach
    })
  ) {
    const { shouldNotifyCoachRequest } = await applyCoachSupport(
      userId,
      { coachCode: input.coachCode, wantsCoach: input.wantsCoach },
      { programId: program.id }
    );
    if (shouldNotifyCoachRequest) {
      await notifyCoachRequest(userId, { coachCode: input.coachCode });
    }
  }

  return prisma.program.findUniqueOrThrow({
    where: { id: program.id },
    include: { metrics: true }
  });
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
    throw new Error(
      'We need your timezone to schedule meal reminders and check-ins at the right time. Please go back and select your timezone.'
    );
  }

  const [mealCount, exerciseCount, activeAssignment] = await Promise.all([
    prisma.meal.count({ where: { dailyLog: { programId: program.id } } }),
    prisma.scheduledExercise.count({ where: { programId: program.id } }),
    loadActiveCoachAssignment(userId)
  ]);
  if (
    shouldPreserveImportedProgram({
      mealCount,
      exerciseCount,
      coachId: program.coachId,
      hasActiveCoachAssignment: Boolean(activeAssignment)
    })
  ) {
    return confirmImportedProgram(userId, program, input, Boolean(activeAssignment));
  }

  const coach = await findCoachByCode(normalizeCoachCode(input.coachCode));
  const trackingOnly = input.trackingOnly === true && !coach;
  const timezone = input.timezone?.trim() || existingUser?.timezone || null;
  const today = parseDateParam(userDayKey(timezone));
  const todayKey = userDayKey(timezone);
  let defaultNutritionTemplateId: string | null = null;
  let defaultExerciseTemplateId: string | null = null;
  if (!trackingOnly) {
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

  const profileUpdate: SetupProfileUpdate = {};
  assignSetupProfileFields(profileUpdate, input);

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

  const { shouldNotifyCoachRequest } = await applyCoachSupport(userId, input, { programId: program.id });

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
    const program = await updateActiveProgramFromSetup(userId, existingActiveProgram, input);
    return { program, created: false as const };
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
  // Invite links always get a coached plan; tracking-only is only for people without a real coach.
  const trackingOnly = input.trackingOnly === true && !coach;
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
    const profileUpdate: SetupProfileUpdate = {};
    assignSetupProfileFields(profileUpdate, input);
    if (Object.keys(profileUpdate).length) {
      await tx.user.update({ where: { id: userId }, data: profileUpdate });
    }

    await upsertClientProfileFromSetup(userId, input, tx);

    const created = await tx.program.create({
      data: {
        userId,
        coachId: coach?.id ?? null,
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

  const { shouldNotifyCoachRequest } = await applyCoachSupport(userId, input, { programId: program.id });

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

  return { program: programWithMetrics, created: true as const };
}
