import { describe, expect, it } from 'vitest';
import {
  defaultPicks,
  foodsLabel,
  missingCoverageRole,
  picksToSelections,
  restorePicks,
  selectionTotals,
  togglePick,
  type DinnerCard,
  type DinnerCardOption
} from './dinnerCards';

function option(id: string, overrides: Partial<DinnerCardOption> = {}): DinnerCardOption {
  return {
    id,
    name: id,
    description: null,
    icon: null,
    isDefault: false,
    sortOrder: 0,
    foods: [],
    totals: { calories: 0, protein: 0, carbs: 0, fat: 0 },
    ...overrides
  };
}

function card(id: string, overrides: Partial<DinnerCard> = {}): DinnerCard {
  return {
    id,
    role: 'PROTEIN',
    name: id,
    pickRule: null,
    required: true,
    maxSelect: 1,
    sortOrder: 0,
    options: [],
    ...overrides
  };
}

const protein = card('protein', {
  role: 'PROTEIN',
  options: [
    option('beef', { isDefault: true, totals: { calories: 229, protein: 24, carbs: 0, fat: 13 } }),
    option('shrimp', { totals: { calories: 101, protein: 20, carbs: 0, fat: 2 } })
  ]
});
const carb = card('carb', {
  role: 'CARB',
  options: [option('tortillas', { isDefault: true, totals: { calories: 70, protein: 2, carbs: 12, fat: 2 } })]
});
const free = card('free', {
  role: 'FREE',
  required: false,
  maxSelect: 3,
  options: [
    option('salsa', { isDefault: true, totals: { calories: 9, protein: 0, carbs: 2, fat: 0 } }),
    option('pico', { totals: { calories: 10, protein: 0, carbs: 2, fat: 0 } }),
    option('hot-sauce', { totals: { calories: 0, protein: 0, carbs: 0, fat: 0 } }),
    option('jalapenos', { totals: { calories: 5, protein: 0, carbs: 1, fat: 0 } })
  ]
});
const cards = [protein, carb, free];

describe('defaultPicks', () => {
  it('selects the default option per card, first option for required cards without one', () => {
    const noDefault = card('veg', { role: 'VEGETABLE', options: [option('peppers'), option('broccoli')] });
    expect(defaultPicks([protein, noDefault, free])).toEqual({
      protein: ['beef'],
      veg: ['peppers'],
      free: ['salsa']
    });
  });

  it('leaves optional cards empty when nothing is default', () => {
    const optional = card('extras', { required: false, options: [option('a')] });
    expect(defaultPicks([optional])).toEqual({ extras: [] });
  });
});

describe('restorePicks', () => {
  it('restores saved single and multi selections', () => {
    const picks = restorePicks(cards, { protein: 'shrimp', free: ['pico', 'hot-sauce'] });
    expect(picks).toEqual({ protein: ['shrimp'], carb: ['tortillas'], free: ['pico', 'hot-sauce'] });
  });

  it('drops saved option ids that no longer exist, keeps defaults for missing cards', () => {
    const picks = restorePicks(cards, { protein: 'retired-option' });
    expect(picks.protein).toEqual([]);
    expect(picks.carb).toEqual(['tortillas']);
  });
});

describe('togglePick', () => {
  it('replaces the pick on single-select cards', () => {
    const picks = togglePick(protein, { protein: ['beef'] }, 'shrimp');
    expect(picks.protein).toEqual(['shrimp']);
  });

  it('toggles on/off for multi-select and enforces maxSelect', () => {
    let picks = { free: ['salsa'] };
    picks = togglePick(free, picks, 'pico');
    picks = togglePick(free, picks, 'hot-sauce');
    expect(picks.free).toEqual(['salsa', 'pico', 'hot-sauce']);
    // at maxSelect 3 — a fourth pick is ignored
    expect(togglePick(free, picks, 'jalapenos').free).toEqual(['salsa', 'pico', 'hot-sauce']);
    // toggling an existing pick removes it
    expect(togglePick(free, picks, 'pico').free).toEqual(['salsa', 'hot-sauce']);
  });
});

describe('selectionTotals + coverage', () => {
  it('sums option totals across picks', () => {
    const totals = selectionTotals(cards, { protein: ['beef'], carb: ['tortillas'], free: ['salsa', 'pico'] });
    expect(totals.calories).toBe(229 + 70 + 9 + 10);
  });

  it('flags the first uncovered blood-sugar role', () => {
    expect(missingCoverageRole(cards, { protein: [], carb: ['tortillas'], free: [] })).toBe('PROTEIN');
    expect(missingCoverageRole(cards, { protein: ['beef'], carb: ['tortillas'], free: [] })).toBeUndefined();
  });

  it('ignores roles the set does not offer (no VEGETABLE card here)', () => {
    expect(missingCoverageRole(cards, { protein: ['beef'], carb: ['tortillas'], free: [] })).not.toBe('VEGETABLE');
  });
});

describe('picksToSelections', () => {
  it('sends strings for single-select and arrays for multi-select, omitting empty cards', () => {
    expect(picksToSelections(cards, { protein: ['shrimp'], carb: ['tortillas'], free: [] })).toEqual({
      protein: 'shrimp',
      carb: 'tortillas'
    });
    expect(picksToSelections(cards, { protein: ['beef'], carb: ['tortillas'], free: ['salsa', 'pico'] }).free).toEqual([
      'salsa',
      'pico'
    ]);
  });
});

describe('foodsLabel', () => {
  it('labels scaled, rounded, and free lines', () => {
    const opt = option('beef', {
      foods: [
        { foodId: 'f1', name: 'Beef', servings: 2.18, quantity: 4.36, unit: 'oz', calories: 229, protein: 24, carbs: 0, fat: 13, free: false, rounded: false },
        { foodId: 'f2', name: 'Tortillas', servings: 2, quantity: 2, unit: 'tortilla', calories: 140, protein: 4, carbs: 24, fat: 4, free: false, rounded: true },
        { foodId: 'f3', name: 'Salsa', servings: 1, quantity: 2, unit: 'tbsp', calories: 10, protein: 0, carbs: 2, fat: 0, free: true, rounded: false }
      ]
    });
    expect(foodsLabel(opt)).toBe('4.36 oz + 2 tortilla (rounded) + 2 tbsp · free');
  });

  it('falls back to the description for style options', () => {
    expect(foodsLabel(option('style', { description: 'Build-your-own tacos' }))).toBe('Build-your-own tacos');
  });
});
