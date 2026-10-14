import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { omittedSnapshotMetricTypes } from './snapshotValues.js';

describe('omittedSnapshotMetricTypes', () => {
  it('drops measurements cleared from a missed-day save', () => {
    assert.deepEqual(
      omittedSnapshotMetricTypes(
        ['WEIGHT', 'BODY_FAT', 'WAIST', 'HIPS'],
        ['WEIGHT', 'BODY_FAT', 'HIPS']
      ),
      ['WAIST']
    );
  });

  it('drops every stored type when the submitted set is empty', () => {
    assert.deepEqual(omittedSnapshotMetricTypes(['WAIST', 'CHEST'], []), ['WAIST', 'CHEST']);
  });

  it('keeps types that are still submitted and ignores new ones', () => {
    assert.deepEqual(
      omittedSnapshotMetricTypes(['WEIGHT', 'WAIST'], ['WEIGHT', 'BODY_FAT', 'WAIST']),
      []
    );
  });
});
