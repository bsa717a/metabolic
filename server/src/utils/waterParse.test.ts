import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isWaterOnlySmsCommand, looksLikeWaterLogCommand, parseWaterAmountOz } from './waterParse.js';

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
