import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileCalories } from './aiService.js';
import { lookupHasRoughEstimate, type FoodLookupResult } from './foodLookupService.js';

describe('reconcileCalories (macro/calorie sanity guard)', () => {
  it('keeps calories that already track the macros', () => {
    // 30P + 40C + 10F => 280 + 90 fat = 370 implied; 360 is within 25%.
    const out = reconcileCalories(360, 30, 40, 10);
    assert.equal(out.inconsistent, false);
    assert.equal(out.calories, 360);
  });

  it('flags inflated calories as inconsistent but keeps the reported value', () => {
    // 15P + 6C + 22F => 282 implied; 1250 is way off — keep label/report, don't rewrite to macro math.
    const out = reconcileCalories(1250, 15, 6, 22);
    assert.equal(out.inconsistent, true);
    assert.equal(out.calories, 1250);
  });

  it('keeps FDA-style label calories when macros do not sum exactly', () => {
    // Label says 200 cal; rounded macros imply ~133 — keep 200, flag inconsistent.
    const out = reconcileCalories(200, 2, 20, 5);
    assert.equal(out.inconsistent, true);
    assert.equal(out.calories, 200);
  });

  it('leaves calories alone when there are no macros to check against', () => {
    const out = reconcileCalories(120, 0, 0, 0);
    assert.equal(out.inconsistent, false);
    assert.equal(out.calories, 120);
  });
});

describe('lookupHasRoughEstimate', () => {
  const estimate = { normalizedFoodName: 'x', calories: 100, protein: 5, carbs: 5, fat: 2, confidence: 0.5 };

  it('flags LLM estimates as rough', () => {
    const result: FoodLookupResult = {
      source: 'ai',
      items: [{ source: 'ai', line: 'x', lookup: { id: '1' }, estimate, accurate: false }]
    };
    assert.equal(lookupHasRoughEstimate(result), true);
  });

  it('does not flag curated database foods', () => {
    const result: FoodLookupResult = {
      source: 'ai',
      items: [{ source: 'ai', line: 'x', lookup: { id: '1' }, estimate, accurate: true }]
    };
    assert.equal(lookupHasRoughEstimate(result), false);
  });

  it('does not flag local Food-table matches', () => {
    const result = {
      source: 'existing',
      items: [{ source: 'existing', line: 'x', food: { name: 'x' } }]
    } as unknown as FoodLookupResult;
    assert.equal(lookupHasRoughEstimate(result), false);
  });
});
