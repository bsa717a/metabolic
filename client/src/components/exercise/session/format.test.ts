import { describe, expect, it } from 'vitest';
import { timerCueKind } from './format';

describe('timerCueKind', () => {
  it('is idle above 5s and when paused', () => {
    expect(timerCueKind(5001, false)).toBe('idle');
    expect(timerCueKind(500, true)).toBe('idle');
    expect(timerCueKind(0, true)).toBe('idle');
  });

  it('is countdown from 5 seconds (amber includes silent 4)', () => {
    expect(timerCueKind(5000, false)).toBe('countdown');
    expect(timerCueKind(4000, false)).toBe('countdown');
    expect(timerCueKind(3000, false)).toBe('countdown');
    expect(timerCueKind(1, false)).toBe('countdown');
  });

  it('is go at zero', () => {
    expect(timerCueKind(0, false)).toBe('go');
    expect(timerCueKind(-10, false)).toBe('go');
  });
});
