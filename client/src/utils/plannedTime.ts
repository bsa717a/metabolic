/** Converts stored planned times (24h or 12h) into `<input type="time">` values. */
export function plannedTimeToInputValue(plannedTime?: string | null): string {
  if (!plannedTime) return '';

  const h24 = plannedTime.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (h24) {
    const hour = Number(h24[1]);
    const minute = h24[2];
    if (hour > 23) return '';
    return `${String(hour).padStart(2, '0')}:${minute}`;
  }

  const h12 = plannedTime.trim().match(/^(\d{1,2}):(\d{2})\s*([ap]m)$/i);
  if (!h12) return '';

  let hour = Number(h12[1]);
  const minute = h12[2];
  const meridiem = h12[3].toLowerCase();
  if (hour < 1 || hour > 12) return '';
  if (meridiem === 'am') {
    if (hour === 12) hour = 0;
  } else if (hour !== 12) {
    hour += 12;
  }
  return `${String(hour).padStart(2, '0')}:${minute}`;
}
