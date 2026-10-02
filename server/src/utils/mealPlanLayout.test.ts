import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mealPlanLayoutToPrisma, mealPlanLayoutToSlug } from './mealPlanLayout.js';

describe('mealPlanLayout', () => {
  it('defaults unknown values to the vertical list', () => {
    assert.equal(mealPlanLayoutToSlug(null), 'vertical');
    assert.equal(mealPlanLayoutToSlug(undefined), 'vertical');
    assert.equal(mealPlanLayoutToSlug('nope'), 'vertical');
    assert.equal(mealPlanLayoutToPrisma('nope'), 'VERTICAL');
  });

  it('round-trips both layouts', () => {
    assert.equal(mealPlanLayoutToSlug('HORIZONTAL'), 'horizontal');
    assert.equal(mealPlanLayoutToSlug('horizontal'), 'horizontal');
    assert.equal(mealPlanLayoutToPrisma('horizontal'), 'HORIZONTAL');
    assert.equal(mealPlanLayoutToSlug('VERTICAL'), 'vertical');
    assert.equal(mealPlanLayoutToPrisma('vertical'), 'VERTICAL');
  });
});
