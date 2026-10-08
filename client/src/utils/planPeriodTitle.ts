import type { PlanPeriodInfo } from '../types';
import { formatWeekRange, parseDateKey, startOfWeek } from '../services/api';

const DAY_MS = 86_400_000;

export type PlanWeekTitle = {
  /** Bold label. A stale week number is replaced by the calendar week ("Oct 5 – 11"). */
  title: string;
  /** Muted date span in the week-strip style, or null when `title` already is that span. */
  range: string | null;
  /** No plan week yet — keep the first check-in hint. */
  awaitingCheckIn: boolean;
};

type PlanWeekInput = Pick<PlanPeriodInfo, 'weekNumber' | 'effectiveDate' | 'endDate'>;

function daysBetween(start: string, end: string) {
  return Math.round((parseDateKey(end).getTime() - parseDateKey(start).getTime()) / DAY_MS);
}

/** Same month/day style as the client week strip ("Oct 5 – 11", "Sep 28 – Oct 4"). */
export function formatPlanSpan(startDate: string, endDate: string) {
  const start = parseDateKey(startDate);
  const end = parseDateKey(endDate);
  const monthDay: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', timeZone: 'UTC' };
  if (start.getUTCFullYear() === end.getUTCFullYear() && start.getUTCMonth() === end.getUTCMonth()) {
    return `${start.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })} ${start.getUTCDate()} – ${end.getUTCDate()}`;
  }
  return `${start.toLocaleDateString('en-US', monthDay)} – ${end.toLocaleDateString('en-US', monthDay)}`;
}

function periodContains(plan: PlanWeekInput, viewedDate: string) {
  if (!plan.effectiveDate || viewedDate < plan.effectiveDate) return false;
  if (plan.endDate && viewedDate > plan.endDate) return false;
  return true;
}

/**
 * The stored week number names the week on screen when this period contains the
 * viewed day and has not been open for more than six weeks.
 * "Week 1" on a period that started years ago (or back in February) does not.
 */
export function planWeekNumberIsCurrent(plan: PlanWeekInput, viewedDate: string) {
  if (plan.weekNumber == null || !plan.effectiveDate) return false;
  if (!periodContains(plan, viewedDate)) return false;
  if (plan.endDate) {
    const span = daysBetween(plan.effectiveDate, plan.endDate);
    if (span >= 0 && span <= 6) return true;
  }
  return daysBetween(plan.effectiveDate, viewedDate) < 42;
}

function openWeekRange(plan: PlanWeekInput, viewedDate: string) {
  if (plan.endDate && plan.effectiveDate && periodContains(plan, viewedDate)) {
    const span = daysBetween(plan.effectiveDate, plan.endDate);
    if (span >= 0 && span <= 6) return formatPlanSpan(plan.effectiveDate, plan.endDate);
  }
  return formatWeekRange(startOfWeek(viewedDate));
}

export function planWeekTitle(plan: PlanWeekInput, viewedDate: string): PlanWeekTitle {
  if (plan.weekNumber == null) {
    return { title: 'Your plan', range: null, awaitingCheckIn: true };
  }
  if (!plan.effectiveDate) {
    return { title: `Week ${plan.weekNumber} plan`, range: null, awaitingCheckIn: true };
  }
  if (!planWeekNumberIsCurrent(plan, viewedDate)) {
    return {
      title: formatWeekRange(startOfWeek(viewedDate)),
      range: null,
      awaitingCheckIn: false
    };
  }
  return {
    title: `Week ${plan.weekNumber} plan`,
    range: openWeekRange(plan, viewedDate),
    awaitingCheckIn: false
  };
}
