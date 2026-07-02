import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeFormulaTargets,
  DEFAULT_MEAL_STRUCTURE,
  DEFAULT_TARGET_FORMULA,
  pickOverrideBand,
  slotTargets,
  targetFormulaConfigSchema
} from './targetService.js';

describe('computeFormulaTargets', () => {
  it('matches a hand-computed male profile', () => {
    // 5'11" (71"), 200 lbs, 40y, activity 3:
    // kg=90.72, cm=180.34 → BMR = 907.2 + 1127.1 - 200 + 5 = 1839.3
    // TDEE = 1839.3 × 1.55 = 2850.9 → ×0.8 = 2280.7 → 2281
    const t = computeFormulaTargets({ gender: 'm', heightInches: 71, weightLbs: 200, activityLevel: 3, ageYears: 40 });
    assert.equal(t.calories, 2281);
    assert.equal(t.protein, 180); // 0.9 g/lb
    // remaining 2281 - 720 = 1561 → carbs 55%/4 = 215, fat 45%/9 = 78
    assert.equal(t.carbs, 215);
    assert.equal(t.fat, 78);
  });

  it('matches a hand-computed female profile with defaults for age/activity', () => {
    // 5'4" (64"), 150 lbs, defaults age 40, activity 2:
    // kg=68.04, cm=162.56 → BMR = 680.4 + 1016.0 - 200 - 161 = 1335.4
    // TDEE = 1335.4 × 1.375 = 1836.2 → ×0.8 = 1469
    const t = computeFormulaTargets({ gender: 'f', heightInches: 64, weightLbs: 150 });
    assert.equal(t.calories, 1469);
    assert.equal(t.protein, 135);
  });

  it('applies the calorie floor and protein clamps', () => {
    const tiny = computeFormulaTargets({ gender: 'f', heightInches: 60, weightLbs: 95, activityLevel: 1, ageYears: 70 });
    assert.equal(tiny.calories, DEFAULT_TARGET_FORMULA.calorieFloor);
    assert.ok(tiny.protein >= DEFAULT_TARGET_FORMULA.proteinMinGrams);

    const heavy = computeFormulaTargets({ gender: 'm', heightInches: 75, weightLbs: 320, activityLevel: 3, ageYears: 35 });
    assert.ok(heavy.protein <= DEFAULT_TARGET_FORMULA.proteinMaxGrams);
    assert.ok(heavy.calories > 2500);
  });

  it('protein never exceeds 45% of calories', () => {
    const t = computeFormulaTargets({ gender: 'f', heightInches: 62, weightLbs: 240, activityLevel: 1, ageYears: 65 });
    assert.ok(t.protein * 4 <= t.calories * 0.45 + 4);
  });
});

describe('pickOverrideBand', () => {
  const wide = {
    id: 'wide',
    gender: 'f',
    heightMinInches: 60,
    heightMaxInches: 70,
    weightMinLbs: 100,
    weightMaxLbs: 250,
    activityLevelMin: 1,
    activityLevelMax: 5,
    calorieTarget: 1500,
    proteinTarget: 120,
    carbTarget: 150,
    fatTarget: 50
  };
  const narrow = { ...wide, id: 'narrow', heightMinInches: 63, heightMaxInches: 65, weightMinLbs: 140, weightMaxLbs: 170 };
  const profile = { gender: 'f' as const, heightInches: 64, weightLbs: 150, activityLevel: 2 };

  it('picks the most specific matching band', () => {
    assert.equal(pickOverrideBand([wide, narrow], profile)?.id, 'narrow');
    assert.equal(pickOverrideBand([narrow, wide], profile)?.id, 'narrow');
  });

  it('returns null when nothing matches', () => {
    assert.equal(pickOverrideBand([narrow], { ...profile, weightLbs: 300 }), null);
    assert.equal(pickOverrideBand([], profile), null);
  });
});

describe('slotTargets', () => {
  it('splits day calories by share and sums close to the total', () => {
    const slots = slotTargets(2000, DEFAULT_MEAL_STRUCTURE);
    assert.equal(slots.length, 6);
    assert.equal(slots[0].calorieTarget, 440); // 22%
    const sum = slots.reduce((s, slot) => s + slot.calorieTarget, 0);
    assert.ok(Math.abs(sum - 2000) <= slots.length); // rounding drift only
  });
});

describe('config schema', () => {
  it('accepts the default config round-tripped through JSON', () => {
    const parsed = targetFormulaConfigSchema.safeParse(JSON.parse(JSON.stringify(DEFAULT_TARGET_FORMULA)));
    assert.equal(parsed.success, true);
  });

  it('rejects unsafe values', () => {
    assert.equal(targetFormulaConfigSchema.safeParse({ ...DEFAULT_TARGET_FORMULA, calorieFloor: 400 }).success, false);
    assert.equal(targetFormulaConfigSchema.safeParse({ ...DEFAULT_TARGET_FORMULA, deficitPct: 60 }).success, false);
  });
});
