import { describe, expect, it } from 'vitest';
import { displayPortionMacros, formatPortion, roundPortion } from './portionDisplay';

describe('roundPortion', () => {
  it('rounds countable slices to the nearest half', () => {
    expect(roundPortion(1.48, 'slices', 'Bacon')).toBe(1.5);
    expect(formatPortion(1.48, 'slices', 'Bacon')).toBe('1.5 slices');
  });

  it('rounds eggs, wraps, tortillas, and medium fruit to whole or half units', () => {
    expect(roundPortion(2.2, 'egg', 'Egg - Whole with Yolk Cooked')).toBe(2);
    expect(roundPortion(1.3, 'each', 'Eggs')).toBe(1.5);
    expect(roundPortion(1.2, 'wrap', 'Turkey wrap')).toBe(1);
    expect(roundPortion(1.8, 'tortillas', 'Corn tortillas')).toBe(2);
    expect(roundPortion(1.2, 'medium', 'Banana')).toBe(1);
    expect(roundPortion(0.6, 'each', 'Apple')).toBe(0.5);
  });

  it('rounds cups to the nearest quarter and ounces to the nearest half', () => {
    expect(roundPortion(0.33, 'cup', 'White rice')).toBe(0.25);
    expect(formatPortion(1, 'cup', 'White rice')).toBe('1 cup');
    expect(formatPortion(0.4, 'cups', 'Greek yogurt')).toBe('0.5 cups');
    expect(roundPortion(6.2, 'oz', 'Chicken breast')).toBe(6);
    expect(roundPortion(6.3, 'oz', 'Salmon')).toBe(6.5);
  });

  it('does not treat eggplant as eggs or round tablespoons', () => {
    expect(roundPortion(1.2, 'cup', 'Eggplant, roasted')).toBe(1.25);
    expect(roundPortion(1.48, 'tbsp', 'Peanut butter')).toBe(1.48);
  });
});

describe('displayPortionMacros', () => {
  it('scales kcal with the rounded portion', () => {
    const shown = displayPortionMacros({
      quantity: 1.48,
      unit: 'slices',
      name: 'Bacon',
      calories: 66.6,
      protein: 4.44,
      carbs: 0,
      fat: 5
    });
    expect(shown.quantity).toBe(1.5);
    expect(Math.round(shown.calories)).toBe(Math.round(66.6 * (1.5 / 1.48)));
    expect(shown.calories).toBeCloseTo(66.6 * (1.5 / 1.48));
  });
});
