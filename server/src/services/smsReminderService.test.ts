import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildMealReminder, buildReminderPushTitle, isMealReminderDue, reminderClickPath } from './smsReminderService.js';
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

describe('buildMealReminder', () => {
  it('includes planned meal items and omits the old macro prompt', () => {
    const message = buildMealReminder('Earl', 'Meal 3', '12:00pm', [
      { type: 'PLANNED', nameSnapshot: 'Chicken - Roasted Chicken Breast w/o Skin', quantity: 3, unit: 'oz' },
      { type: 'PLANNED', nameSnapshot: 'Berries - Any', quantity: 1, unit: 'cup' }
    ]);
    assert.match(message, /Hey Earl, Meal 3 is coming up around 12:00pm\./);
    assert.match(message, /Planned:/);
    assert.match(message, /1\. 🍗 3 oz Chicken - Roasted Chicken Breast w\/o Skin/);
    assert.match(message, /2\. 🫐 1 cup Berries - Any/);
    assert.doesNotMatch(message, /Want ideas that fit your macros/);
  });

  it('keeps a short reminder when no planned items exist', () => {
    assert.equal(buildMealReminder('Earl', 'Meal 3', '12:00pm', []), 'Hey Earl, Meal 3 is coming up around 12:00pm.');
  });
});

describe('buildReminderPushTitle', () => {
  it('uses the meal name for meal reminders', () => {
    assert.equal(buildReminderPushTitle('MEAL_REMINDER', 'Meal 3'), 'Meal 3 coming up');
    assert.equal(buildReminderPushTitle('MEAL_REMINDER'), 'Meal reminder');
  });

  it('labels evening and journey nudges', () => {
    assert.equal(buildReminderPushTitle('EVENING_RECAP'), 'Evening check-in');
    assert.equal(buildReminderPushTitle('GUIDED_DISCOVERY_PROMPT'), 'Metabolic');
  });
});

describe('reminderClickPath', () => {
  it('opens nutrition for meals and home for the evening recap', () => {
    assert.equal(reminderClickPath('MEAL_REMINDER'), '/nutrition');
    assert.equal(reminderClickPath('EVENING_RECAP'), '/');
    assert.equal(reminderClickPath('GUIDED_DISCOVERY_PROMPT'), '/level-up/journey');
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
