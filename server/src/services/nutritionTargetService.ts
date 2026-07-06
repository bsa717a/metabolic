import { ProgramStatus, type TargetSource } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { parseDateParam, userDayKey } from '../utils/dates.js';
import { freezeTargetsOnPeriod, getFormulaTargetBreakdownForUser, resolveTargets, type TargetFormulaBreakdown } from './targetService.js';
import { ensureDailyLogByUserId } from './dailyLogService.js';
import {
  applyStructureMealsToLog,
  rescalePlannedMealsToCalories,
  resyncCardMealsToFrozenPeriod
} from './structureMealsApply.js';
import { applyDefaultTemplateToNewLogOutsideTx } from './nutritionTemplateApply.js';

export type NutritionMacroInput = {
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
};

export type UserNutritionTargets = {
  /** How the currently-effective targets are resolved (formula, nutritionist band, or override). */
  source: TargetSource | null;
  /** The numbers in effect right now (override → band → formula). Null when the profile can't resolve. */
  resolvedTargets: { calories: number; protein: number; carbs: number; fat: number } | null;
  /** Raw pinned override per macro (null = that macro falls back to the formula). */
  overrideTargets: NutritionMacroInput;
  /** Step-by-step Mifflin-St Jeor breakdown from the user's profile, when available. */
  formulaBreakdown: TargetFormulaBreakdown | null;
};

const toNum = (value: unknown) => (value == null ? null : Math.round(Number(value)));

/** Current resolved targets, the resolution source, and any pinned override for a user. */
export async function getUserNutritionTargets(userId: string): Promise<UserNutritionTargets> {
  const [program, resolved, formulaBreakdown] = await Promise.all([
    prisma.program.findFirst({
      where: { userId, status: ProgramStatus.ACTIVE },
      select: {
        pinnedCalorieTarget: true,
        pinnedProteinTarget: true,
        pinnedCarbTarget: true,
        pinnedFatTarget: true
      }
    }),
    resolveTargets(userId),
    getFormulaTargetBreakdownForUser(userId)
  ]);

  return {
    source: resolved?.source ?? null,
    resolvedTargets: resolved
      ? { calories: resolved.calories, protein: resolved.protein, carbs: resolved.carbs, fat: resolved.fat }
      : null,
    overrideTargets: {
      calories: toNum(program?.pinnedCalorieTarget),
      protein: toNum(program?.pinnedProteinTarget),
      carbs: toNum(program?.pinnedCarbTarget),
      fat: toNum(program?.pinnedFatTarget)
    },
    formulaBreakdown
  };
}

/**
 * Pin a user's macro override on the active program (null per field falls back to the
 * formula for that macro), then re-freeze the active plan period and re-scale today's
 * planned meals so meal planning immediately reflects the new numbers. Persistent:
 * future weeks resolve through the same pins. Logged (ACTUAL) intake is never touched.
 * Used by both self-serve edits and the coach food tab.
 */
export async function setUserNutritionTargets(
  userId: string,
  targets: NutritionMacroInput,
  options?: { createdById?: string; rescaleDate?: string }
): Promise<UserNutritionTargets> {
  const program = await prisma.program.findFirst({
    where: { userId, status: ProgramStatus.ACTIVE },
    select: { id: true, defaultNutritionTemplateId: true }
  });
  if (!program) throw new Error('No active program found');

  await prisma.program.update({
    where: { id: program.id },
    data: {
      pinnedCalorieTarget: targets.calories,
      pinnedProteinTarget: targets.protein,
      pinnedCarbTarget: targets.carbs,
      pinnedFatTarget: targets.fat
    }
  });

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  const todayKey = userDayKey(user?.timezone ?? null);
  const today = parseDateParam(todayKey);
  const resolved = await resolveTargets(userId);

  if (resolved) {
    const activePeriod = await prisma.planPeriod.findFirst({
      where: { programId: program.id, effectiveDate: { lte: today } },
      orderBy: { effectiveDate: 'desc' },
      select: { effectiveDate: true }
    });

    if (activePeriod) {
      await freezeTargetsOnPeriod(userId, program.id, activePeriod.effectiveDate);
    } else {
      await prisma.planPeriod.create({
        data: {
          programId: program.id,
          effectiveDate: today,
          weekNumber: 1,
          notes: 'Custom nutrition targets',
          createdById: options?.createdById ?? userId,
          calorieTarget: resolved.calories,
          proteinTarget: resolved.protein,
          carbTarget: resolved.carbs,
          fatTarget: resolved.fat,
          targetSource: resolved.source
        }
      });
    }

    // Re-scale the day the actor is looking at (the coach's/user's selected plan date),
    // defaulting to today. Past dates aren't re-scaled — they're historical record.
    const rescaleKey = options?.rescaleDate && options.rescaleDate >= todayKey ? options.rescaleDate : todayKey;
    const rescaleDay = parseDateParam(rescaleKey);

    const log = await ensureDailyLogByUserId(userId, rescaleKey);
    if (log) {
      // Card meals re-scale via the card system (safe — only PLANNED items). Fixed-item
      // template days re-scale their PLANNED items in place, which also never touches logged
      // ACTUAL intake. Only a day with no planned meals at all falls back to regeneration.
      const resynced = await resyncCardMealsToFrozenPeriod(userId, log.id, rescaleDay);
      const rescaled = resynced || (await rescalePlannedMealsToCalories(log.id, resolved.calories));
      if (!rescaled) {
        const actualItems = await prisma.mealItem.count({
          where: { meal: { dailyLogId: log.id }, type: 'ACTUAL' }
        });
        if (actualItems === 0) {
          if (program.defaultNutritionTemplateId) {
            await applyDefaultTemplateToNewLogOutsideTx(program, log.id, userId);
          } else {
            await applyStructureMealsToLog(userId, log.id, rescaleDay);
          }
        }
      }
      await prisma.dailyLog.update({
        where: { id: log.id },
        data: {
          calorieTarget: resolved.calories,
          proteinTarget: resolved.protein,
          carbTarget: resolved.carbs,
          fatTarget: resolved.fat
        }
      });
    }
  }

  return getUserNutritionTargets(userId);
}
