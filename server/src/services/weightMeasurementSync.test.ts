import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

function functionSource(source: string, name: string) {
  const start = source.indexOf(`export async function ${name}`);
  assert.notEqual(start, -1, `${name} should be exported`);
  const next = source.indexOf('\nexport async function ', start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

describe('weight measurement sync', () => {
  const programService = readFileSync(new URL('./programService.ts', import.meta.url), 'utf8');
  const bodyComp = readFileSync(new URL('../utils/programBodyCompSync.ts', import.meta.url), 'utf8');
  const upsert = functionSource(programService, 'upsertSnapshotMeasurement');
  const weightSync = functionSource(bodyComp, 'syncDailyLogWeight');
  const metricUpdate = functionSource(programService, 'updateProgramMetrics');

  it('writes the entered weight onto that day and does not resolve nutrition targets', () => {
    assert.match(upsert, /syncDailyLogWeight/);
    assert.match(upsert, /input\.metricType === 'WEIGHT'/);
    assert.doesNotMatch(upsert, /resolveTargets/);
    assert.doesNotMatch(upsert, /freezeTargetsOnPeriod/);
    assert.match(weightSync, /data: \{ weight: storedWeight \}/);
    assert.doesNotMatch(weightSync, /resolveTargets/);
  });

  it('leaves nutrition-target refresh on the full metric update used by today\'s check-in', () => {
    assert.match(metricUpdate, /weightCurrentChanged/);
    assert.match(metricUpdate, /resolveTargets/);
    assert.match(metricUpdate, /freezeTargetsOnPeriod/);
  });

  it('does not copy every body-comp field when only weight is logged', () => {
    const weightBranch = upsert.slice(upsert.indexOf("input.metricType === 'WEIGHT'"));
    assert.match(weightBranch, /syncDailyLogWeight/);
    assert.match(weightSync, /existing/);
    assert.doesNotMatch(
      weightSync.slice(weightSync.indexOf('if (existing)'), weightSync.indexOf('const [metrics, prior]')),
      /bodyFat|waist|calorieTarget/
    );
  });
});
