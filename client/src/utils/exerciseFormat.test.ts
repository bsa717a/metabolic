import { describe, expect, it } from 'vitest';
import { formatDuration, inputToSeconds, secondsToInput, convertDurationInput } from './duration';
import { formatPlan, formatPlanShort } from './exerciseFormat';

describe('duration helpers', () => {
  it('secondsToInput prefers minutes for whole-minute values', () => {
    expect(secondsToInput(120)).toEqual({ value: '2', unit: 'min' });
    expect(secondsToInput(60)).toEqual({ value: '1', unit: 'min' });
  });

  it('secondsToInput uses seconds when not divisible by 60', () => {
    expect(secondsToInput(30)).toEqual({ value: '30', unit: 'sec' });
    expect(secondsToInput(90)).toEqual({ value: '90', unit: 'sec' });
  });

  it('secondsToInput defaults empty to minutes', () => {
    expect(secondsToInput(null)).toEqual({ value: '', unit: 'min' });
    expect(secondsToInput(0)).toEqual({ value: '', unit: 'min' });
  });

  it('inputToSeconds converts units', () => {
    expect(inputToSeconds('2', 'min')).toBe(120);
    expect(inputToSeconds('30', 'sec')).toBe(30);
    expect(inputToSeconds('', 'min')).toBeNull();
    expect(inputToSeconds('0', 'sec')).toBeNull();
  });

  it('convertDurationInput preserves underlying seconds when toggling unit', () => {
    expect(convertDurationInput('20', 'min', 'sec')).toBe('1200');
    expect(convertDurationInput('1200', 'sec', 'min')).toBe('20');
    expect(convertDurationInput('30', 'sec', 'min')).toBe('1');
    expect(convertDurationInput('', 'min', 'sec')).toBe('');
  });

  it('formatDuration labels minutes vs seconds', () => {
    expect(formatDuration(120)).toBe('2 min');
    expect(formatDuration(30)).toBe('30s');
    expect(formatDuration(90)).toBe('90s');
  });
});

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
    expect(formatPlan({ sets: 2, reps: '8', durationSeconds: 1800, distance: 3, weight: 10 })).toBe(
      '2 sets × 8 reps @ 10 lbs'
    );
  });

  it('formats duration when no sets', () => {
    expect(formatPlan({ durationSeconds: 1200 })).toBe('20 min');
    expect(formatPlan({ durationSeconds: 30 })).toBe('30s');
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
