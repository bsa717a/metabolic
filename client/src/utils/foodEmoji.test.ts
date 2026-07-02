import { describe, expect, it } from 'vitest';
import { foodEmoji } from './foodEmoji';

describe('foodEmoji', () => {
  it('matches real catalog names sensibly', () => {
    expect(foodEmoji('Grilled chicken breast')).toBe('🍗');
    expect(foodEmoji('Salmon, grilled')).toBe('🐟');
    expect(foodEmoji('Shrimp, sautéed')).toBe('🍤');
    expect(foodEmoji('Corn tortillas')).toBe('🌯');
    expect(foodEmoji('Brown rice, cooked')).toBe('🍚');
    expect(foodEmoji('Sweet potato, roasted')).toBe('🍠');
    expect(foodEmoji('Peppers & onions, sautéed')).toBe('🫑');
    expect(foodEmoji('Mixed berries')).toBe('🫐');
    expect(foodEmoji('Greek yogurt, plain')).toBe('🥛');
  });

  it('prefers specific rules over generic keywords', () => {
    expect(foodEmoji('Nut Butter - PB2 Dry Peanut Butter')).toBe('🥜');
    expect(foodEmoji('Kodiak Cakes (Buttermilk)')).toBe('🥞');
    expect(foodEmoji('String cheese')).toBe('🧀');
    expect(foodEmoji('Cottage cheese')).toBe('🥣');
    expect(foodEmoji('Rice cakes')).toBe('🍘');
  });

  it('does not match short keywords inside unrelated words', () => {
    expect(foodEmoji('Eggplant, roasted')).toBe('🍽️');
    expect(foodEmoji('Glazed donut')).toBe('🍽️');
  });

  it('falls back to the role, then the plate', () => {
    expect(foodEmoji('Mystery entrée', 'PROTEIN')).toBe('🥩');
    expect(foodEmoji('Mystery side', 'VEGETABLE')).toBe('🥦');
    expect(foodEmoji('Mystery thing')).toBe('🍽️');
    expect(foodEmoji(null, null)).toBe('🍽️');
    expect(foodEmoji('', 'FRUIT')).toBe('🍎');
  });
});
