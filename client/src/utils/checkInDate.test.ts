import { describe, expect, it } from 'vitest';
import { checkInDateError, snapshotForOwnerToday } from './checkInDate';

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

describe('snapshotForOwnerToday', () => {
  const instant = new Date('2026-10-09T04:00:00.000Z');
  const snapshots = [
    { id: 'denver-day', date: '2026-10-08' },
    { id: 'utc-day', date: '2026-10-09' }
  ];

  it('uses the owner timezone day, not the UTC day', () => {
    expect(snapshotForOwnerToday(snapshots, 'America/Denver', instant)?.id).toBe('denver-day');
    expect(snapshotForOwnerToday(snapshots, 'UTC', instant)?.id).toBe('utc-day');
  });

  it('falls back to the UTC day when the timezone is missing or invalid', () => {
    expect(snapshotForOwnerToday(snapshots, null, instant)?.id).toBe('utc-day');
    expect(snapshotForOwnerToday(snapshots, 'Not/AZone', instant)?.id).toBe('utc-day');
  });
});
