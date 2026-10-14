const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Calendar day for a check-in. Omitted means today. Future days are rejected. */
export function resolveCheckInDate(requested: string | undefined, todayKey: string): string {
  const dateKey = requested?.trim() || todayKey;
  if (!DATE_KEY_RE.test(dateKey) || !DATE_KEY_RE.test(todayKey)) {
    throw new Error('Choose today or an earlier date.');
  }
  if (dateKey > todayKey) {
    throw new Error('Choose today or an earlier date.');
  }
  return dateKey;
}
