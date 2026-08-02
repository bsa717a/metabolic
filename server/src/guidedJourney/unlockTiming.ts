import type { DiscoveryTimingConfig } from './types.js';
import { localTimeParts } from '../utils/dates.js';

/** Content-agnostic reflection unlock interpreter. */
export function isReflectionUnlocked(input: {
  experienceStartedAt: Date | null | undefined;
  timing: DiscoveryTimingConfig;
  timeZone: string | null | undefined;
  now?: Date;
}): boolean {
  const { experienceStartedAt, timing, timeZone } = input;
  if (!experienceStartedAt) return false;

  const now = input.now ?? new Date();
  const elapsedMs = now.getTime() - experienceStartedAt.getTime();
  const elapsedHours = elapsedMs / (1000 * 60 * 60);

  if (elapsedHours >= timing.minExperienceHoursAbsolute) return true;

  if (elapsedHours < timing.minExperienceHoursBeforeEveningUnlock) return false;

  const tz = timeZone?.trim() || 'UTC';
  const { hour } = localTimeParts(tz, now);
  return hour >= timing.reflectionUnlockLocalHour;
}

export function isReminderWindowOpen(input: {
  timing: DiscoveryTimingConfig;
  timeZone: string | null | undefined;
  now?: Date;
}): boolean {
  const tz = input.timeZone?.trim() || 'UTC';
  const { hour } = localTimeParts(tz, input.now ?? new Date());
  return hour >= input.timing.reminderLocalHourStart && hour < input.timing.reminderLocalHourEnd;
}
