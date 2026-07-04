import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseDateParam, weekdayIndexFromDate } from '../utils/dates.js';
import { resolveTemplateIdForDate, routineApplyForwardDates } from './exerciseRoutineService.js';

describe('weekdayIndexFromDate', () => {
  it('treats Monday as 0', () => {
    assert.equal(weekdayIndexFromDate(parseDateParam('2026-07-06')), 0);
  });

  it('treats Sunday as 6', () => {
    assert.equal(weekdayIndexFromDate(parseDateParam('2026-07-05')), 6);
  });
});

describe('resolveTemplateIdForDate', () => {
  const days = [
    { weekday: 0, templateId: 'upper' },
    { weekday: 1, templateId: null },
    { weekday: 2, templateId: 'upper' }
  ];

  it('returns template for matching weekday', () => {
    assert.equal(resolveTemplateIdForDate(days, parseDateParam('2026-07-06')), 'upper');
  });

  it('returns null for rest weekday', () => {
    assert.equal(resolveTemplateIdForDate(days, parseDateParam('2026-07-07')), null);
  });

  it('returns undefined when weekday is missing', () => {
    assert.equal(resolveTemplateIdForDate(days, parseDateParam('2026-07-09')), undefined);
  });
});

describe('routineApplyForwardDates', () => {
  it('includes today through Sunday of next week', () => {
    const dates = routineApplyForwardDates(parseDateParam('2026-07-08'));
    assert.equal(dates[0], '2026-07-08');
    assert.equal(dates[dates.length - 1], '2026-07-19');
    assert.equal(dates.length, 12);
  });
});
