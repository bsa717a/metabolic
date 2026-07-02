import { ProgramMode, ProgramStatus, Visibility, type Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { parseDateParam, toDateKey, userDayKey } from '../utils/dates.js';
import { n } from '../utils/numbers.js';
import { resolvePlanForDate } from './planResolution.js';
import { getPlanPeriodInfo } from './planAdvancement.js';
import {
  findBestMatchingTemplate,
  getUserPlanMatchProfile,
  isCompletePlanMatchProfile,
  type PlanMatchProfile
} from './nutritionTemplateMatch.js';
import { applyTemplateMealsToLog } from './nutritionTemplateApply.js';
import { ensureDailyLogByUserId } from './dailyLogService.js';

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

  if (!template) {
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
    calorieTarget: Math.round(n(template.calorieTarget)),
    proteinTarget: Math.round(n(template.proteinTarget)),
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
  if (!profile.activityLevel) missing.push('activity level');
  return missing;
}

async function matchTemplateForUser(userId: string) {
  const profile = await getUserPlanMatchProfile(userId);
  if (!isCompletePlanMatchProfile(profile)) {
    return { missing: missingProfileFields(profile), template: null };
  }
  const template = await findBestMatchingTemplate(profile, { visibility: Visibility.GLOBAL });
  return { missing: [] as string[], template };
}

/** Preview for the "get a weekly plan" flow: what would the matcher assign right now? */
export async function getPlanProposal(userId: string): Promise<PlanProposal> {
  const { missing, template } = await matchTemplateForUser(userId);
  if (missing.length || !template) {
    return { eligible: false, missing, noMatch: !missing.length };
  }
  const mealsPerDay = await prisma.nutritionTemplateMeal.count({ where: { templateId: template.id } });
  return {
    eligible: true,
    calorieTarget: Math.round(n(template.calorieTarget)),
    proteinTarget: Math.round(n(template.proteinTarget)),
    carbTarget: Math.round(n(template.carbTarget)),
    fatTarget: Math.round(n(template.fatTarget)),
    mealsPerDay
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

  const { missing, template } = await matchTemplateForUser(userId);
  if (missing.length) throw new PlanAdoptError(`Complete your profile first: ${missing.join(', ')}`);
  if (!template) throw new PlanAdoptError('No plan matches your profile yet — check back soon', 404);

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  const todayKey = userDayKey(user?.timezone ?? null);
  const today = parseDateParam(todayKey);

  await prisma.$transaction(async (tx) => {
    await tx.program.update({
      where: { id: program.id },
      data: { defaultNutritionTemplateId: template.id }
    });
    const priorCount = await tx.planPeriod.count({
      where: { programId: program.id, effectiveDate: { lt: today } }
    });
    await tx.planPeriod.upsert({
      where: { programId_effectiveDate: { programId: program.id, effectiveDate: today } },
      create: {
        programId: program.id,
        effectiveDate: today,
        weekNumber: priorCount + 1,
        nutritionTemplateId: template.id,
        notes: 'Self-serve plan adoption',
        createdById: userId
      },
      update: { nutritionTemplateId: template.id }
    });
  });

  // Materialize today from the new plan unless the user already logged food today.
  const log = await ensureDailyLogByUserId(userId, todayKey);
  if (log) {
    const actualItems = await prisma.mealItem.count({
      where: { meal: { dailyLogId: log.id }, type: 'ACTUAL' }
    });
    if (actualItems === 0) {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await applyTemplateMealsToLog(tx, template.id, log.id, userId);
      });
    }
  }

  const status = await getPlanStatus(userId);
  if (!status) throw new PlanAdoptError('Plan adoption failed', 500);
  return status;
}
