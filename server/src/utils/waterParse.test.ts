import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isWaterOnlySmsCommand,
  looksLikeWaterLogCommand,
  parseWaterAmountOz,
  parseHydrationGoalOz
} from './waterParse.js';

describe('parseWaterAmountOz', () => {
  it('parses oz amounts in add-style messages', () => {
    assert.equal(parseWaterAmountOz('Add 8oz of water'), 8);
    assert.equal(parseWaterAmountOz('Add 8 oz water'), 8);
  });
});

describe('looksLikeWaterLogCommand', () => {
  it('matches explicit water log commands', () => {
    assert.equal(looksLikeWaterLogCommand('Add 8oz of water'), true);
    assert.equal(looksLikeWaterLogCommand('16 oz water'), true);
    assert.equal(looksLikeWaterLogCommand('drank a glass of water'), true);
  });

  it('does not treat water questions as log commands', () => {
    assert.equal(looksLikeWaterLogCommand('How much water should I drink?'), false);
    assert.equal(looksLikeWaterLogCommand('not sure if I need 16 oz water'), false);
    assert.equal(looksLikeWaterLogCommand('wondering if 16 oz water is enough'), false);
  });
});

describe('isWaterOnlySmsCommand', () => {
  it('matches single-intent water logs', () => {
    assert.equal(isWaterOnlySmsCommand('Add 8oz of water'), true);
  });

  it('defers compound messages to the agent', () => {
    assert.equal(isWaterOnlySmsCommand('Add 8oz water and log my breakfast'), false);
  });
});

describe('parseHydrationGoalOz', () => {
  it('parses explicit goal amounts', () => {
    assert.equal(parseHydrationGoalOz('Set my goal to 104 oz'), 104);
    assert.equal(parseHydrationGoalOz('104 oz per day'), 104);
  });

  it('parses bare numbers in a goal thread', () => {
    assert.equal(parseHydrationGoalOz('104', { allowBareNumber: true }), 104);
    assert.equal(parseHydrationGoalOz('104 sounds good', { allowBareNumber: true }), 104);
  });

  it('rejects tiny bare numbers that are meal option picks', () => {
    assert.equal(parseHydrationGoalOz('2', { allowBareNumber: true }), null);
    assert.equal(parseHydrationGoalOz('1', { allowBareNumber: true }), null);
  });

  it('does not treat water logs as goal changes', () => {
    assert.equal(parseHydrationGoalOz('16 oz water'), null);
    assert.equal(parseHydrationGoalOz('Add 8oz of water'), null);
  });

  // Web coach calls this with allowBareNumber:false so a numbered meal-option pick ("2") or any
  // bare number can never silently become a daily water goal — the bug that burned us before.
  it('never turns a bare number into a goal when bare numbers are disabled', () => {
    assert.equal(parseHydrationGoalOz('2', { allowBareNumber: false }), null);
    assert.equal(parseHydrationGoalOz('80', { allowBareNumber: false }), null);
    assert.equal(parseHydrationGoalOz('104 sounds good', { allowBareNumber: false }), null);
  });

  it('still parses explicit ounce goals when bare numbers are disabled', () => {
    assert.equal(parseHydrationGoalOz('set my goal to 104 oz', { allowBareNumber: false }), 104);
    assert.equal(parseHydrationGoalOz('change my goal to 96 oz', { allowBareNumber: false }), 96);
  });
});
