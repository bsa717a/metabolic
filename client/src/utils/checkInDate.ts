import { dateKeyInTimeZone } from '../services/api';

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Snapshot recorded on the owner's calendar today, matching the check-in modal. */
export function snapshotForOwnerToday<T extends { date: string }>(
  snapshots: readonly T[],
  timeZone: string | null | undefined,
  now = new Date()
) {
  const today = dateKeyInTimeZone(timeZone, now);
  return snapshots.find((snapshot) => snapshot.date === today);
}

/** Empty when the day is today or earlier. Otherwise a message safe to show in the check-in form. */
export function checkInDateError(date: string, today: string): string | null {
  if (!DATE_KEY_RE.test(date) || !DATE_KEY_RE.test(today) || date > today) {
    return 'Choose today or an earlier date.';
  }
  return null;
}
