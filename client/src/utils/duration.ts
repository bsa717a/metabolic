/** Duration unit shown in exercise editors. Canonical storage is always seconds. */
export type DurationUnit = 'min' | 'sec';

export type DurationInput = {
  value: string;
  unit: DurationUnit;
};

/**
 * Pick an editor unit for a stored seconds value.
 * Whole-minute values show as minutes; otherwise seconds. Empty defaults to minutes.
 */
export function secondsToInput(seconds: number | null | undefined): DurationInput {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) {
    return { value: '', unit: 'min' };
  }
  const whole = Math.round(seconds);
  if (whole % 60 === 0) {
    return { value: String(whole / 60), unit: 'min' };
  }
  return { value: String(whole), unit: 'sec' };
}

/** Convert a typed value + unit into canonical seconds (null when empty/invalid). */
export function inputToSeconds(value: string, unit: DurationUnit): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  const whole = Math.round(n);
  if (whole === 0) return null;
  return unit === 'min' ? whole * 60 : whole;
}

/**
 * Retarget a draft display value when the unit toggle flips, preserving the
 * underlying duration in seconds (20 min → 1200 sec, not 20 sec).
 */
export function convertDurationInput(
  value: string,
  from: DurationUnit,
  to: DurationUnit
): string {
  if (from === to) return value;
  const seconds = inputToSeconds(value, from);
  if (seconds == null) return value;
  if (to === 'sec') return String(seconds);
  // Prefer whole minutes; otherwise round so the field stays integer-only.
  if (seconds % 60 === 0) return String(seconds / 60);
  return String(Math.max(1, Math.round(seconds / 60)));
}

/** Display label: "30s", "90s", "5 min", "120 min". */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return '';
  const whole = Math.round(seconds);
  if (whole % 60 === 0) return `${whole / 60} min`;
  return `${whole}s`;
}
