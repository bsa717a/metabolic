import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pastCheckInDates } from './checkInDates.js';

describe('pastCheckInDates', () => {
  it('keeps check-in dates through today, newest first, without copies or blanks', () => {
    assert.deepEqual(
      pastCheckInDates(
        ['2026-07-13', '2026-01-06', '2026-07-13', '2026-10-18', 'not-a-date', '2026-10-14'],
        '2026-10-15'
      ),
      ['2026-10-14', '2026-07-13', '2026-01-06']
    );
  });

  it('includes a check-in that falls on today', () => {
    assert.deepEqual(pastCheckInDates(['2026-10-15', '2026-10-16'], '2026-10-15'), ['2026-10-15']);
  });
});
