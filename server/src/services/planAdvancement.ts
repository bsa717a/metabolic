import { ProgramStatus, Visibility } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { localDateKey, parseDateParam, toDateKey } from '../utils/dates.js';
import { resolvePlanForDate } from './planResolution.js';
import {
  findBestMatchingTemplate,
  getUserPlanMatchProfile,
  isCompletePlanMatchProfile,
  templateMatchesProfile
} from './nutritionTemplateMatch.js';
import { resolveTargets } from './targetService.js';

const DAY_MS = 86400000;

export type PlanAdvanceResult = {
  planPeriodId: string;
  weekNumber: number;
  effectiveDate: string;
  nutritionTemplateName: string | null;
  templateChanged: boolean;
  /** false = the kickoff confirmed the current week instead of starting a new one. */
  advanced: boolean;
};

/** How fresh a plan week must be for the kickoff to confirm it rather than advance. */
const KICKOFF_CONFIRM_WINDOW_DAYS = 4;

export type KickoffPlanAction = 'mint_week1_today' | 'confirm_current' | 'advance';

/**
 * Kickoff rule: no period yet → mint Week 1 today (matches "Week 1 starts at your
 * first check-in"); a period younger than the window → confirm it (don't burn a week
 * on day one); otherwise advance normally.
 */
export function resolveKickoffPlanAction(latestEffectiveDate: Date | null, today: Date): KickoffPlanAction {
  if (!latestEffectiveDate) return 'mint_week1_today';
  const ageDays = Math.floor((today.getTime() - latestEffectiveDate.getTime()) / DAY_MS);
  return ageDays < KICKOFF_CONFIRM_WINDOW_DAYS ? 'confirm_current' : 'advance';
}

/**
 * Workstream F: completing the weekly check-in mints the next week's PlanPeriod,
 * effective tomorrow (user's timezone). The proposal re-matches the biometric
 * criteria with hysteresis — the current template is kept while it still fits the
 * profile and we only re-match once it doesn't (so a user hovering at a band
 * boundary doesn't flip-flop week to week). No match at all → the current plan
 * carries forward unchanged. Skipping the check-in creates nothing: the last
 * period simply stays in force (soft-weekly).
 */
export async function advancePlanForCheckIn(
  userId: string,
  timezone: string | null,
  mode: 'weekly' | 'kickoff' = 'weekly'
): Promise<PlanAdvanceResult | null> {
  const program = await prisma.program.findFirst({ where: { userId, status: ProgramStatus.ACTIVE } });
  if (!program) return null;

  const today = parseDateParam(timezone ? localDateKey(new Date(), timezone) : localDateKey(new Date()));

  const plan = await resolvePlanForDate(program, today);
  // Log-only programs have no plan to advance.
  if (!plan.nutritionTemplateId && !plan.exerciseTemplateId) return null;

  let effectiveDate = new Date(today.getTime() + DAY_MS);
  if (mode === 'kickoff') {
    const latest = await prisma.planPeriod.findFirst({
      where: { programId: program.id, effectiveDate: { lte: today } },
      orderBy: { effectiveDate: 'desc' },
      select: { id: true, effectiveDate: true }
    });
    const action = resolveKickoffPlanAction(latest?.effectiveDate ?? null, today);
    if (action === 'confirm_current' && latest) {
      // No writes: the kickoff confirms the week already underway.
      const priorCount = await prisma.planPeriod.count({
        where: { programId: program.id, effectiveDate: { lte: latest.effectiveDate } }
      });
      const template = plan.nutritionTemplateId
        ? await prisma.nutritionPlanTemplate.findUnique({
            where: { id: plan.nutritionTemplateId },
            select: { name: true }
          })
        : null;
      return {
        planPeriodId: latest.id,
        weekNumber: priorCount,
        effectiveDate: toDateKey(latest.effectiveDate),
        nutritionTemplateName: template?.name ?? null,
        templateChanged: false,
        advanced: false
      };
    }
    if (action === 'mint_week1_today') {
      effectiveDate = today;
    }
  }

  let nutritionTemplateId = plan.nutritionTemplateId;
  let templateChanged = false;

  const profile = await getUserPlanMatchProfile(userId);
  if (isCompletePlanMatchProfile(profile)) {
    const current = nutritionTemplateId
      ? await prisma.nutritionPlanTemplate.findUnique({ where: { id: nutritionTemplateId } })
      : null;
    const stillMatches = current != null && templateMatchesProfile(current, profile);
    if (!stillMatches) {
      const best = await findBestMatchingTemplate(profile, { visibility: Visibility.GLOBAL });
      if (best && best.id !== nutritionTemplateId) {
        nutritionTemplateId = best.id;
        templateChanged = true;
      }
    }
  }

  const priorCount = await prisma.planPeriod.count({
    where: { programId: program.id, effectiveDate: { lt: effectiveDate } }
  });
  const weekNumber = priorCount + 1;

  // Freeze this week's numbers onto the period (formula era). Resolution walks
  // coach pin → override band → formula; null only for incomplete profiles.
  const targets = await resolveTargets(userId);
  const frozen = targets
    ? {
        calorieTarget: targets.calories,
        proteinTarget: targets.protein,
        carbTarget: targets.carbs,
        fatTarget: targets.fat,
        targetSource: targets.source
      }
    : {};

  const period = await prisma.planPeriod.upsert({
    where: { programId_effectiveDate: { programId: program.id, effectiveDate } },
    create: {
      programId: program.id,
      effectiveDate,
      weekNumber,
      nutritionTemplateId,
      exerciseTemplateId: plan.exerciseTemplateId,
      notes: mode === 'kickoff' ? 'Started by kickoff check-in' : 'Started by weekly check-in',
      createdById: userId,
      ...frozen
    },
    update: { nutritionTemplateId, exerciseTemplateId: plan.exerciseTemplateId, weekNumber, ...frozen }
  });

  const template = nutritionTemplateId
    ? await prisma.nutritionPlanTemplate.findUnique({ where: { id: nutritionTemplateId }, select: { name: true } })
    : null;

  return {
    planPeriodId: period.id,
    weekNumber,
    effectiveDate: toDateKey(effectiveDate),
    nutritionTemplateName: template?.name ?? null,
    templateChanged,
    advanced: true
  };
}

