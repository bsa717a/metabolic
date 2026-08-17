import { describe, expect, it } from 'vitest';
import { exerciseRequiresGym, filterExerciseCatalog } from './exerciseCatalogFilter';

const catalog = [
  { id: '1', name: 'Goblet squat', requiresGym: false },
  { id: '2', name: 'Leg press', requiresGym: true },
  { id: '3', name: 'Push-up' }
];

describe('exerciseRequiresGym', () => {
  it('is true only when the flag is set', () => {
    expect(exerciseRequiresGym({ requiresGym: true })).toBe(true);
    expect(exerciseRequiresGym({ requiresGym: false })).toBe(false);
    expect(exerciseRequiresGym({})).toBe(false);
  });
});

describe('filterExerciseCatalog', () => {
  it('filters by name and can hide gym-only rows', () => {
    expect(filterExerciseCatalog(catalog, { query: 'press' }).map((item) => item.id)).toEqual(['2']);
    expect(filterExerciseCatalog(catalog, { hideGym: true }).map((item) => item.id)).toEqual(['1', '3']);
    expect(filterExerciseCatalog(catalog, { query: 'press', hideGym: true })).toEqual([]);
  });
});
