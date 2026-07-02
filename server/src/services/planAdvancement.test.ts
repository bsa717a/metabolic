import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveKickoffPlanAction } from './planAdvancement.js';

const DAY_MS = 86400000;
const today = new Date('2026-07-02T00:00:00.000Z');
const daysAgo = (days: number) => new Date(today.getTime() - days * DAY_MS);

describe('resolveKickoffPlanAction', () => {
  it('mints Week 1 today when the program has no plan history', () => {
    assert.equal(resolveKickoffPlanAction(null, today), 'mint_week1_today');
  });

  it('confirms a fresh week instead of burning it', () => {
    assert.equal(resolveKickoffPlanAction(daysAgo(0), today), 'confirm_current');
    assert.equal(resolveKickoffPlanAction(daysAgo(1), today), 'confirm_current');
    assert.equal(resolveKickoffPlanAction(daysAgo(3), today), 'confirm_current');
  });

  it('advances normally once the current week is old enough', () => {
    assert.equal(resolveKickoffPlanAction(daysAgo(4), today), 'advance');
    assert.equal(resolveKickoffPlanAction(daysAgo(10), today), 'advance');
  });
});
