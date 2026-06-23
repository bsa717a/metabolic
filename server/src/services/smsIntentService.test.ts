import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseSmsAction } from '../services/smsIntentService.js';

describe('parseSmsAction', () => {
  it('marks log-as-planned messages as meal complete, not food logging', () => {
    const action = parseSmsAction('Log breakfast as planned');
    assert.equal(action.intent, 'MARK_MEAL_COMPLETE');
    assert.equal(action.mealName, 'breakfast');
  });

  it('marks eaten-as-planned messages as meal complete', () => {
    const action = parseSmsAction('Mark breakfast has eaten as planned');
    assert.equal(action.intent, 'MARK_MEAL_COMPLETE');
    assert.equal(action.mealName, 'breakfast');
  });
});
