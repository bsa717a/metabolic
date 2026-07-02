import { ProgramStatus, TargetSource } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { n } from '../utils/numbers.js';
import { normalizeGender } from './bloodPanelMetrics.js';
import { templateMatchesProfile, templateSpecificityScore, type PlanMatchProfile } from './nutritionTemplateMatch.js';

/**
 * Formula-computed nutrition targets with nutritionist oversight.
 * Resolution order (most specific wins):
 *   coach pin on the Program → TargetOverrideBand (Tommy's exceptions) → formula.
 * The formula is total for anyone with gender + height + weight, so nobody falls
 * through; activity defaults to "lightly active" when unset.
 */

/* ---------------- config (AppSetting-backed, Tommy-tunable) ---------------- */

export const TARGET_FORMULA_SETTING_KEY = 'targetFormula';
export const MEAL_STRUCTURE_SETTING_KEY = 'mealStructure';

const activityLevels = ['1', '2', '3', '4', '5'] as const;

export const targetFormulaConfigSchema = z.object({
  /** TDEE multipliers per activity level 1–5 (sedentary → very active). */
  activityMultipliers: z.record(z.enum(activityLevels), z.number().min(1).max(2.5)),
  /** % below TDEE. */
  deficitPct: z.number().min(0).max(40),
  /** grams of protein per lb of body weight, clamped to the min/max below. */
  proteinPerLb: z.number().min(0.4).max(1.5),
  proteinMinGrams: z.number().min(40),
  proteinMaxGrams: z.number().max(300),
  /** hard safety floor for computed calories. */
  calorieFloor: z.number().min(1000),
  /** share of the non-protein calories that go to carbs (rest is fat). */
  carbShareOfRemaining: z.number().min(0.2).max(0.8)
});

export type TargetFormulaConfig = z.infer<typeof targetFormulaConfigSchema>;

export const DEFAULT_TARGET_FORMULA: TargetFormulaConfig = {
  activityMultipliers: { 1: 1.2, 2: 1.375, 3: 1.55, 4: 1.725, 5: 1.9 },
  deficitPct: 20,
  proteinPerLb: 0.9,
  proteinMinGrams: 80,
  proteinMaxGrams: 220,
  calorieFloor: 1200,
  carbShareOfRemaining: 0.55
};

const mealSlotSchema = z.object({
  mealNumber: z.number().int().min(1),
  name: z.string().min(1),
  plannedTime: z.string().nullable(),
  /** this slot's share of the day's calories, in percent. */
  sharePct: z.number().min(0).max(100),
  slotType: z.enum(['BREAKFAST', 'SNACK', 'LUNCH', 'DINNER'])
});

export const mealStructureSchema = z.object({ slots: z.array(mealSlotSchema).min(1) });

export type MealStructure = z.infer<typeof mealStructureSchema>;
export type MealSlot = z.infer<typeof mealSlotSchema>;

/** Mirrors the six-meal structure the seeded templates share. */
export const DEFAULT_MEAL_STRUCTURE: MealStructure = {
  slots: [
    { mealNumber: 1, name: 'Breakfast', plannedTime: '07:30', sharePct: 22, slotType: 'BREAKFAST' },
    { mealNumber: 2, name: 'Snack', plannedTime: '10:30', sharePct: 13, slotType: 'SNACK' },
    { mealNumber: 3, name: 'Lunch', plannedTime: '12:30', sharePct: 22, slotType: 'LUNCH' },
    { mealNumber: 4, name: 'Snack', plannedTime: '15:30', sharePct: 13, slotType: 'SNACK' },
    { mealNumber: 5, name: 'Dinner', plannedTime: '18:30', sharePct: 22, slotType: 'DINNER' },
    { mealNumber: 6, name: 'Evening snack', plannedTime: '21:00', sharePct: 8, slotType: 'SNACK' }
  ]
};

async function readJsonSetting<T>(key: string, schema: z.ZodType<T>, fallback: T): Promise<T> {
  const row = await prisma.appSetting.findUnique({ where: { key } });
  if (!row) return fallback;
  try {
    const parsed = schema.safeParse(JSON.parse(row.value));
    return parsed.success ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}

export function getTargetFormulaConfig() {
  return readJsonSetting(TARGET_FORMULA_SETTING_KEY, targetFormulaConfigSchema, DEFAULT_TARGET_FORMULA);
}

export function getMealStructure() {
  return readJsonSetting(MEAL_STRUCTURE_SETTING_KEY, mealStructureSchema, DEFAULT_MEAL_STRUCTURE);
}

/* ---------------- the formula (pure, unit-tested) ---------------- */

export type TargetProfileInput = {
  gender: 'm' | 'f';
  heightInches: number;
  weightLbs: number;
  activityLevel?: number | null;
  ageYears?: number | null;
};

export type ResolvedTargets = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source: TargetSource;
};

const DEFAULT_ACTIVITY = 2;
const DEFAULT_AGE_YEARS = 40;

