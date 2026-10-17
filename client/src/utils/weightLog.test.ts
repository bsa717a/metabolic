import { describe, expect, it } from 'vitest';
import type { ProgramMetricSnapshot } from '../types';
import {
  convertWeight,
  entryOnDate,
  latestWeightPoint,
  previousWeightPoint,
  upsertWeightPoint,
  weightFieldForDate,
  weightPointsFromSnapshots,
  weightSaveErrorMessage,
  weightSaveLabel,
  weightSaveRequest
} from './weightLog';

function snapshot(date: string, weight: number, unit = 'lbs', extra: ProgramMetricSnapshot['values'] = []): ProgramMetricSnapshot {
  return {
    id: date,
    date,
    values: [{ metricType: 'WEIGHT', currentValue: weight, unit }, ...extra]
  };
}

const today = '2026-10-17';

describe('weight history', () => {
  it('shows an empty history when no snapshot has a weight', () => {
    const points = weightPointsFromSnapshots(
      [{ id: '1', date: '2026-10-01', values: [{ metricType: 'WAIST', currentValue: 32, unit: 'in' }] }],
      'lbs'
    );
    expect(points).toEqual([]);
    expect(latestWeightPoint(points)).toBeNull();
    expect(weightFieldForDate(points, today, 'lbs', 'lbs')).toBe('');
  });

  it('uses dated snapshot weights and ignores copied days that are not weigh-ins', () => {
    const points = weightPointsFromSnapshots(
      [
        snapshot('2026-10-10', 178.4),
        snapshot('2026-10-01', 180, 'lbs', [{ metricType: 'WAIST', currentValue: 34, unit: 'in' }])
      ],
      'lbs'
    );
    expect(points.map((point) => point.date)).toEqual(['2026-10-01', '2026-10-10']);
    expect(latestWeightPoint(points)).toEqual({ date: '2026-10-10', weight: 178.4 });
  });

  it('keeps a historical entry from replacing the latest weight', () => {
    const existing = [
      { date: '2026-10-01', weight: 180 },
      { date: '2026-10-10', weight: 178 }
    ];
    const next = upsertWeightPoint(existing, { date: '2026-10-05', weight: 179 });
    expect(latestWeightPoint(next)).toEqual({ date: '2026-10-10', weight: 178 });
    expect(next).toEqual([
      { date: '2026-10-01', weight: 180 },
      { date: '2026-10-05', weight: 179 },
      { date: '2026-10-10', weight: 178 }
    ]);
  });

  it('replaces the same date instead of adding a second point', () => {
    const existing = [
      { date: '2026-10-01', weight: 180 },
      { date: '2026-10-17', weight: 176 }
    ];
    const next = upsertWeightPoint(existing, { date: '2026-10-17', weight: 175.2 });
    expect(next.filter((point) => point.date === '2026-10-17')).toEqual([{ date: '2026-10-17', weight: 175.2 }]);
    expect(latestWeightPoint(next)?.weight).toBe(175.2);
  });
});

describe('weight form', () => {
  const points = [
    { date: '2026-10-01', weight: 180 },
    { date: '2026-10-10', weight: 178 }
  ];

  it('does not submit the previous weight when the field is blank', () => {
    const request = weightSaveRequest({ weight: '', unit: 'lbs', date: today }, 'lbs', today, points);
    expect(request.ok).toBe(false);
    if (!request.ok) expect(request.error).toMatch(/previous weigh-in/i);
    expect(previousWeightPoint(points, today)?.weight).toBe(178);
    expect(weightFieldForDate(points, today, 'lbs', 'lbs')).toBe('');
  });

  it('saves a first entry from the typed weight', () => {
    const request = weightSaveRequest({ weight: '181.5', unit: 'lbs', date: today }, 'lbs', today, []);
    expect(request).toEqual({
      ok: true,
      date: today,
      currentValue: 181.5,
      unit: 'lbs',
      updatesExisting: false
    });
    expect(weightSaveLabel(false, false)).toBe('Save');
  });

  it('offers to update a date that already has a weigh-in and prefills that date only', () => {
    expect(entryOnDate(points, '2026-10-10')?.weight).toBe(178);
    expect(weightFieldForDate(points, '2026-10-10', 'lbs', 'lbs')).toBe('178');
    expect(weightSaveLabel(true, false)).toBe('Update weight');
    const request = weightSaveRequest({ weight: '177.2', unit: 'lbs', date: '2026-10-10' }, 'lbs', today, points);
    expect(request.ok).toBe(true);
    if (request.ok) {
      expect(request.updatesExisting).toBe(true);
      expect(request.currentValue).toBe(177.2);
    }
  });

  it('allows a past date and rejects a future date', () => {
    const past = weightSaveRequest({ weight: '179', unit: 'lbs', date: '2026-10-05' }, 'lbs', today, points);
    expect(past.ok).toBe(true);
    const future = weightSaveRequest({ weight: '179', unit: 'lbs', date: '2026-10-18' }, 'lbs', today, points);
    expect(future.ok).toBe(false);
  });

  it('converts kilograms into the stored pound unit and does not send the previous pounds', () => {
    const request = weightSaveRequest({ weight: '80', unit: 'kg', date: today }, 'lbs', today, points);
    expect(request.ok).toBe(true);
    if (request.ok) {
      expect(request.unit).toBe('lbs');
      expect(request.currentValue).toBe(176.37);
      expect(request.currentValue).not.toBe(178);
    }
    const displayed = weightPointsFromSnapshots([snapshot(today, 176.37, 'lbs')], 'kg');
    expect(displayed[0]?.weight).toBe(80);
  });

  it('rejects a weight outside the supported range', () => {
    const request = weightSaveRequest({ weight: '1800', unit: 'lbs', date: today }, 'lbs', today, []);
    expect(request.ok).toBe(false);
  });

  it('surfaces a save failure message', () => {
    expect(weightSaveErrorMessage(new Error('Unable to save measurement'))).toBe('Unable to save measurement');
    expect(weightSaveErrorMessage('nope')).toBe('Unable to save weight. Try again.');
  });
});

describe('convertWeight', () => {
  it('rounds trip conversions to the hundredth', () => {
    expect(convertWeight(180, 'lbs', 'kg')).toBe(81.65);
    expect(convertWeight(81.65, 'kg', 'lbs')).toBe(180.01);
  });
});
