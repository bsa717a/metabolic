/**
 * Weekly plan resolution (Gap B). The single seam that decides which nutrition/exercise template
 * applies on a given date. Reads the latest PlanPeriod on/before the date and carries each template
 * type forward independently; falls back to the Program defaults so programs with no PlanPeriod rows
 * behave exactly as they do today.
 *
 * NOTE: requires the `weekly_plans` migration (PlanPeriod table) to be applied before use.
 * Not yet wired into ensureDailyLog / the coach apply-template path — see docs/weekly-plans-plan.md.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../db/prisma.js';

export interface ResolvedPlan {
  planPeriodId: string | null;
  nutritionTemplateId: string | null;
  exerciseTemplateId: string | null;
}

type ProgramLike = {
  id: string;
  defaultNutritionTemplateId: string | null;
  defaultExerciseTemplateId: string | null;
};

type Db = PrismaClient | Prisma.TransactionClient;

/** The plan in effect for `date`. See file header for fallback semantics. */
export async function resolvePlanForDate(program: ProgramLike, date: Date, db: Db = prisma): Promise<ResolvedPlan> {
  const periods = await db.planPeriod.findMany({
    where: { programId: program.id, effectiveDate: { lte: date } },
    orderBy: { effectiveDate: 'desc' },
    select: { id: true, nutritionTemplateId: true, exerciseTemplateId: true }
  });

  // Carry each template type forward independently: a period that only changed nutrition leaves the
  // most recent prior exercise template in force (matches "the plan continues until changed").
  const nutrition = periods.find((p) => p.nutritionTemplateId)?.nutritionTemplateId ?? null;
  const exercise = periods.find((p) => p.exerciseTemplateId)?.exerciseTemplateId ?? null;

  return {
    planPeriodId: periods[0]?.id ?? null,
    nutritionTemplateId: nutrition ?? program.defaultNutritionTemplateId,
    exerciseTemplateId: exercise ?? program.defaultExerciseTemplateId
  };
}
