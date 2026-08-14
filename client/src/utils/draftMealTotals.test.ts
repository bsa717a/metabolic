import { describe, expect, it } from 'vitest';
import { clearDraftTotalsIfNeeded, nextDraftTotalsByMeal } from './draftMealTotals';

const totals = { calories: 400, protein: 30, carbs: 20, fat: 10 };

describe('draftMealTotals', () => {
  it('does not allocate a new object when clearing an already-empty map', () => {
    const empty = {};
    expect(clearDraftTotalsIfNeeded(empty)).toBe(empty);
  });

  it('clears a non-empty map', () => {
    expect(clearDraftTotalsIfNeeded({ m1: totals })).toEqual({});
  });

  it('returns the same state when a meal’s totals are unchanged', () => {
    const prev = { m1: totals };
    expect(nextDraftTotalsByMeal(prev, 'm1', { ...totals })).toBe(prev);
  });

  it('updates when totals change', () => {
    const prev = { m1: totals };
    const next = nextDraftTotalsByMeal(prev, 'm1', { ...totals, calories: 500 });
    expect(next).not.toBe(prev);
    expect(next.m1.calories).toBe(500);
  });
});
