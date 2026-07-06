import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BODY_COMP_METRIC_TYPES,
  isLikelySyncedDailyLogEcho,
  shouldPreferProgramMetric,
  syncProgramMetricsFromSnapshotValues
} from './programBodyCompSync.js';

describe('shouldPreferProgramMetric', () => {
  it('prefers a metric edited on a later calendar day', () => {
    const metricUpdatedAt = new Date('2026-07-06T15:00:00.000Z');
    const logDate = new Date('2026-07-05T00:00:00.000Z');
    assert.equal(shouldPreferProgramMetric(metricUpdatedAt, logDate, 240, 230), true);
  });

  it('prefers a metric edited later on the same day', () => {
    const metricUpdatedAt = new Date('2026-07-06T15:00:00.000Z');
    const logDate = new Date('2026-07-06T08:00:00.000Z');
    assert.equal(shouldPreferProgramMetric(metricUpdatedAt, logDate, 240, 230), true);
  });

  it('uses a newer log when the metric has not been edited since', () => {
    const metricUpdatedAt = new Date('2026-06-01T10:00:00.000Z');
    const logDate = new Date('2026-07-05T00:00:00.000Z');
    assert.equal(shouldPreferProgramMetric(metricUpdatedAt, logDate, 210, 230), false);
  });

  it('prefers a metric when a same-day log has an older timestamp', () => {
    const metricUpdatedAt = new Date('2026-07-06T18:00:00.000Z');
    const logUpdatedAt = new Date('2026-07-06T09:00:00.000Z');
    assert.equal(shouldPreferProgramMetric(metricUpdatedAt, logUpdatedAt, 250, 240), true);
  });
});

describe('isLikelySyncedDailyLogEcho', () => {
  it('detects a daily log copied from program metrics after the metric edit', () => {
    const metric = { currentValue: 255, updatedAt: new Date('2026-07-06T17:18:56.262Z') };
    const log = {
      date: new Date('2026-07-06T00:00:00.000Z'),
      weight: 255,
      updatedAt: new Date('2026-07-06T17:22:17.036Z')
    };
    assert.equal(isLikelySyncedDailyLogEcho(log, metric), true);
  });

  it('does not treat an independent same-day weigh-in as an echo', () => {
    const metric = { currentValue: 232, updatedAt: new Date('2026-07-06T10:00:00.000Z') };
    const log = {
      date: new Date('2026-07-06T00:00:00.000Z'),
      weight: 231,
      updatedAt: new Date('2026-07-06T08:00:00.000Z')
    };
    assert.equal(isLikelySyncedDailyLogEcho(log, metric), false);
  });
});

describe('syncProgramMetricsFromSnapshotValues', () => {
  it('exports the body-comp metric types used for current-weight sync', () => {
    assert.deepEqual(BODY_COMP_METRIC_TYPES, ['WEIGHT', 'BODY_FAT', 'LEAN_TISSUE_MASS', 'FAT_MASS']);
  });

  it('returns false when the snapshot has no body-comp values', async () => {
    const synced = await syncProgramMetricsFromSnapshotValues('missing-program', new Date(), [
      { metricType: 'WAIST', currentValue: 32 }
    ]);
    assert.equal(synced, false);
  });
});
