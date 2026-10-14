import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCheckInDate } from './checkInDate.js';

describe('resolveCheckInDate', () => {
  const today = '2026-10-14';

  it('defaults to today when no date is sent', () => {
    assert.equal(resolveCheckInDate(undefined, today), today);
    assert.equal(resolveCheckInDate('  ', today), today);
  });

  it('accepts today and earlier dates', () => {
    assert.equal(resolveCheckInDate(today, today), today);
    assert.equal(resolveCheckInDate('2026-09-01', today), '2026-09-01');
  });

  it('rejects future dates', () => {
    assert.throws(() => resolveCheckInDate('2026-10-15', today), /earlier date/);
  });

  it('rejects dates that are not calendar days', () => {
    assert.throws(() => resolveCheckInDate('10/01/2026', today), /earlier date/);
  });
});
