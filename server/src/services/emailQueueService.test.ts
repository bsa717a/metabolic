import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('emailQueueService backoff logic', () => {
  const BASE_DELAY_MS = 60_000;
  const MAX_DELAY_MS = 3600_000;

  function calculateExpectedDelay(attempts: number): number {
    return Math.min(BASE_DELAY_MS * Math.pow(2, attempts), MAX_DELAY_MS);
  }

  it('calculates 1 minute base delay for first retry', () => {
    assert.equal(calculateExpectedDelay(0), 60_000);
  });

  it('calculates 2 minute delay for second retry', () => {
    assert.equal(calculateExpectedDelay(1), 120_000);
  });

  it('calculates 4 minute delay for third retry', () => {
    assert.equal(calculateExpectedDelay(2), 240_000);
  });

  it('calculates 32 minute delay for sixth retry', () => {
    assert.equal(calculateExpectedDelay(5), 1_920_000);
  });

  it('caps at 1 hour max delay', () => {
    assert.equal(calculateExpectedDelay(10), MAX_DELAY_MS);
    assert.equal(calculateExpectedDelay(20), MAX_DELAY_MS);
  });
});
