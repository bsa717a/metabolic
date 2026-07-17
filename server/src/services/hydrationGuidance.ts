import { ProgramStatus } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { n } from '../utils/numbers.js';

function roundToNearest8Oz(oz: number) {
  return Math.max(8, Math.round(oz / 8) * 8);
}

function formatHeightInches(totalInches: number) {
  const feet = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches % 12);
  return `${feet}'${inches}"`;
}

export type TypicalWaterIntake = {
  suggestedOz: number;
  lowOz: number;
  highOz: number;
  summary: string;
};

export type PersonalizedHydrationGuidance = {
  goalOz: number;
  heightInches: number | null;
  weightLbs: number | null;
  typicalIntake: TypicalWaterIntake | null;
  /** Ready-to-say line for goal-change questions. */
  personalizedGoalGuidance: string;
};

/** General hydration guidance from body size — not medical advice. */
export function estimateDailyWaterOz(params: {
  weightLbs?: number | null;
  heightInches?: number | null;
  activityLevel?: number | null;
}): TypicalWaterIntake | null {
  const weight = params.weightLbs;
  if (!weight || weight <= 0) return null;

  let baseOz = weight * 0.5;
  const activity = params.activityLevel ?? 3;
  if (activity >= 4) baseOz *= 1.12;
  else if (activity >= 3) baseOz *= 1.05;
  else if (activity <= 2) baseOz *= 0.95;

  const lowOz = roundToNearest8Oz(weight * 0.5);
  const highOz = roundToNearest8Oz(weight * 0.67);
  const suggestedOz = roundToNearest8Oz(baseOz);

  const heightInches = params.heightInches;
  const sizeLabel =
    heightInches && heightInches > 0
      ? `${formatHeightInches(heightInches)} and ${Math.round(weight)} lb`
      : `${Math.round(weight)} lb`;

  return {
    suggestedOz,
    lowOz,
    highOz,
    summary: `For someone ${sizeLabel}, a typical daily water intake is about ${suggestedOz} oz (often ${lowOz}–${highOz} oz depending on activity and climate). That's roughly half your body weight in ounces.`
  };
}

function resolveWeightLbs(
  weightMetric: { currentValue: unknown; startValue: unknown } | undefined,
  latestLogWeight: unknown
): number | null {
  if (weightMetric) {
    const current = n(weightMetric.currentValue);
    const start = n(weightMetric.startValue);
    if (current > 0) return current;
    if (start > 0) return start;
  }
  const logged = n(latestLogWeight);
  return logged > 0 ? logged : null;
}

/** Height/weight-based typical intake plus current goal — for coach context and tools. */
export async function loadPersonalizedHydrationGuidance(userId: string): Promise<PersonalizedHydrationGuidance> {
  const [user, program, latestWeightLog] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        waterGoalOz: true,
        clientProfile: { select: { heightInches: true, activityLevel: true } }
      }
    }),
    prisma.program.findFirst({
      where: { userId, status: ProgramStatus.ACTIVE },
      include: { metrics: true }
    }),
    prisma.dailyLog.findFirst({
      where: { userId, weight: { not: null } },
      orderBy: { date: 'desc' },
      select: { weight: true }
    })
  ]);

  const weightMetric = program?.metrics.find((metric) => metric.metricType === 'WEIGHT');
  const weightLbs = resolveWeightLbs(weightMetric, latestWeightLog?.weight);
  const heightInches = user?.clientProfile?.heightInches ?? null;
  const typicalIntake = estimateDailyWaterOz({
    weightLbs,
    heightInches,
    activityLevel: user?.clientProfile?.activityLevel ?? null
  });
  const goalOz = user?.waterGoalOz ?? 64;

  let personalizedGoalGuidance: string;
  if (typicalIntake) {
    personalizedGoalGuidance = `${typicalIntake.summary} Your current goal is ${goalOz} oz.`;
  } else if (!weightLbs && !heightInches) {
    personalizedGoalGuidance = `I don't have your height or weight on file yet to personalize a target. Your current goal is ${goalOz} oz.`;
  } else if (!weightLbs) {
    personalizedGoalGuidance = `I have your height but not your weight yet, so I can't estimate a personalized target. Your current goal is ${goalOz} oz.`;
  } else {
    personalizedGoalGuidance = `Your current goal is ${goalOz} oz.`;
  }

  return { goalOz, heightInches, weightLbs, typicalIntake, personalizedGoalGuidance };
}
