const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Empty when the day is today or earlier. Otherwise a message safe to show in the check-in form. */
export function checkInDateError(date: string, today: string): string | null {
  if (!DATE_KEY_RE.test(date) || !DATE_KEY_RE.test(today) || date > today) {
    return 'Choose today or an earlier date.';
  }
  return null;
}
