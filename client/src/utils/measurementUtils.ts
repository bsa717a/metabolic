import type { ProgramMetric, ProgramMetricSnapshot } from '../types';
import { metricValue } from './snapshotHistoryUtils';

export const MEASUREMENT_METRIC_TYPES = ['WAIST', 'HIPS', 'CHEST'] as const;
export type MeasurementMetricType = (typeof MEASUREMENT_METRIC_TYPES)[number];

export const MEASUREMENT_LABELS: Record<MeasurementMetricType, string> = {
  WAIST: 'Waist',
  HIPS: 'Hips',
  CHEST: 'Chest'
};

export function isMeasurementMetricType(metricType: string): metricType is MeasurementMetricType {
  return MEASUREMENT_METRIC_TYPES.includes(metricType as MeasurementMetricType);
}

export function bodyCompositionMetrics(metrics: ProgramMetric[]) {
  return metrics.filter((metric) => !isMeasurementMetricType(metric.metricType));
}

export function getMeasurementValues(snapshot: ProgramMetricSnapshot | null) {
  return {
    waist: snapshot ? metricValue(snapshot, 'WAIST') : null,
    hips: snapshot ? metricValue(snapshot, 'HIPS') : null,
    chest: snapshot ? metricValue(snapshot, 'CHEST') : null
  };
}

export function formatMeasurementDisplay(value: number | null) {
  if (value == null || !Number.isFinite(value) || value <= 0) return '—';
  return `${value.toFixed(2)} in`;
}

export function measurementSnapshotPayload(snapshot: ProgramMetricSnapshot | null) {
  return MEASUREMENT_METRIC_TYPES.flatMap((metricType) => {
    if (!snapshot) return [];
    const saved = snapshot.values.find((value) => value.metricType === metricType);
    if (!saved) return [];
    return [{
      metricType,
      currentValue: Number(saved.currentValue),
      unit: saved.unit
    }];
  });
}

export function buildSessionSnapshotPayload(
  bodyCompMetrics: ProgramMetric[],
  measurementSource: ProgramMetricSnapshot | null
) {
  const bodyPayload = bodyCompMetrics.map((metric) => ({
    metricType: metric.metricType,
    currentValue: Number(metric.currentValue),
    unit: metric.unit
  }));

  return [...bodyPayload, ...measurementSnapshotPayload(measurementSource)];
}
