import { describe, expect, it } from 'vitest';
import { formatPlanSpan, planWeekNumberIsCurrent, planWeekTitle } from './planPeriodTitle';

const viewed = '2026-10-08';

describe('planWeekTitle', () => {
  it('drops a stale Week 1 and shows the calendar week instead of a years-old start', () => {
    const title = planWeekTitle(
      { weekNumber: 1, effectiveDate: '2020-02-05', endDate: null },
      viewed
    );
    expect(title.title).toBe('Oct 5 – 11');
    expect(title.range).toBeNull();
    expect(title.awaitingCheckIn).toBe(false);
    expect(title.title).not.toContain('Week 1');
    expect(`${title.title} ${title.range ?? ''}`).not.toMatch(/ongoing|Feb|2020-|2026-/);
  });

  it('drops a stale week number from earlier this year the same way', () => {
    const title = planWeekTitle(
      { weekNumber: 2, effectiveDate: '2026-02-05', endDate: null },
      viewed
    );
    expect(title.title).toBe('Oct 5 – 11');
    expect(title.range).toBeNull();
  });

  it('drops a stale Week 1 from earlier this year the same way', () => {
    const title = planWeekTitle(
      { weekNumber: 1, effectiveDate: '2026-02-05', endDate: null },
      viewed
    );
    expect(title.title).toBe('Oct 5 – 11');
    expect(title.range).toBeNull();
  });

  it('keeps the week number when that period started in the viewed week', () => {
    const title = planWeekTitle(
      { weekNumber: 4, effectiveDate: '2026-10-05', endDate: null },
      viewed
    );
    expect(title).toEqual({
      title: 'Week 4 plan',
      range: 'Oct 5 – 11',
      awaitingCheckIn: false
    });
  });

  it('keeps a later week number and still uses the calendar week on screen', () => {
    const title = planWeekTitle(
      { weekNumber: 8, effectiveDate: '2026-09-14', endDate: null },
      viewed
    );
    expect(title.title).toBe('Week 8 plan');
    expect(title.range).toBe('Oct 5 – 11');
    expect(`${title.title} ${title.range}`).not.toMatch(/ongoing|Sep 14/);
  });

  it('keeps Week 1 the same way when that period is still recent', () => {
    const title = planWeekTitle(
      { weekNumber: 1, effectiveDate: '2026-09-14', endDate: null },
      viewed
    );
    expect(title.title).toBe('Week 1 plan');
    expect(title.range).toBe('Oct 5 – 11');
  });

  it('keeps a week that started in December when viewed in January', () => {
    const title = planWeekTitle(
      { weekNumber: 6, effectiveDate: '2025-12-29', endDate: null },
      '2026-01-05'
    );
    expect(title.title).toBe('Week 6 plan');
    expect(title.range).toBe('Jan 5 – 11');
  });

  it('does not reuse a closed week after that week has ended', () => {
    const title = planWeekTitle(
      { weekNumber: 2, effectiveDate: '2026-09-28', endDate: '2026-10-04' },
      viewed
    );
    expect(title.title).toBe('Oct 5 – 11');
    expect(title.range).toBeNull();
    expect(
      planWeekNumberIsCurrent({ weekNumber: 2, effectiveDate: '2026-09-28', endDate: '2026-10-04' }, viewed)
    ).toBe(false);
  });

  it('keeps the week number for a check-in that landed the previous week', () => {
    const title = planWeekTitle(
      { weekNumber: 3, effectiveDate: '2026-09-28', endDate: null },
      viewed
    );
    expect(title.title).toBe('Week 3 plan');
    expect(title.range).toBe('Oct 5 – 11');
    expect(planWeekNumberIsCurrent({ weekNumber: 3, effectiveDate: '2026-09-28', endDate: null }, viewed)).toBe(
      true
    );
  });

  it('formats a closed plan week like the week strip, including a month change', () => {
    const title = planWeekTitle(
      { weekNumber: 2, effectiveDate: '2026-09-28', endDate: '2026-10-04' },
      '2026-10-01'
    );
    expect(title).toEqual({
      title: 'Week 2 plan',
      range: 'Sep 28 – Oct 4',
      awaitingCheckIn: false
    });
    expect(formatPlanSpan('2026-10-05', '2026-10-11')).toBe('Oct 5 – 11');
  });

  it('does not invent a week before the first check-in', () => {
    expect(planWeekTitle({ weekNumber: null, effectiveDate: null, endDate: null }, viewed)).toEqual({
      title: 'Your plan',
      range: null,
      awaitingCheckIn: true
    });
  });
});
