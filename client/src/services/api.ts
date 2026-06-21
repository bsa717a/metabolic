import { getIdToken } from './auth';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getIdToken();
  const method = (options.method ?? 'GET').toUpperCase();
  const body = options.body ?? (['POST', 'PUT', 'PATCH'].includes(method) ? '{}' : undefined);
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      method,
      body,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Network request failed';
    if (message === 'Load failed' || message === 'Failed to fetch') {
      throw new Error('Could not reach the server. Make sure the API is running.');
    }
    throw new Error(message);
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error ?? payload?.message ?? response.statusText);
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export function todayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Query params for endpoints that scope data to the user's local calendar day. */
export function clientTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return '';
  }
}

export function todayDateParam() {
  const params = new URLSearchParams({ date: todayKey() });
  const timeZone = clientTimeZone();
  if (timeZone) params.set('timeZone', timeZone);
  return params.toString();
}

export function parseDateKey(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number) {
  const d = parseDateKey(date);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateKey(d);
}

export function startOfWeek(date: string) {
  const d = parseDateKey(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return toDateKey(d);
}

export function getWeekDates(weekStart: string) {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function isToday(date: string) {
  return date === todayKey();
}

export function isFuture(date: string) {
  return date > todayKey();
}

export function formatWeekRange(weekStart: string) {
  const end = addDays(weekStart, 6);
  const start = parseDateKey(weekStart);
  const endDate = parseDateKey(end);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', timeZone: 'UTC' };
  const startStr = start.toLocaleDateString('en-US', opts);
  const endStr = endDate.toLocaleDateString('en-US', opts);
  if (start.getUTCMonth() === endDate.getUTCMonth()) {
    return `${start.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })} ${start.getUTCDate()} – ${endDate.getUTCDate()}`;
  }
  return `${startStr} – ${endStr}`;
}

export function formatDayAbbrev(date: string) {
  return parseDateKey(date).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
}

export function formatDayNumber(date: string) {
  return parseDateKey(date).getUTCDate();
}

export function startOfMonth(date: string) {
  const d = parseDateKey(date);
  return toDateKey(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
}

export function endOfMonth(date: string) {
  const d = parseDateKey(date);
  return toDateKey(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}

export function addMonths(date: string, months: number) {
  const d = parseDateKey(date);
  return toDateKey(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate())));
}

export function formatMonthLabel(date: string) {
  return parseDateKey(date).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function getMonthGridDates(monthStart: string) {
  const firstDay = parseDateKey(monthStart);
  const gridStart = parseDateKey(startOfWeek(monthStart));
  const month = firstDay.getUTCMonth();
  const dates: string[] = [];
  for (let i = 0; i < 42; i += 1) {
    dates.push(addDays(toDateKey(gridStart), i));
  }
  return { dates, month };
}
