import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isMealReminderDue } from './smsReminderService.js';
import { parsePlannedMinutes, normalizePlannedTimeStorage } from '../utils/meals.js';

describe('parsePlannedMinutes', () => {
  it('parses HH:MM and HH:MM:SS', () => {
    assert.equal(parsePlannedMinutes('12:30'), 12 * 60 + 30);
    assert.equal(parsePlannedMinutes('12:30:00'), 12 * 60 + 30);
    assert.equal(parsePlannedMinutes('bad'), null);
  });

  it('parses 12-hour times with am/pm', () => {
    assert.equal(parsePlannedMinutes('6:00am'), 6 * 60);
    assert.equal(parsePlannedMinutes('7:30am'), 7 * 60 + 30);
    assert.equal(parsePlannedMinutes('12:00pm'), 12 * 60);
    assert.equal(parsePlannedMinutes('9:00pm'), 21 * 60);
    assert.equal(parsePlannedMinutes('12:00am'), 0);
  });

  it('normalizes storage values to HH:MM', () => {
    assert.equal(normalizePlannedTimeStorage('7:30am'), '07:30');
    assert.equal(normalizePlannedTimeStorage('19:54'), '19:54');
  });
});

describe('isMealReminderDue', () => {
  it('is true from 30 minutes before the meal until meal time', () => {
    const lunchMinutes = 12 * 60 + 30;
    assert.equal(isMealReminderDue(lunchMinutes - 30, '12:30'), true);
    assert.equal(isMealReminderDue(lunchMinutes - 15, '12:30'), true);
    assert.equal(isMealReminderDue(lunchMinutes - 14, '12:30'), true);
    assert.equal(isMealReminderDue(lunchMinutes, '12:30'), true);
    assert.equal(isMealReminderDue(lunchMinutes - 31, '12:30'), false);
    assert.equal(isMealReminderDue(lunchMinutes + 1, '12:30'), false);
  });

  it('is false when planned time is missing or invalid', () => {
    assert.equal(isMealReminderDue(600, null), false);
    assert.equal(isMealReminderDue(600, 'noon'), false);
  });
});
