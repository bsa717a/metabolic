const COMMON_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu'
];

export function detectedTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function timezoneOptions(current = '') {
  const detected = detectedTimezone();
  return Array.from(new Set([current, detected, ...COMMON_TIMEZONES].filter(Boolean)));
}
