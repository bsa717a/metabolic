import { ProgramMode, ProgramStatus } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { parseDateParam, toDateKey, userDayKey } from '../utils/dates.js';
import { n } from '../utils/numbers.js';
import { resolvePlanForDate } from './planResolution.js';
import { getPlanPeriodInfo } from './planAdvancement.js';
import { getUserPlanMatchProfile, type PlanMatchProfile } from './nutritionTemplateMatch.js';
import { ensureDailyLogByUserId } from './dailyLogService.js';
import { applyStructureMealsToLog } from './structureMealsApply.js';
import { getMealStructure, resolveTargets } from './targetService.js';

/**
 * One explicit answer to "am I on a plan?" — every surface renders from this enum
 * instead of inferring from nulls. Display is derived from targets, never from
 * internal template names (those encode biometric bands).
 */
const DAY_MS = 86400000;

export type PlanStatus = {
  state: 'on_plan' | 'coached_no_plan' | 'self_directed';
  mode: ProgramMode;
  calorieTarget: number | null;
  proteinTarget: number | null;
  weekNumber: number | null;
  effectiveDate: string | null;
  endDate: string | null;
  nextCheckInDate: string | null;
  /** 1-based day within the current plan week, using the user's timezone. */
  planDayIndex: number | null;
};

function planDayIndex(effectiveDate: string | null, todayKey: string): number | null {
  if (!effectiveDate) return null;
  const start = parseDateParam(effectiveDate);
  const today = parseDateParam(todayKey);
  return Math.floor((today.getTime() - start.getTime()) / DAY_MS) + 1;
}

export async function getPlanStatus(userId: string): Promise<PlanStatus | null> {
  const [program, user] = await Promise.all([
    prisma.program.findFirst({ where: { userId, status: ProgramStatus.ACTIVE } }),
    prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } })
  ]);
  if (!program) return null;

  const todayKey = userDayKey(user?.timezone ?? null);
  const plan = await resolvePlanForDate(program, parseDateParam(todayKey));
  const template = plan.nutritionTemplateId
    ? await prisma.nutritionPlanTemplate.findUnique({
        where: { id: plan.nutritionTemplateId },
        select: { calorieTarget: true, proteinTarget: true }
      })
    : null;

  const latestCheckIn = await prisma.virtualCoachCheckIn.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { nextCheckInDate: true }
  });
  const nextCheckInDate = latestCheckIn?.nextCheckInDate ? toDateKey(latestCheckIn.nextCheckInDate) : null;

  // Targets-first: the formula is total for complete profiles, so "on a plan" no
  // longer requires a matched template (templates remain the legacy food source).
  const targets = await resolveTargets(userId);

  if (!template && !targets) {
    return {
      state: program.mode === ProgramMode.SELF_DIRECTED ? 'self_directed' : 'coached_no_plan',
      mode: program.mode,
      calorieTarget: null,
      proteinTarget: null,
      weekNumber: null,
      effectiveDate: null,
      endDate: null,
      nextCheckInDate,
      planDayIndex: null
    };
  }

  const info = await getPlanPeriodInfo(userId, todayKey);
  const effectiveDate = info?.effectiveDate ?? null;
  return {
    state: 'on_plan',
    mode: program.mode,
    calorieTarget: info?.calorieTarget ?? targets?.calories ?? (template ? Math.round(n(template.calorieTarget)) : null),
    proteinTarget: targets?.protein ?? (template ? Math.round(n(template.proteinTarget)) : null),
    weekNumber: info?.weekNumber ?? null,
    effectiveDate,
    endDate: info?.endDate ?? null,
    nextCheckInDate,
    planDayIndex: planDayIndex(effectiveDate, todayKey)
  };
}

export type PlanProposal =
  | { eligible: false; missing: string[]; noMatch: boolean }
  | {
      eligible: true;
      calorieTarget: number;
      proteinTarget: number;
      carbTarget: number;
      fatTarget: number;
      mealsPerDay: number;
    };

function missingProfileFields(profile: Partial<PlanMatchProfile>): string[] {
  const missing: string[] = [];
  if (profile.gender !== 'm' && profile.gender !== 'f') missing.push('gender');
  if (!profile.heightInches) missing.push('height');
  if (!profile.weightLbs) missing.push('weight');
  // activity level is no longer required — the formula defaults it to "lightly active"
  return missing;
}


/** Preview for the "get a weekly plan" flow: what would resolution assign right now? */
export async function getPlanProposal(userId: string): Promise<PlanProposal> {
  const targets = await resolveTargets(userId);
  if (!targets) {
    const profile = await getUserPlanMatchProfile(userId);
    return { eligible: false, missing: missingProfileFields(profile), noMatch: false };
  }
  const structure = await getMealStructure();
  return {
    eligible: true,
    calorieTarget: targets.calories,
    proteinTarget: targets.protein,
    carbTarget: targets.carbs,
    fatTarget: targets.fat,
    mealsPerDay: structure.slots.length
  };
}

export class PlanAdoptError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * Self-serve adoption: assign the matched template and mint the first PlanPeriod,
 * effective today. Program mode is untouched — SELF_DIRECTED means "no human coach",
 * and a plan works fine without one. Today's log is re-materialized from the template
 * only if nothing has been logged yet (never clobber actual intake).
 */
export async function adoptProposedPlan(userId: string): Promise<PlanStatus> {
  const program = await prisma.program.findFirst({ where: { userId, status: ProgramStatus.ACTIVE } });
  if (!program) throw new PlanAdoptError('No active program found', 404);

  const targets = await resolveTargets(userId);
  if (!targets) {
    const profile = await getUserPlanMatchProfile(userId);
    throw new PlanAdoptError(`Complete your profile first: ${missingProfileFields(profile).join(', ')}`);
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  const todayKey = userDayKey(user?.timezone ?? null);
  const today = parseDateParam(todayKey);

  await prisma.$transaction(async (tx) => {
    const priorCount = await tx.planPeriod.count({
      where: { programId: program.id, effectiveDate: { lt: today } }
    });
    const frozen = {
      calorieTarget: targets.calories,
      proteinTarget: targets.protein,
      carbTarget: targets.carbs,
      fatTarget: targets.fat,
      targetSource: targets.source
    };
    await tx.planPeriod.upsert({
      where: { programId_effectiveDate: { programId: program.id, effectiveDate: today } },
      create: {
        programId: program.id,
        effectiveDate: today,
        weekNumber: priorCount + 1,
        notes: 'Self-serve plan adoption',
        createdById: userId,
        ...frozen
      },
      update: { ...frozen }
    });
  });

  // Materialize today from the plan (meal structure + card defaults) unless the user
  // already has meals; frozen targets stamp either way.
  const log = await ensureDailyLogByUserId(userId, todayKey);
  if (log) {
    const mealCount = await prisma.meal.count({ where: { dailyLogId: log.id } });
    const actualItems = await prisma.mealItem.count({
      where: { meal: { dailyLogId: log.id }, type: 'ACTUAL' }
    });
    if (actualItems === 0 && mealCount === 0) {
      await applyStructureMealsToLog(userId, log.id, today);
    }
    await prisma.dailyLog.update({
      where: { id: log.id },
      data: {
        calorieTarget: targets.calories,
        proteinTarget: targets.protein,
        carbTarget: targets.carbs,
        fatTarget: targets.fat
      }
    });
  }

  const status = await getPlanStatus(userId);
  if (!status) throw new PlanAdoptError('Plan adoption failed', 500);
  return status;
}
