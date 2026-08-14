import { describe, expect, it } from 'vitest';
import { timerCueKind } from './format';

describe('timerCueKind', () => {
  it('is idle above 3s and when paused', () => {
    expect(timerCueKind(4500, false)).toBe('idle');
    expect(timerCueKind(500, true)).toBe('idle');
    expect(timerCueKind(0, true)).toBe('idle');
  });

  it('is countdown in the last 3 seconds', () => {
    expect(timerCueKind(3000, false)).toBe('countdown');
    expect(timerCueKind(1, false)).toBe('countdown');
  });

  it('is go at zero', () => {
    expect(timerCueKind(0, false)).toBe('go');
    expect(timerCueKind(-10, false)).toBe('go');
  });
});
