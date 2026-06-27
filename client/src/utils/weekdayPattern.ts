import { addDays, parseDateKey, startOfWeek } from '../services/api';

export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type PatternStart = 'this_week' | 'next_week';

export const DEFAULT_PATTERN_WEEKS = 4;
export const MAX_PATTERN_WEEKS = 12;

export type PublishPlanPayload = {
  targetDates: string[];
  clearDates: string[];
};

/** Monday = 0 … Sunday = 6 (matches getWeekDates order). */
export function weekdayIndex(date: string): WeekdayIndex {
  const day = parseDateKey(date).getUTCDay();
  return ((day + 6) % 7) as WeekdayIndex;
}

export function expandWeekdayPattern({
  anchorDate,
  weekdays,
  weeks,
  startFrom
}: {
  anchorDate: string;
  weekdays: WeekdayIndex[];
  weeks: number;
  startFrom: PatternStart;
}): { targetDates: string[]; spanDates: string[] } {
  const blockStart = startFrom === 'next_week' ? addDays(startOfWeek(anchorDate), 7) : startOfWeek(anchorDate);
  const spanDates = Array.from({ length: weeks * 7 }, (_, index) => addDays(blockStart, index));

  const targetDates: string[] = [];
  for (let week = 0; week < weeks; week++) {
    for (const weekday of weekdays) {
      const date = addDays(blockStart, week * 7 + weekday);
      if (startFrom === 'this_week' && date < anchorDate) continue;
      targetDates.push(date);
    }
  }

  return {
    targetDates: [...new Set(targetDates)].sort(),
    spanDates
  };
}

export function passiveRestDates(spanDates: string[], targetDates: string[]): string[] {
  const targets = new Set(targetDates);
  return spanDates.filter((date) => !targets.has(date));
}

export function buildPublishPlanPayload({
  anchorDate,
  weekdays,
  weeks,
  startFrom,
  clearPassiveRest
}: {
  anchorDate: string;
  weekdays: WeekdayIndex[];
  weeks: number;
  startFrom: PatternStart;
  clearPassiveRest: boolean;
}): PublishPlanPayload {
  const { targetDates, spanDates } = expandWeekdayPattern({ anchorDate, weekdays, weeks, startFrom });
  const clearDates = clearPassiveRest ? passiveRestDates(spanDates, targetDates) : [];
  return { targetDates, clearDates };
}

/** When the source day has no plan, only rest-day clearing is allowed — drop copy targets. */
export function finalizePublishPlanPayload(hasSourcePlan: boolean, payload: PublishPlanPayload): PublishPlanPayload {
  if (hasSourcePlan) return payload;
  return { targetDates: [], clearDates: payload.clearDates };
}
