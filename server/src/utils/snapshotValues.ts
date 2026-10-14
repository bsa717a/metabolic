/**
 * Metric types already stored on a snapshot that a replacement save no longer includes.
 * A missed-day check-in replaces the day's values, so omitted measurements must be removed
 * before the remaining rows are synced to the daily log.
 */
export function omittedSnapshotMetricTypes(
  existingTypes: readonly string[],
  submittedTypes: readonly string[]
): string[] {
  const keep = new Set(submittedTypes);
  const omitted: string[] = [];
  const seen = new Set<string>();
  for (const metricType of existingTypes) {
    if (keep.has(metricType) || seen.has(metricType)) continue;
    seen.add(metricType);
    omitted.push(metricType);
  }
  return omitted;
}
