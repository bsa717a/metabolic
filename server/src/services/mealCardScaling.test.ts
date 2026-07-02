import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveServings, scaleFactor, scaleOptionFood, sumLines } from './mealCardScaling.js';

describe('mealCardScaling', () => {
  // Worked example from docs/dinner-card-builder-plan.md:
  // set authored at 660 kcal reference; female dinner target 480 → factor ≈ 0.727
  const factor = scaleFactor(480, 660);

  it('computes the calorie scale factor', () => {
    assert.ok(Math.abs(factor - 480 / 660) < 1e-12);
  });

  it('falls back to factor 1 on missing or zero targets', () => {
    assert.equal(scaleFactor(0, 660), 1);
    assert.equal(scaleFactor(480, 0), 1);
    assert.equal(scaleFactor(null, undefined), 1);
  });

  it('scales a continuous line (ground beef 3 servings → ~2.18)', () => {
    const { servings, rounded } = resolveServings(
      { baseServings: 3, scalable: true, discrete: false, unitStep: 1 },
      factor
    );
    assert.equal(servings, 2.18);
    assert.equal(rounded, false);
  });

  it('rounds discrete lines to whole units (3 tortillas → 2)', () => {
    const { servings, rounded } = resolveServings(
      { baseServings: 3, scalable: true, discrete: true, unitStep: 1 },
      factor
    );
    assert.equal(servings, 2);
    assert.equal(rounded, true);
  });

  it('never rounds a discrete line below one step', () => {
    const { servings } = resolveServings(
      { baseServings: 1, scalable: true, discrete: true, unitStep: 1 },
      0.2
    );
    assert.equal(servings, 1);
  });

  it('keeps non-scalable lines fixed (salsa)', () => {
    const { servings, rounded } = resolveServings(
      { baseServings: 1, scalable: false, discrete: false, unitStep: 1 },
      factor
    );
    assert.equal(servings, 1);
    assert.equal(rounded, false);
  });

  it('clamps to min/max servings', () => {
    const clampedLow = resolveServings(
      { baseServings: 2, scalable: true, discrete: false, unitStep: 1, minServings: 1.8 },
      0.5
    );
    assert.equal(clampedLow.servings, 1.8);

    const clampedHigh = resolveServings(
      { baseServings: 2, scalable: true, discrete: false, unitStep: 1, maxServings: 2.5 },
      2
    );
    assert.equal(clampedHigh.servings, 2.5);
  });

  it('derives quantity and macros live from the food per-serving values', () => {
    // Ground beef: servingSize 2 oz, 105 kcal / 11p / 0c / 6f per serving, base 3 servings
    const line = scaleOptionFood(
      {
        foodId: 'beef',
        baseServings: 3,
        scalable: true,
        discrete: false,
        unitStep: 1,
        food: { name: 'Ground beef 90/10', servingSize: 2, servingUnit: 'oz', calories: 105, protein: 11, carbs: 0, fat: 6 }
      },
      factor
    );
    assert.equal(line.servings, 2.18);
    assert.equal(line.quantity, 4.36); // ~4.4 oz, matching the plan doc's table
    assert.equal(line.unit, 'oz');
    assert.equal(line.calories, 228.9);
    assert.equal(line.protein, 23.98);
    assert.equal(line.free, false);
  });

  it('marks fixed lines as free and sums totals', () => {
    const salsa = scaleOptionFood(
      {
        foodId: 'salsa',
        baseServings: 1,
        scalable: false,
        discrete: false,
        unitStep: 1,
        food: { name: 'Salsa', servingSize: 2, servingUnit: 'tbsp', calories: 10, protein: 0, carbs: 2, fat: 0 }
      },
      factor
    );
    assert.equal(salsa.free, true);
    assert.equal(salsa.calories, 10);

    const totals = sumLines([salsa, salsa]);
    assert.equal(totals.calories, 20);
    assert.equal(totals.carbs, 4);
  });

  it('scale factor 1 reproduces the authored reference exactly', () => {
    const { servings } = resolveServings(
      { baseServings: 3, scalable: true, discrete: true, unitStep: 1 },
      scaleFactor(660, 660)
    );
    assert.equal(servings, 3);
  });
});
