import { describe, expect, it } from 'vitest';
import {
  buildPublishPlanPayload,
  expandWeekdayPattern,
  finalizePublishPlanPayload,
  weekdayIndex
} from './weekdayPattern';

describe('weekdayIndex', () => {
  it('uses Monday as 0', () => {
    expect(weekdayIndex('2026-06-22')).toBe(0);
    expect(weekdayIndex('2026-06-27')).toBe(5);
    expect(weekdayIndex('2026-06-28')).toBe(6);
    expect(weekdayIndex('2026-06-29')).toBe(0);
  });
});

describe('expandWeekdayPattern', () => {
  it('fills Mon Wed Fri for four weeks starting next week', () => {
    const { targetDates } = expandWeekdayPattern({
      anchorDate: '2026-06-28',
      weekdays: [0, 2, 4],
      weeks: 4,
      startFrom: 'next_week'
    });

    expect(targetDates).toEqual([
      '2026-06-29',
      '2026-07-01',
      '2026-07-03',
      '2026-07-06',
      '2026-07-08',
      '2026-07-10',
      '2026-07-13',
      '2026-07-15',
      '2026-07-17',
      '2026-07-20',
      '2026-07-22',
      '2026-07-24'
    ]);
  });

  it('skips past days in the current week', () => {
    const { targetDates } = expandWeekdayPattern({
      anchorDate: '2026-06-28',
      weekdays: [0, 2, 4],
      weeks: 2,
      startFrom: 'this_week'
    });

    expect(targetDates).not.toContain('2026-06-23');
    expect(targetDates).not.toContain('2026-06-25');
    expect(targetDates).not.toContain('2026-06-27');
    expect(targetDates).toContain('2026-06-29');
  });
});

describe('buildPublishPlanPayload', () => {
  it('returns passive rest dates inside the span', () => {
    const payload = buildPublishPlanPayload({
      anchorDate: '2026-06-28',
      weekdays: [0, 2, 4],
      weeks: 1,
      startFrom: 'next_week',
      clearPassiveRest: true
    });

    expect(payload.targetDates).toEqual(['2026-06-29', '2026-07-01', '2026-07-03']);
    expect(payload.clearDates).toContain('2026-06-30');
    expect(payload.clearDates).not.toContain('2026-06-29');
  });
});

describe('finalizePublishPlanPayload', () => {
  it('drops copy targets when the source day has no plan', () => {
    const payload = buildPublishPlanPayload({
      anchorDate: '2026-06-27',
      weekdays: [0, 1, 2, 3, 4],
      weeks: 1,
      startFrom: 'next_week',
      clearPassiveRest: true
    });

    const finalized = finalizePublishPlanPayload(false, payload);
    expect(finalized.targetDates).toEqual([]);
    expect(finalized.clearDates.length).toBeGreaterThan(0);
  });

  it('keeps copy targets when the source day has a plan', () => {
    const payload = buildPublishPlanPayload({
      anchorDate: '2026-06-27',
      weekdays: [0, 1, 2, 3, 4],
      weeks: 1,
      startFrom: 'next_week',
      clearPassiveRest: true
    });

    const finalized = finalizePublishPlanPayload(true, payload);
    expect(finalized.targetDates).toEqual(payload.targetDates);
    expect(finalized.clearDates).toEqual(payload.clearDates);
  });

  it('clears the full block when no workout weekdays are selected', () => {
    const payload = buildPublishPlanPayload({
      anchorDate: '2026-06-27',
      weekdays: [],
      weeks: 1,
      startFrom: 'next_week',
      clearPassiveRest: true
    });

    expect(payload.targetDates).toEqual([]);
    expect(payload.clearDates).toEqual([
      '2026-06-29',
      '2026-06-30',
      '2026-07-01',
      '2026-07-02',
      '2026-07-03',
      '2026-07-04',
      '2026-07-05'
    ]);
  });
});
