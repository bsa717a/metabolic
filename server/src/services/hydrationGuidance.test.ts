import { describe, expect, it } from 'vitest';
import { estimateDailyWaterOz } from './hydrationGuidance.js';

describe('estimateDailyWaterOz', () => {
  it('returns null without weight', () => {
    expect(estimateDailyWaterOz({ heightInches: 70 })).toBeNull();
  });

  it('estimates from weight and height', () => {
    const result = estimateDailyWaterOz({ weightLbs: 180, heightInches: 70, activityLevel: 3 });
    expect(result).not.toBeNull();
    expect(result!.suggestedOz).toBeGreaterThanOrEqual(80);
    expect(result!.suggestedOz).toBeLessThanOrEqual(120);
    expect(result!.summary).toContain("5'10\"");
    expect(result!.summary).toContain('180 lb');
  });

  it('rounds to 8 oz increments', () => {
    const result = estimateDailyWaterOz({ weightLbs: 150 });
    expect(result!.suggestedOz % 8).toBe(0);
    expect(result!.lowOz % 8).toBe(0);
    expect(result!.highOz % 8).toBe(0);
  });
});
