import { describe, expect, it } from 'vitest';
import { progressToGoal } from './journeyDialUtils';

describe('progressToGoal', () => {
  it('measures progress from start toward a lower goal', () => {
    expect(progressToGoal(46, 32, 15)).toBe(45);
  });

  it('measures progress from start toward a higher goal', () => {
    expect(progressToGoal(150, 155, 170)).toBe(25);
  });

  it('returns 100 when current meets goal', () => {
    expect(progressToGoal(46, 15, 15)).toBe(100);
  });

  it('returns 0 when no progress yet', () => {
    expect(progressToGoal(46, 46, 15)).toBe(0);
  });
});
