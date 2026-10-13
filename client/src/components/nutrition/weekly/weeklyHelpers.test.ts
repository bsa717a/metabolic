import { describe, expect, it } from 'vitest';
import { dayKcalTargetStatus, isPastDate } from './weeklyHelpers';

describe('nutrition day chips', () => {
  const today = '2026-10-08';

  it('marks missed past days red and leaves the client today untinted', () => {
    expect(isPastDate('2026-10-07', today)).toBe(true);
    expect(isPastDate(today, today)).toBe(false);
    expect(isPastDate('2026-10-09', today)).toBe(false);
    expect(dayKcalTargetStatus(0, 400, '2026-10-07', today)).toBe('over');
    expect(dayKcalTargetStatus(0, 400, today, today)).toBe('none');
    expect(dayKcalTargetStatus(300, 400, '2026-10-06', today)).toBe('at_or_under');
  });
});
