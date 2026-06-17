import type { CoachCalendarEventType } from '../types';

const STORAGE_PREFIX = 'metabolic-coach-calendar-activity-filter';

const VALID_ACTIVITY_TYPES = new Set<CoachCalendarEventType>([
  'check_in',
  'daily_log',
  'exercise_plan',
  'metric_snapshot',
  'progress_snapshot',
  'program_start',
  'program_end'
]);

function storageKey(coachUserId: string) {
  return `${STORAGE_PREFIX}:${coachUserId}`;
}

export function readCoachCalendarActivityFilter(coachUserId: string): CoachCalendarEventType[] {
  if (!coachUserId) return [];
  try {
    const raw = localStorage.getItem(storageKey(coachUserId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (value): value is CoachCalendarEventType =>
        typeof value === 'string' && VALID_ACTIVITY_TYPES.has(value as CoachCalendarEventType)
    );
  } catch {
    return [];
  }
}

export function saveCoachCalendarActivityFilter(coachUserId: string, types: CoachCalendarEventType[]) {
  if (!coachUserId) return;
  try {
    localStorage.setItem(storageKey(coachUserId), JSON.stringify(types));
  } catch {
    // Ignore storage failures in private browsing or restricted contexts.
  }
}
