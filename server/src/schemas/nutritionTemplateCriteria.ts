import { Visibility } from '@prisma/client';
import { z } from 'zod';

const genderSchema = z.enum(['m', 'f', 'male', 'female']).transform((value) => {
  const normalized = value.toLowerCase();
  if (normalized === 'male') return 'm';
  if (normalized === 'female') return 'f';
  return normalized as 'm' | 'f';
});

const criteriaFields = {
  gender: genderSchema.nullable().optional(),
  heightMinInches: z.number().int().min(36).max(96).nullable().optional(),
  heightMaxInches: z.number().int().min(36).max(96).nullable().optional(),
  weightMinLbs: z.number().finite().min(50).max(1000).nullable().optional(),
  weightMaxLbs: z.number().finite().min(50).max(1000).nullable().optional(),
  activityLevelMin: z.number().int().min(1).max(5).nullable().optional(),
  activityLevelMax: z.number().int().min(1).max(5).nullable().optional()
};

function validateCriteriaRanges(body: {
  heightMinInches?: number | null;
  heightMaxInches?: number | null;
  weightMinLbs?: number | null;
  weightMaxLbs?: number | null;
  activityLevelMin?: number | null;
  activityLevelMax?: number | null;
}) {
  if (
    body.heightMinInches != null &&
    body.heightMaxInches != null &&
    body.heightMinInches > body.heightMaxInches
  ) {
    return 'Height minimum must be less than or equal to maximum';
  }
  if (body.weightMinLbs != null && body.weightMaxLbs != null && body.weightMinLbs > body.weightMaxLbs) {
    return 'Weight minimum must be less than or equal to maximum';
  }
  if (
    body.activityLevelMin != null &&
    body.activityLevelMax != null &&
    body.activityLevelMin > body.activityLevelMax
  ) {
    return 'Activity minimum must be less than or equal to maximum';
  }
  return null;
}

function validateGlobalCriteriaRequired(body: {
  visibility?: Visibility;
  gender?: 'm' | 'f' | null;
  heightMinInches?: number | null;
  heightMaxInches?: number | null;
  weightMinLbs?: number | null;
  weightMaxLbs?: number | null;
  activityLevelMin?: number | null;
  activityLevelMax?: number | null;
}) {
  if (body.visibility !== Visibility.GLOBAL) return null;
  const required = [
    body.gender,
    body.heightMinInches,
    body.heightMaxInches,
    body.weightMinLbs,
    body.weightMaxLbs,
    body.activityLevelMin,
    body.activityLevelMax
  ];
  if (required.some((value) => value == null)) {
    return 'GLOBAL plans require gender, height, weight, and activity criteria';
  }
  return null;
}

export function createNutritionTemplateBodySchema(requireName = true, requireGlobalCriteria = false) {
  return z
    .object({
      name: requireName ? z.string().trim().min(1) : z.string().trim().min(1).optional(),
      description: z.string().trim().nullable().optional(),
      visibility: z.nativeEnum(Visibility).optional(),
      calorieTarget: z.number().finite().min(0).optional(),
      proteinTarget: z.number().finite().min(0).optional(),
      carbTarget: z.number().finite().min(0).optional(),
      fatTarget: z.number().finite().min(0).optional(),
      ...criteriaFields
    })
    .superRefine((body, ctx) => {
      const rangeError = validateCriteriaRanges(body);
      if (rangeError) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: rangeError });
      }
      if (requireGlobalCriteria) {
        const globalError = validateGlobalCriteriaRequired(body);
        if (globalError) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: globalError });
        }
      }
    });
}

export const nutritionTemplateCreateBody = createNutritionTemplateBodySchema(true, false);

export const nutritionTemplateUpdateBody = createNutritionTemplateBodySchema(false, true).refine(
  (body) => Object.keys(body).length > 0,
  { message: 'At least one field is required' }
);

export type NutritionTemplateCriteriaInput = z.infer<typeof nutritionTemplateCreateBody>;
