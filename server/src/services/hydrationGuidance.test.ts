import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { estimateDailyWaterOz } from './hydrationGuidance.js';

describe('estimateDailyWaterOz', () => {
  it('returns null without weight', () => {
    assert.equal(estimateDailyWaterOz({ heightInches: 70 }), null);
  });

  it('estimates from weight and height', () => {
    const result = estimateDailyWaterOz({ weightLbs: 180, heightInches: 70, activityLevel: 3 });
    assert.notEqual(result, null);
    assert.ok(result!.suggestedOz >= 80);
    assert.ok(result!.suggestedOz <= 120);
    assert.ok(result!.summary.includes("5'10\""));
    assert.ok(result!.summary.includes('180 lb'));
  });

  it('rounds to 8 oz increments', () => {
    const result = estimateDailyWaterOz({ weightLbs: 150 });
    assert.equal(result!.suggestedOz % 8, 0);
    assert.equal(result!.lowOz % 8, 0);
    assert.equal(result!.highOz % 8, 0);
  });
});
