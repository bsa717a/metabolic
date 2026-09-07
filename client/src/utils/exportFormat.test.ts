import { describe, expect, it } from 'vitest';
import { formatItemQuantityLine } from './exportFormat';

describe('formatItemQuantityLine', () => {
  it('includes quantity and unit when quantity is 1', () => {
    expect(formatItemQuantityLine(1, 'cup', 'Almond Milk - Full Circle Market Vanilla (Unsweetened)')).toBe(
      '1 cup Almond Milk - Full Circle Market Vanilla (Unsweetened)'
    );
    expect(formatItemQuantityLine(1, 'tbsp', 'peanut butter')).toBe('1 tbsp peanut butter');
    expect(formatItemQuantityLine(1, 'tsp', 'Oil - Coconut')).toBe('1 tsp Oil - Coconut');
  });

  it('includes quantity and unit when quantity is not 1', () => {
    expect(formatItemQuantityLine(2, 'cups', 'raw spinach')).toBe('2 cups raw spinach');
    expect(formatItemQuantityLine(0.5, 'cup', 'Brown rice, cooked')).toBe('0.5 cup Brown rice, cooked');
    expect(formatItemQuantityLine(3.5, 'oz-wt', 'Chicken - Roasted Chicken Thigh w/o Skin')).toBe(
      '3.5 oz-wt Chicken - Roasted Chicken Thigh w/o Skin'
    );
  });

  it('still prints quantity when unit is missing', () => {
    expect(formatItemQuantityLine(1, '', 'Berries - Any')).toBe('1 Berries - Any');
    expect(formatItemQuantityLine(2, '  ', 'Eggs')).toBe('2 Eggs');
  });
});
