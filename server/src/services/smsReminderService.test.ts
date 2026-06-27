import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isMealReminderDue } from './smsReminderService.js';
import { parsePlannedMinutes } from '../utils/meals.js';

describe('parsePlannedMinutes', () => {
  it('parses HH:MM and HH:MM:SS', () => {
    assert.equal(parsePlannedMinutes('12:30'), 12 * 60 + 30);
    assert.equal(parsePlannedMinutes('12:30:00'), 12 * 60 + 30);
    assert.equal(parsePlannedMinutes('bad'), null);
  });
});

describe('isMealReminderDue', () => {
  it('is true 15–30 minutes before the planned meal', () => {
    const lunchMinutes = 12 * 60 + 30;
    assert.equal(isMealReminderDue(lunchMinutes - 30, '12:30'), true);
    assert.equal(isMealReminderDue(lunchMinutes - 15, '12:30'), true);
    assert.equal(isMealReminderDue(lunchMinutes - 14, '12:30'), false);
    assert.equal(isMealReminderDue(lunchMinutes - 31, '12:30'), false);
  });

  it('is false when planned time is missing or invalid', () => {
    assert.equal(isMealReminderDue(600, null), false);
    assert.equal(isMealReminderDue(600, 'noon'), false);
  });
});
