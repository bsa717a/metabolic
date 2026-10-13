import { describe, expect, it } from 'vitest';
import { displayPortionMacros, formatPortion, portionStep, roundPortion } from './portionDisplay';

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

  it('rounds tablespoons and teaspoons to the nearest half', () => {
    expect(roundPortion(1.48, 'tbsp', 'Peanut butter')).toBe(1.5);
    expect(formatPortion(1.48, 'tbsp', 'Peanut butter')).toBe('1.5 tbsp');
    expect(roundPortion(1.2, 'tsp', 'Hot sauce')).toBe(1);
    expect(roundPortion(1.3, 'teaspoons', 'Flax seeds')).toBe(1.5);
  });

  it('does not treat eggplant as eggs', () => {
    expect(roundPortion(1.2, 'cup', 'Eggplant, roasted')).toBe(1.25);
    expect(portionStep('cup', 'Eggplant, roasted')).toBe(0.25);
  });

  it('gives every library unit a step', () => {
    expect(portionStep('cup', 'Rice')).toBe(0.25);
    expect(portionStep('pint', 'Milk')).toBe(0.25);
    expect(portionStep('quart', 'Broth')).toBe(0.25);
    expect(portionStep('gallon', 'Water')).toBe(0.25);
    expect(portionStep('lb', 'Chicken')).toBe(0.25);
    expect(portionStep('tbsp', 'Peanut butter')).toBe(0.5);
    expect(portionStep('tsp', 'Chia seeds')).toBe(0.5);
    expect(portionStep('oz', 'Salmon')).toBe(0.5);
    expect(portionStep('fl oz', 'Olive oil')).toBe(0.5);
    expect(portionStep('slice', 'Bacon')).toBe(0.5);
    expect(portionStep('wrap', 'Whole wheat wrap')).toBe(0.5);
    expect(portionStep('tortilla', 'Corn tortillas')).toBe(0.5);
    expect(portionStep('egg', 'Egg')).toBe(0.5);
    expect(portionStep('each', 'Avocado')).toBe(0.5);
    expect(portionStep('medium', 'Banana')).toBe(0.5);
    expect(portionStep('large', 'Eggs')).toBe(0.5);
    expect(portionStep('stick', 'String cheese')).toBe(0.5);
    expect(portionStep('bar', 'Protein bar')).toBe(0.5);
    expect(portionStep('cake', 'Rice cakes')).toBe(0.5);
    expect(portionStep('wedge', 'Lime')).toBe(0.5);
    expect(portionStep('scoop', 'Whey protein')).toBe(0.5);
    expect(portionStep('avocado', 'Avocado')).toBe(0.5);
    expect(portionStep('serving', 'Orange chicken')).toBe(0.5);
    expect(portionStep('dozen', 'Eggs')).toBe(0.5);
    expect(portionStep('g', 'Almonds')).toBe(1);
    expect(portionStep('ml', 'Milk')).toBe(1);
    expect(portionStep('olives', 'Olives')).toBe(1);
    expect(portionStep('crackers', 'Whole grain crackers')).toBe(1);
    expect(portionStep('clove', 'Garlic')).toBe(1);
    expect(portionStep('leaves', 'Lettuce cups')).toBe(1);
    expect(portionStep('meal', 'Combo')).toBe(1);
  });

  it('rounds unknown units to one decimal and drops a trailing .0', () => {
    expect(portionStep('pinch', 'Salt')).toBe(0.1);
    expect(roundPortion(1.48, 'pinch', 'Salt')).toBe(1.5);
    expect(formatPortion(2.04, 'dash', 'Cinnamon')).toBe('2 dash');
    expect(formatPortion(1, '', 'Eggs')).toBe('1');
  });
});

describe('displayPortionMacros', () => {
  it('scales kcal with the rounded portion', () => {
    const bacon = displayPortionMacros({
      quantity: 1.48,
      unit: 'slices',
      name: 'Bacon',
      calories: 66.6,
      protein: 4.44,
      carbs: 0,
      fat: 5
    });
    expect(bacon.quantity).toBe(1.5);
    expect(Math.round(bacon.calories)).toBe(Math.round(66.6 * (1.5 / 1.48)));

    const peanutButter = displayPortionMacros({
      quantity: 1.48,
      unit: 'tbsp',
      name: 'Peanut butter',
      calories: 139,
      protein: 5,
      carbs: 4.5,
      fat: 12
    });
    expect(peanutButter.quantity).toBe(1.5);
    expect(peanutButter.calories).toBeCloseTo(139 * (1.5 / 1.48));
  });
});
