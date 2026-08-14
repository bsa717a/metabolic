import { describe, expect, it } from 'vitest';
import { repSchemeParts, repsForSet } from './repSchemes';

describe('repSchemeParts', () => {
  it('splits a descending scheme', () => {
    expect(repSchemeParts('15/12/10')).toEqual([15, 12, 10]);
  });

  it('returns a single part for a flat scheme', () => {
    expect(repSchemeParts('10')).toEqual([10]);
  });

  it('returns empty for missing or non-numeric values', () => {
    expect(repSchemeParts(null)).toEqual([]);
    expect(repSchemeParts('')).toEqual([]);
  });
});

describe('repsForSet', () => {
  it('picks the matching segment and reuses the last for extra sets', () => {
    expect(repsForSet('15/12/10', 1)).toBe(15);
    expect(repsForSet('15/12/10', 2)).toBe(12);
    expect(repsForSet('15/12/10', 3)).toBe(10);
    expect(repsForSet('15/12/10', 4)).toBe(10);
  });
});
