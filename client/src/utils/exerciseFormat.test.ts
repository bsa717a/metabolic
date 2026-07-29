import { describe, expect, it } from 'vitest';
import { formatPlan, formatPlanShort } from './exerciseFormat';

describe('formatPlan', () => {
  it('formats sets × reps with weight', () => {
    expect(formatPlan({ sets: 3, reps: '10', weight: 25 })).toBe('3 sets × 10 reps @ 25 lbs');
  });

  it('formats descending rep schemes', () => {
    expect(formatPlan({ sets: 3, reps: '15/12/10', weight: 25 })).toBe(
      '3 sets × 15/12/10 reps @ 25 lbs'
    );
  });

  it('formats sets × reps without weight, missing reps as em dash', () => {
    expect(formatPlan({ sets: 4, reps: null })).toBe('4 sets × — reps');
  });

  it('prefers sets over duration/distance/weight', () => {
    expect(formatPlan({ sets: 2, reps: '8', durationMinutes: 30, distance: 3, weight: 10 })).toBe(
      '2 sets × 8 reps @ 10 lbs'
    );
  });

  it('formats duration when no sets', () => {
    expect(formatPlan({ durationMinutes: 20 })).toBe('20 min');
  });

  it('formats distance when no sets or duration', () => {
    expect(formatPlan({ distance: 5 })).toBe('5 mi');
  });

  it('formats weight-only', () => {
    expect(formatPlan({ weight: 45 })).toBe('45 lbs');
  });

  it('falls back when nothing is prescribed', () => {
    expect(formatPlan({})).toBe('No prescription set');
  });
});

describe('formatPlanShort', () => {
  it('uses compact set notation', () => {
    expect(formatPlanShort({ sets: 3, reps: '10', weight: 25 })).toBe('3×10 @ 25 lbs');
  });

  it('falls back to em dash', () => {
    expect(formatPlanShort({})).toBe('—');
  });
});
