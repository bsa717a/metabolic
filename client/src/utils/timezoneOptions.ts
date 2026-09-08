const COMMON_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu'
];

const DEFAULT_TIMEZONE = 'America/New_York';

/**
 * Detect the browser's timezone using the Intl API.
 * Returns a safe fallback if detection fails.
 */
export function detectedTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz?.trim() || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/**
 * Resolve timezone for form submission: prefer explicit value, then detect, then fallback.
 */
export function resolveTimezone(explicit?: string | null): string {
  const trimmed = explicit?.trim();
  if (trimmed) return trimmed;
  return detectedTimezone();
}

export function timezoneOptions(current = '') {
  const detected = detectedTimezone();
  return Array.from(new Set([current, detected, ...COMMON_TIMEZONES].filter(Boolean)));
}
