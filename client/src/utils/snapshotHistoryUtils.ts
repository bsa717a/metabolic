import type { ProgramMetric, ProgramMetricSnapshot } from '../types';
import { parseDateKey } from '../services/api';

export function metricsWithSnapshotCurrent(metrics: ProgramMetric[], snapshot: ProgramMetricSnapshot | null) {
  if (!snapshot) return metrics;
  return metrics.map((metric) => {
    const saved = snapshot.values.find((value) => value.metricType === metric.metricType);
    if (!saved) return metric;
    return { ...metric, currentValue: Number(saved.currentValue) };
  });
}

export function formatSnapshotCurrentLabel(date: string) {
  return `Current (${parseDateKey(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })})`;
}

export type SnapshotRow = {
  snapshot: ProgramMetricSnapshot;
  session: number;
  weight: number | null;
  bodyFatPercent: number | null;
  leanTissue: number | null;
  fatMass: number | null;
  scaleChange: string;
  percentChange: string;
};

export function metricValue(snapshot: ProgramMetricSnapshot, metricType: string) {
  const value = snapshot.values.find((row) => row.metricType === metricType);
  return value != null ? Number(value.currentValue) : null;
}

export function formatSnapshotDate(date: string) {
  return parseDateKey(date).toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    timeZone: 'UTC'
  });
}

function formatNumber(value: number | null, decimals = 2, suffix = '') {
  if (value == null || !Number.isFinite(value)) return 'N/A';
  return `${value.toFixed(decimals)}${suffix}`;
}

function formatDelta(current: number | null, previous: number | null, decimals = 2, suffix = '') {
  if (current == null || previous == null || !Number.isFinite(current) || !Number.isFinite(previous)) return 'N/A';
  const delta = current - previous;
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta.toFixed(decimals)}${suffix}`;
}

export function buildSnapshotRows(snapshots: ProgramMetricSnapshot[]): SnapshotRow[] {
  const chronological = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));

  return chronological.map((snapshot, index) => {
    const previous = index > 0 ? chronological[index - 1] : null;
    const weight = metricValue(snapshot, 'WEIGHT');
    const bodyFatPercent = metricValue(snapshot, 'BODY_FAT');
    const prevWeight = previous ? metricValue(previous, 'WEIGHT') : null;
    const prevBodyFat = previous ? metricValue(previous, 'BODY_FAT') : null;

    return {
      snapshot,
      session: index + 1,
      weight,
      bodyFatPercent,
      leanTissue: metricValue(snapshot, 'LEAN_TISSUE_MASS'),
      fatMass: metricValue(snapshot, 'FAT_MASS'),
      scaleChange: formatDelta(weight, prevWeight),
      percentChange: formatDelta(bodyFatPercent, prevBodyFat, 2, '%')
    };
  });
}

export function formatSnapshotMetric(value: number | null, decimals = 2, suffix = '') {
  return formatNumber(value, decimals, suffix);
}
