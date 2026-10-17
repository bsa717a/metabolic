import type { ProgramMetricSnapshot } from '../types';
import { checkInDateError } from './checkInDate';

export const LBS_PER_KG = 2.2046226218;

export type WeightUnit = 'lbs' | 'kg';

export type WeightPoint = {
  date: string;
  /** Weight in the user's preferred unit. */
  weight: number;
};

export type WeightDraft = {
  weight: string;
  unit: WeightUnit;
  date: string;
};

export type WeightSaveRequest =
  | { ok: true; date: string; currentValue: number; unit: string; updatesExisting: boolean }
  | { ok: false; error: string };

export function normalizeWeightUnit(unit: string | null | undefined): WeightUnit {
  const value = (unit ?? '').trim().toLowerCase();
  if (value === 'kg' || value === 'kgs' || value === 'kilogram' || value === 'kilograms') return 'kg';
  return 'lbs';
}

export function weightUnitLabel(unit: string | null | undefined): string {
  return normalizeWeightUnit(unit) === 'kg' ? 'kg' : 'lb';
}

/** Unit string stored on the snapshot. Keeps the program metric's own label when it already matches. */
export function storedWeightUnit(metricUnit: string | null | undefined): string {
  const normalized = normalizeWeightUnit(metricUnit);
  const raw = metricUnit?.trim();
  if (raw && normalizeWeightUnit(raw) === normalized) return raw;
  return normalized;
}

export function convertWeight(value: number, from: WeightUnit, to: WeightUnit): number {
  if (from === to) return Math.round(value * 100) / 100;
  const pounds = from === 'lbs' ? value : value * LBS_PER_KG;
  const converted = to === 'lbs' ? pounds : pounds / LBS_PER_KG;
  return Math.round(converted * 100) / 100;
}

export function formatWeight(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return rounded.toLocaleString('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 0 });
}

export function formatWeightInput(value: number): string {
  if (!Number.isFinite(value)) return '';
  return String(Math.round(value * 100) / 100);
}

export function weightPointsFromSnapshots(
  snapshots: readonly ProgramMetricSnapshot[],
  preferredUnit: string | null | undefined
): WeightPoint[] {
  const preferred = normalizeWeightUnit(preferredUnit);
  const byDate = new Map<string, WeightPoint>();
  for (const snapshot of snapshots) {
    const value = snapshot.values.find((entry) => entry.metricType === 'WEIGHT');
    if (!value || !Number.isFinite(value.currentValue) || value.currentValue <= 0) continue;
    byDate.set(snapshot.date, {
      date: snapshot.date,
      weight: convertWeight(value.currentValue, normalizeWeightUnit(value.unit), preferred)
    });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function latestWeightPoint(points: readonly WeightPoint[]): WeightPoint | null {
  if (!points.length) return null;
  return [...points].sort((a, b) => a.date.localeCompare(b.date)).at(-1) ?? null;
}

export function entryOnDate(points: readonly WeightPoint[], date: string): WeightPoint | null {
  return points.find((point) => point.date === date) ?? null;
}

/** Most recent weigh-in strictly before the selected date. Never the value to submit. */
export function previousWeightPoint(points: readonly WeightPoint[], date: string): WeightPoint | null {
  return (
    points
      .filter((point) => point.date < date)
      .sort((a, b) => a.date.localeCompare(b.date))
      .at(-1) ?? null
  );
}

export function weightFieldForDate(
  points: readonly WeightPoint[],
  date: string,
  formUnit: WeightUnit,
  preferredUnit: WeightUnit
): string {
  const existing = entryOnDate(points, date);
  if (!existing) return '';
  return formatWeightInput(convertWeight(existing.weight, preferredUnit, formUnit));
}

export function retargetWeightInput(raw: string, from: WeightUnit, to: WeightUnit): string {
  if (!raw.trim() || from === to) return raw;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return raw;
  return formatWeightInput(convertWeight(parsed, from, to));
}

export function upsertWeightPoint(points: readonly WeightPoint[], saved: WeightPoint): WeightPoint[] {
  return [...points.filter((point) => point.date !== saved.date), saved].sort((a, b) => a.date.localeCompare(b.date));
}

export function mergeWeightSnapshot<T extends { id: string; date: string }>(snapshots: readonly T[], saved: T): T[] {
  return [...snapshots.filter((snapshot) => snapshot.id !== saved.id && snapshot.date !== saved.date), saved].sort(
    (a, b) => b.date.localeCompare(a.date)
  );
}

/**
 * Build the measurement save body from what the person typed.
 * A blank field fails even when a previous weigh-in is on screen.
 */
export function weightSaveRequest(
  draft: WeightDraft,
  storedUnit: string,
  today: string,
  points: readonly WeightPoint[] = []
): WeightSaveRequest {
  const dateError = checkInDateError(draft.date, today);
  if (dateError) return { ok: false, error: dateError };

  if (!draft.weight.trim()) {
    return {
      ok: false,
      error: 'Enter a weight. The previous weigh-in is only shown for reference.'
    };
  }

  const parsed = Number(draft.weight);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { ok: false, error: 'Enter a weight greater than zero.' };
  }

  const target = normalizeWeightUnit(storedUnit);
  const currentValue = convertWeight(parsed, draft.unit, target);
  if (target === 'lbs' && (currentValue < 30 || currentValue > 1000)) {
    return { ok: false, error: 'Enter a weight between 30 and 1,000 lb.' };
  }
  if (target === 'kg' && (currentValue < 15 || currentValue > 450)) {
    return { ok: false, error: 'Enter a weight between 15 and 450 kg.' };
  }

  return {
    ok: true,
    date: draft.date,
    currentValue,
    unit: storedWeightUnit(storedUnit),
    updatesExisting: entryOnDate(points, draft.date) != null
  };
}

export function weightSaveLabel(updatesExisting: boolean, saving: boolean): string {
  if (saving) return 'Saving…';
  return updatesExisting ? 'Update weight' : 'Save';
}

export function weightSavedMessage(dateLabel: string, updated: boolean): string {
  return updated ? `Updated the weigh-in for ${dateLabel}.` : `Saved the weigh-in for ${dateLabel}.`;
}

export function weightSaveErrorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Unable to save weight. Try again.';
}
