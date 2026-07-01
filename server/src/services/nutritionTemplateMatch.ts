import { ProgramStatus, type Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { normalizeGender } from './bloodPanelMetrics.js';
import { n } from '../utils/numbers.js';

export type PlanMatchProfile = {
  gender: 'm' | 'f';
  heightInches: number;
  weightLbs: number;
  activityLevel: number;
};

export type PlanMatchProfileInput = {
  gender?: string | null;
  heightFeet?: number;
  heightInches?: number;
  heightInchesTotal?: number;
  weightLbs?: number;
  activityLevel?: number | null;
};

export function isCompletePlanMatchProfile(profile: Partial<PlanMatchProfile>): profile is PlanMatchProfile {
  return (
    (profile.gender === 'm' || profile.gender === 'f') &&
    typeof profile.heightInches === 'number' &&
    profile.heightInches > 0 &&
    typeof profile.weightLbs === 'number' &&
    profile.weightLbs > 0 &&
    typeof profile.activityLevel === 'number' &&
    profile.activityLevel >= 1 &&
    profile.activityLevel <= 5
  );
}

export function buildProfileFromInput(input: PlanMatchProfileInput): Partial<PlanMatchProfile> {
  const gender = normalizeGender(input.gender ?? null) ?? undefined;
  let heightInches = input.heightInchesTotal;
  if (heightInches === undefined && (input.heightFeet !== undefined || input.heightInches !== undefined)) {
    heightInches = (input.heightFeet ?? 0) * 12 + (input.heightInches ?? 0);
  }
  return {
    gender,
    heightInches: heightInches && heightInches > 0 ? heightInches : undefined,
    weightLbs: input.weightLbs && input.weightLbs > 0 ? input.weightLbs : undefined,
    activityLevel:
      input.activityLevel != null && input.activityLevel >= 1 && input.activityLevel <= 5
        ? input.activityLevel
        : undefined
  };
}

export const completeTemplateCriteriaWhere = {
  gender: { not: null },
  heightMinInches: { not: null },
  heightMaxInches: { not: null },
  weightMinLbs: { not: null },
  weightMaxLbs: { not: null },
  activityLevelMin: { not: null },
  activityLevelMax: { not: null }
} satisfies Prisma.NutritionPlanTemplateWhereInput;

export function hasCompleteTemplateCriteria(template: {
  gender: string | null;
  heightMinInches: number | null;
  heightMaxInches: number | null;
  weightMinLbs: unknown;
  weightMaxLbs: unknown;
  activityLevelMin: number | null;
  activityLevelMax: number | null;
}) {
  return (
    (template.gender === 'm' || template.gender === 'f') &&
    template.heightMinInches != null &&
    template.heightMaxInches != null &&
    template.heightMinInches <= template.heightMaxInches &&
    template.weightMinLbs != null &&
    template.weightMaxLbs != null &&
    n(template.weightMinLbs) <= n(template.weightMaxLbs) &&
    template.activityLevelMin != null &&
    template.activityLevelMax != null &&
    template.activityLevelMin <= template.activityLevelMax
  );
}

export function buildTemplateMatchWhere(profile: PlanMatchProfile): Prisma.NutritionPlanTemplateWhereInput {
  return {
    ...completeTemplateCriteriaWhere,
    gender: profile.gender,
    heightMinInches: { lte: profile.heightInches },
    heightMaxInches: { gte: profile.heightInches },
    weightMinLbs: { lte: profile.weightLbs },
    weightMaxLbs: { gte: profile.weightLbs },
    activityLevelMin: { lte: profile.activityLevel },
    activityLevelMax: { gte: profile.activityLevel }
  };
}

export function templateMatchesProfile(
  template: {
    gender: string | null;
    heightMinInches: number | null;
    heightMaxInches: number | null;
    weightMinLbs: unknown;
    weightMaxLbs: unknown;
    activityLevelMin: number | null;
    activityLevelMax: number | null;
  },
  profile: PlanMatchProfile
) {
  if (!hasCompleteTemplateCriteria(template)) return false;
  const weightMin = n(template.weightMinLbs);
  const weightMax = n(template.weightMaxLbs);
  return (
    template.gender === profile.gender &&
    template.heightMinInches! <= profile.heightInches &&
    template.heightMaxInches! >= profile.heightInches &&
    weightMin <= profile.weightLbs &&
    weightMax >= profile.weightLbs &&
    template.activityLevelMin! <= profile.activityLevel &&
    template.activityLevelMax! >= profile.activityLevel
  );
}

export function templateSpecificityScore(template: {
  heightMinInches: number | null;
  heightMaxInches: number | null;
  weightMinLbs: unknown;
  weightMaxLbs: unknown;
  activityLevelMin: number | null;
  activityLevelMax: number | null;
}) {
  if (
    template.heightMinInches == null ||
    template.heightMaxInches == null ||
    template.weightMinLbs == null ||
    template.weightMaxLbs == null ||
    template.activityLevelMin == null ||
    template.activityLevelMax == null
  ) {
    return Number.POSITIVE_INFINITY;
  }
  const heightSpan = template.heightMaxInches - template.heightMinInches;
  const weightSpan = n(template.weightMaxLbs) - n(template.weightMinLbs);
  const activitySpan = template.activityLevelMax - template.activityLevelMin;
  return heightSpan + weightSpan + activitySpan;
}

export async function getUserPlanMatchProfile(userId: string): Promise<Partial<PlanMatchProfile>> {
  const [user, program] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        gender: true,
        clientProfile: {
          select: { heightInches: true, activityLevel: true }
        }
      }
    }),
    prisma.program.findFirst({
      where: { userId, status: ProgramStatus.ACTIVE },
      include: { metrics: true }
    })
  ]);

  const weightMetric = program?.metrics.find((metric) => metric.metricType === 'WEIGHT');
  const gender = normalizeGender(user?.gender) ?? undefined;
  const heightInches = user?.clientProfile?.heightInches ?? undefined;
  const weightLbs = weightMetric ? n(weightMetric.currentValue) : undefined;
  const activityLevel = user?.clientProfile?.activityLevel ?? undefined;

  return buildProfileFromInput({
    gender,
    heightInchesTotal: heightInches,
    weightLbs: weightLbs && weightLbs > 0 ? weightLbs : undefined,
    activityLevel
  });
}

export async function findBestMatchingTemplate(
  profile: PlanMatchProfile,
  extraWhere?: Prisma.NutritionPlanTemplateWhereInput
) {
  const templates = await prisma.nutritionPlanTemplate.findMany({
    where: {
      ...buildTemplateMatchWhere(profile),
      ...extraWhere
    },
    orderBy: { updatedAt: 'desc' }
  });

  if (!templates.length) return null;

  return [...templates].sort((a, b) => {
    const scoreDiff = templateSpecificityScore(a) - templateSpecificityScore(b);
    if (scoreDiff !== 0) return scoreDiff;
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  })[0];
}

export async function assertTemplateMatchesUser(templateId: string, userId: string) {
  const [template, profile] = await Promise.all([
    prisma.nutritionPlanTemplate.findUnique({ where: { id: templateId } }),
    getUserPlanMatchProfile(userId)
  ]);

  if (!template) throw new Error('Plan not found');
  if (!hasCompleteTemplateCriteria(template)) {
    throw new Error('Plan not available');
  }
  if (!isCompletePlanMatchProfile(profile)) {
    throw new Error('Complete your profile before applying a plan');
  }
  if (!templateMatchesProfile(template, profile)) {
    throw new Error('Plan does not match your profile');
  }
}