export function computeFormulaTargets(
  profile: TargetProfileInput,
  config: TargetFormulaConfig = DEFAULT_TARGET_FORMULA
): Omit<ResolvedTargets, 'source'> {
  const kg = profile.weightLbs * 0.45359237;
  const cm = profile.heightInches * 2.54;
  const age = profile.ageYears && profile.ageYears > 0 ? profile.ageYears : DEFAULT_AGE_YEARS;
  const activity = Math.min(5, Math.max(1, Math.round(profile.activityLevel ?? DEFAULT_ACTIVITY)));

  // Mifflin-St Jeor
  const bmr = 10 * kg + 6.25 * cm - 5 * age + (profile.gender === 'm' ? 5 : -161);
  const tdee = bmr * (config.activityMultipliers[String(activity) as (typeof activityLevels)[number]] ?? 1.375);
  const calories = Math.max(config.calorieFloor, Math.round(tdee * (1 - config.deficitPct / 100)));

  let protein = Math.round(profile.weightLbs * config.proteinPerLb);
  protein = Math.min(config.proteinMaxGrams, Math.max(config.proteinMinGrams, protein));
  // never let protein exceed 45% of calories (very light + very heavy edge cases)
  protein = Math.min(protein, Math.floor((calories * 0.45) / 4));

  const remaining = Math.max(0, calories - protein * 4);
  const carbs = Math.round((remaining * config.carbShareOfRemaining) / 4);
  const fat = Math.round((remaining * (1 - config.carbShareOfRemaining)) / 9);

  return { calories, protein, carbs, fat };
}

/* ---------------- override bands ---------------- */

type OverrideBandRow = {
  id: string;
  gender: string;
  heightMinInches: number;
  heightMaxInches: number;
  weightMinLbs: unknown;
  weightMaxLbs: unknown;
  activityLevelMin: number;
  activityLevelMax: number;
  calorieTarget: unknown;
  proteinTarget: unknown;
  carbTarget: unknown;
  fatTarget: unknown;
};

/** Most-specific matching band, or null. Reuses the template criteria predicates. */
export function pickOverrideBand<T extends OverrideBandRow>(bands: T[], profile: PlanMatchProfile): T | null {
  const matches = bands.filter((band) => templateMatchesProfile(band, profile));
  if (!matches.length) return null;
  return [...matches].sort((a, b) => templateSpecificityScore(a) - templateSpecificityScore(b))[0];
}

/* ---------------- slot splitting ---------------- */

export type SlotTarget = MealSlot & { calorieTarget: number };

export function slotTargets(dayCalories: number, structure: MealStructure): SlotTarget[] {
  const totalShare = structure.slots.reduce((s, slot) => s + slot.sharePct, 0) || 100;
  return structure.slots.map((slot) => ({
    ...slot,
    calorieTarget: Math.round((dayCalories * slot.sharePct) / totalShare)
  }));
}

/* ---------------- resolution ---------------- */

function ageFromBirthDate(birthDate: Date | null): number | null {
  if (!birthDate) return null;
  const ms = Date.now() - birthDate.getTime();
  const years = ms / (365.25 * 24 * 3600 * 1000);
  return years > 10 && years < 110 ? Math.floor(years) : null;
}

/**
 * Resolve the targets a user should be on right now. Returns null only when the
 * profile lacks the formula's minimum (gender + height + weight) — callers fall
 * back to legacy behavior in that case.
 */
export async function resolveTargets(userId: string): Promise<ResolvedTargets | null> {
  const [user, program] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        gender: true,
        birthDate: true,
        clientProfile: { select: { heightInches: true, activityLevel: true } }
      }
    }),
    prisma.program.findFirst({
      where: { userId, status: ProgramStatus.ACTIVE },
      select: {
        pinnedCalorieTarget: true,
        pinnedProteinTarget: true,
        pinnedCarbTarget: true,
        pinnedFatTarget: true,
        metrics: { where: { metricType: 'WEIGHT' }, select: { currentValue: true } }
      }
    })
  ]);

  const gender = normalizeGender(user?.gender ?? null);
  const heightInches = user?.clientProfile?.heightInches ?? null;
  const weightLbs = program?.metrics[0] ? n(program.metrics[0].currentValue) : null;
  if ((gender !== 'm' && gender !== 'f') || !heightInches || !weightLbs || weightLbs <= 0) return null;

  const activityLevel = user?.clientProfile?.activityLevel ?? DEFAULT_ACTIVITY;
  const config = await getTargetFormulaConfig();
  const formula = computeFormulaTargets(
    {
      gender,
      heightInches,
      weightLbs,
      activityLevel,
      ageYears: ageFromBirthDate(user?.birthDate ?? null)
    },
    config
  );

  // 1. Coach pin — partial pins fall back to the formula per macro.
  if (program?.pinnedCalorieTarget != null) {
    return {
      calories: Math.round(n(program.pinnedCalorieTarget)),
      protein: program.pinnedProteinTarget != null ? Math.round(n(program.pinnedProteinTarget)) : formula.protein,
      carbs: program.pinnedCarbTarget != null ? Math.round(n(program.pinnedCarbTarget)) : formula.carbs,
      fat: program.pinnedFatTarget != null ? Math.round(n(program.pinnedFatTarget)) : formula.fat,
      source: TargetSource.COACH
    };
  }

  // 2. Nutritionist override band.
  const bands = await prisma.targetOverrideBand.findMany({ where: { gender } });
  const band = pickOverrideBand(bands, { gender, heightInches, weightLbs, activityLevel });
  if (band) {
    return {
      calories: Math.round(n(band.calorieTarget)),
      protein: Math.round(n(band.proteinTarget)),
      carbs: Math.round(n(band.carbTarget)),
      fat: Math.round(n(band.fatTarget)),
      source: TargetSource.OVERRIDE_BAND
    };
  }

  // 3. The formula — total for everyone who reaches here.
  return { ...formula, source: TargetSource.FORMULA };
}
