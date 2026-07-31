import { describe, expect, it } from 'vitest';
import {
  activeCards,
  defaultPicks,
  foodsLabel,
  missingCoverageRole,
  picksToSelections,
  pruneAndRefillPicks,
  restorePicks,
  selectionTotals,
  togglePick,
  visibleOptions,
  type BuilderCard,
  type CardOption
} from './mealCards';

function option(id: string, overrides: Partial<CardOption> = {}): CardOption {
  return {
    id,
    name: id,
    description: null,
    icon: null,
    isDefault: false,
    sortOrder: 0,
    visibleWhenOptionId: null,
    foods: [],
    totals: { calories: 0, protein: 0, carbs: 0, fat: 0 },
    ...overrides
  };
}

function card(id: string, overrides: Partial<BuilderCard> = {}): BuilderCard {
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

  it('drops saved option ids that no longer exist and refills required cards', () => {
    const picks = restorePicks(cards, { protein: 'retired-option' });
    expect(picks.protein).toEqual(['beef']);
    expect(picks.carb).toEqual(['tortillas']);
  });
});

describe('path visibility', () => {
  const style = card('style', {
    role: 'STYLE',
    sortOrder: 0,
    options: [option('hot', { isDefault: true }), option('cold')]
  });
  const proteinPath = card('protein', {
    role: 'PROTEIN',
    sortOrder: 1,
    options: [
      option('eggs', { isDefault: true, visibleWhenOptionId: 'hot' }),
      option('yogurt', { isDefault: true, visibleWhenOptionId: 'cold' }),
      option('shared', { visibleWhenOptionId: null })
    ]
  });
  const pathCards = [style, proteinPath];

  it('filters options by upstream pick', () => {
    expect(visibleOptions(proteinPath, { style: ['hot'] }).map((o) => o.id)).toEqual(['eggs', 'shared']);
    expect(visibleOptions(proteinPath, { style: ['cold'] }).map((o) => o.id)).toEqual(['yogurt', 'shared']);
  });

  it('defaults cascade through the selected path', () => {
    expect(defaultPicks(pathCards)).toEqual({ style: ['hot'], protein: ['eggs'] });
  });

  it('prunes off-path picks when the style changes', () => {
    const next = pruneAndRefillPicks(pathCards, { style: ['cold'], protein: ['eggs'] });
    expect(next).toEqual({ style: ['cold'], protein: ['yogurt'] });
  });

  it('skips cards with no visible options', () => {
    const hotOnly = card('hot-only', {
      role: 'FAT',
      sortOrder: 2,
      options: [option('butter', { visibleWhenOptionId: 'hot' })]
    });
    expect(activeCards([style, hotOnly], { style: ['cold'], 'hot-only': [] }).map((c) => c.id)).toEqual(['style']);
  });

  it('still flags blood-sugar roles when the path hides every option', () => {
    const hotProteinOnly = card('protein', {
      role: 'PROTEIN',
      sortOrder: 1,
      options: [option('eggs', { visibleWhenOptionId: 'hot' })]
    });
    expect(missingCoverageRole([style, hotProteinOnly], { style: ['cold'], protein: [] })).toBe('PROTEIN');
  });
});

describe('togglePick', () => {
  it('replaces the pick on single-select cards', () => {
    const picks = togglePick(protein, { protein: ['beef'] }, 'shrimp');
    expect(picks.protein).toEqual(['shrimp']);
  });

  it('toggles on/off for multi-select and enforces maxSelect', () => {
    let picks: import('./mealCards').BuilderPicks = { free: ['salsa'] };
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
    expect(totals.protein).toBe(24 + 2 + 0 + 0);
    expect(totals.carbs).toBe(0 + 12 + 2 + 2);
    expect(totals.fat).toBe(13 + 2 + 0 + 0);
  });

  it('scales totals when quantities are overridden', () => {
    const card = cards[0];
    const beef = card.options[0];
    beef.foods = [
      {
        foodId: 'beef-id',
        name: 'Beef',
        imageUrl: null,
        servings: 2,
        quantity: 4,
        unit: 'oz',
        calories: 229,
        protein: 24,
        carbs: 0,
        fat: 13,
        free: false,
        rounded: false
      }
    ];
    const totals = selectionTotals([card], { protein: ['beef'] }, { 'beef:beef-id': 8 });
    expect(totals.calories).toBe(458);
    expect(totals.protein).toBe(48);
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
        { foodId: 'f1', name: 'Beef', imageUrl: null, servings: 2.18, quantity: 4.36, unit: 'oz', calories: 229, protein: 24, carbs: 0, fat: 13, free: false, rounded: false },
        { foodId: 'f2', name: 'Tortillas', imageUrl: null, servings: 2, quantity: 2, unit: 'tortilla', calories: 140, protein: 4, carbs: 24, fat: 4, free: false, rounded: true },
        { foodId: 'f3', name: 'Salsa', imageUrl: null, servings: 1, quantity: 2, unit: 'tbsp', calories: 10, protein: 0, carbs: 2, fat: 0, free: true, rounded: false }
      ]
    });
    expect(foodsLabel(opt)).toBe('4.36 oz + 2 tortilla (rounded) + 2 tbsp · free');
  });

  it('falls back to the description for style options', () => {
    expect(foodsLabel(option('style', { description: 'Build-your-own tacos' }))).toBe('Build-your-own tacos');
  });
});
