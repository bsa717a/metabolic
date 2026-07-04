export function startOfUtcDay(input = new Date()) {
  return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
}

export function parseDateParam(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) throw new Error("Date must be YYYY-MM-DD");
  return new Date(Date.UTC(year, month - 1, day));
}

export function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function localDateKey(date = new Date(), timeZone = "America/Los_Angeles") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

/** Wall-clock parts (local date key + minutes since midnight) for a timezone. */
export function localTimeParts(timeZone: string, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const hour = Number(value("hour")) % 24;
  const minute = Number(value("minute"));
  return {
    dateKey: `${value("year")}-${value("month")}-${value("day")}`,
    hour,
    minute,
    minutesOfDay: hour * 60 + minute
  };
}

/**
 * Calendar day key (YYYY-MM-DD) to use for a user's "today". Uses the user's
 * timezone when known so meal logs, dashboards, and reminders all agree on the
 * same day; falls back to the UTC day (the app-wide default) when unset.
 */
export function userDayKey(timeZone: string | null | undefined, date = new Date()) {
  if (timeZone) return localDateKey(date, timeZone);
  return toDateKey(startOfUtcDay(date));
}

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseDateKeyParam(dateKey?: string | null) {
  return dateKey && DATE_KEY_RE.test(dateKey) ? dateKey : undefined;
}

export function parseClientTimeZone(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: trimmed });
    return trimmed;
  } catch {
    return undefined;
  }
}

/** `date` and `timeZone` query params sent by the web client for local-day scoping. */
export function parseClientDayQuery(query: unknown) {
  const params = (query ?? {}) as { date?: string; timeZone?: string };
  return {
    dateKey: parseDateKeyParam(params.date),
    timeZone: parseClientTimeZone(params.timeZone)
  };
}

export function resolveRequestTimeZone(
  clientTimeZone: string | undefined,
  profileTimeZone: string | null | undefined
) {
  return clientTimeZone ?? profileTimeZone ?? null;
}

export function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/** Monday = 0 … Sunday = 6 (matches client weekdayIndex). */
export function weekdayIndexFromDate(date: Date) {
  return (date.getUTCDay() + 6) % 7;
}

/** Start of the ISO week (Monday) in UTC. */
export function startOfUtcWeek(date: Date) {
  const day = startOfUtcDay(date);
  return addUtcDays(day, -weekdayIndexFromDate(day));
}
