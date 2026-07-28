import { describe, expect, it } from 'vitest';
import { formatNumberDisplay, parseNumberInput } from './NumberInput';

describe('parseNumberInput', () => {
  it('accepts decimals and zeros when min allows', () => {
    expect(parseNumberInput('0.5')).toBe(0.5);
    expect(parseNumberInput('.5')).toBe(0.5);
    expect(parseNumberInput('0', { min: 0 })).toBe(0);
    expect(parseNumberInput('0.25', { min: 0.25 })).toBe(0.25);
  });

  it('rejects empty and out-of-range values', () => {
    expect(parseNumberInput('')).toBeNull();
    expect(parseNumberInput('0', { min: 0.25 })).toBeNull();
    expect(parseNumberInput('101', { max: 100 })).toBeNull();
    expect(parseNumberInput('-1', { min: 0 })).toBeNull();
  });

  it('supports integers', () => {
    expect(parseNumberInput('12', { integer: true })).toBe(12);
    expect(parseNumberInput('12.9', { integer: true })).toBe(12);
  });
});

describe('formatNumberDisplay', () => {
  it('trims floating point noise', () => {
    expect(formatNumberDisplay(0.5)).toBe('0.5');
    expect(formatNumberDisplay(1.2500000002)).toBe('1.25');
  });
});
