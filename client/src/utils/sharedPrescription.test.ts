import { describe, expect, it } from 'vitest';
import { sharedField } from './sharedPrescription';

describe('sharedField', () => {
  it('returns null for an empty list', () => {
    expect(sharedField([], (item: { sets?: number }) => item.sets)).toBeNull();
  });

  it('returns the common value when every item matches', () => {
    expect(sharedField([{ sets: 3 }, { sets: 3 }], (item) => item.sets)).toBe(3);
    expect(sharedField([{ reps: '10' }, { reps: '10' }], (item) => item.reps)).toBe('10');
  });

  it('returns null when values differ', () => {
    expect(sharedField([{ sets: 3 }, { sets: 4 }], (item) => item.sets)).toBeNull();
  });

  it('treats missing and null as the same empty value', () => {
    expect(sharedField([{ speed: null }, {}], (item) => item.speed)).toBeNull();
  });
});
