import { describe, expect, it } from 'vitest';
import { checkInDateError } from './checkInDate';

describe('checkInDateError', () => {
  const today = '2026-10-14';

  it('allows today and earlier dates', () => {
    expect(checkInDateError(today, today)).toBeNull();
    expect(checkInDateError('2026-01-02', today)).toBeNull();
  });

  it('rejects future dates and malformed days', () => {
    expect(checkInDateError('2026-10-15', today)).toBe('Choose today or an earlier date.');
    expect(checkInDateError('2026-10-14T00:00:00', today)).toBe('Choose today or an earlier date.');
  });
});