export type PlanPeriodInfo = {
  weekNumber: number | null;
  effectiveDate: string | null;
  endDate: string | null;
  templateName: string | null;
  calorieTarget: number | null;
};

/**
 * Workstream E: describe the plan week a date falls in. Week number is DERIVED —
 * the active period's 1-based rank by effectiveDate — never read from the stored
 * column (the apply-template path leaves it null). endDate is the day before the
 * next period starts, or null while the current period is open-ended.
 */
export async function getPlanPeriodInfo(userId: string, date: string): Promise<PlanPeriodInfo | null> {
  const program = await prisma.program.findFirst({ where: { userId, status: ProgramStatus.ACTIVE } });
  if (!program) return null;

  const day = parseDateParam(date);
  const [periods, plan] = await Promise.all([
    prisma.planPeriod.findMany({
      where: { programId: program.id },
      orderBy: { effectiveDate: 'asc' },
      select: { id: true, effectiveDate: true, calorieTarget: true }
    }),
    resolvePlanForDate(program, day)
  ]);

  const template = plan.nutritionTemplateId
    ? await prisma.nutritionPlanTemplate.findUnique({
        where: { id: plan.nutritionTemplateId },
        select: { name: true, calorieTarget: true }
      })
    : null;

  let activeIndex = -1;
  for (let i = 0; i < periods.length; i += 1) {
    if (periods[i].effectiveDate.getTime() <= day.getTime()) activeIndex = i;
  }

  // The week's frozen number wins; template targets are the legacy fallback.
  const frozenCalories = activeIndex >= 0 && periods[activeIndex].calorieTarget != null
    ? Math.round(Number(periods[activeIndex].calorieTarget))
    : null;
  const calorieTarget = frozenCalories ?? (template ? Math.round(Number(template.calorieTarget)) : null);

  if (activeIndex < 0) {
    return { weekNumber: null, effectiveDate: null, endDate: null, templateName: template?.name ?? null, calorieTarget };
  }

  const next = periods[activeIndex + 1];
  return {
    weekNumber: activeIndex + 1,
    effectiveDate: toDateKey(periods[activeIndex].effectiveDate),
    endDate: next ? toDateKey(new Date(next.effectiveDate.getTime() - DAY_MS)) : null,
    templateName: template?.name ?? null,
    calorieTarget
  };
}
