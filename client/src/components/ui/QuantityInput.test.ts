import { describe, expect, it } from 'vitest';
import { formatQuantityDisplay, parseQuantityInput } from './QuantityInput';

describe('quantity helpers (NumberInput re-exports)', () => {
  it('accepts half servings', () => {
    expect(parseQuantityInput('0.5', { min: 0.25, max: 100 })).toBe(0.5);
    expect(formatQuantityDisplay(0.5)).toBe('0.5');
  });
});
