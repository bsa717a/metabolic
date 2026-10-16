import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  describeMealRename,
  fallbackMealNameForNumber,
  isImportedJunkMealName,
  legacyMealName,
  legacyMealPlannedTime,
  mealNameForPlannedTime,
  renameImportedMeal,
  templateClientIds
} from './legacyMealNames.ts';

test('legacyMealName keeps a real name and the old label fields', () => {
  assert.equal(legacyMealName({ mealnum: 1, name: 'Breakfast' }, 0), 'Breakfast');
  assert.equal(legacyMealName({ mealnum: 2, name: "5'4\"", meal_name: 'Lunch' }, 1), 'Lunch');
  assert.equal(legacyMealName({ mealnum: 1, name: '12:30 PM', title: 'Post workout' }, 0), 'Post workout');
  assert.equal(legacyMealName({ mealnum: 3, name: "5'4\"", type: 'snack' }, 2), 'Snack');
});

test('legacyMealName uses the clock, then Breakfast, Lunch, Snack, Dinner by order', () => {
  assert.equal(legacyMealName({ mealnum: 1, name: '5\'4"' }, 0), 'Breakfast');
  assert.equal(legacyMealName({ mealnum: 2, name: '12:30 PM' }, 1), 'Lunch');
  assert.equal(legacyMealName({ mealnum: 2, name: '9:30am' }, 1), 'Breakfast');
  assert.equal(legacyMealName({ mealnum: 3, name: '7:00am' }, 2), 'Breakfast');
  assert.equal(legacyMealName({ mealnum: 5, name: '3 pm' }, 4), 'Snack');
  assert.equal(legacyMealName({ mealnum: 6, name: '6:30 PM', time: '' }, 5), 'Dinner');
  assert.equal(legacyMealName({ mealnum: 5, name: "5'4\"", time: '15:00' }, 4), 'Snack');
  assert.equal(legacyMealName({ mealnum: 4, name: '' }, 3), 'Dinner');
  assert.equal(legacyMealName({ mealnum: 5, name: '5 ft 4 in' }, 4), 'Meal 5');
  assert.equal(legacyMealName({ name: '12:30 p.m.' }, 1), 'Lunch');
});

test('meal names follow morning, midday, afternoon, and evening', () => {
  assert.equal(mealNameForPlannedTime('9:30am'), 'Breakfast');
  assert.equal(mealNameForPlannedTime('12:30'), 'Lunch');
  assert.equal(mealNameForPlannedTime('3 pm'), 'Snack');
  assert.equal(mealNameForPlannedTime('15:00'), 'Snack');
  assert.equal(mealNameForPlannedTime('18:30'), 'Dinner');
  assert.equal(mealNameForPlannedTime('not a time'), null);
});

test('junk names are heights and clock times only', () => {
  assert.equal(isImportedJunkMealName('5\'4"'), true);
  assert.equal(isImportedJunkMealName("5' 4''"), true);
  assert.equal(isImportedJunkMealName('12:30 PM'), true);
  assert.equal(isImportedJunkMealName('13:30'), true);
  assert.equal(isImportedJunkMealName('Breakfast'), false);
  assert.equal(isImportedJunkMealName('Post workout'), false);
  assert.equal(isImportedJunkMealName('64'), false);
});

test('legacyMealPlannedTime keeps a clock stored in the name when time is empty', () => {
  assert.equal(legacyMealName({ mealnum: 2, name: '12:30 PM', time: '' }, 1), 'Lunch');
  assert.equal(legacyMealPlannedTime({ name: '12:30 PM', time: '' }), '12:30');
  assert.equal(legacyMealPlannedTime({ name: '12:30 p.m.' }), '12:30');
  assert.equal(legacyMealPlannedTime({ name: '7:00am' }), '07:00');
  assert.equal(legacyMealPlannedTime({ name: "5'4\"", time: '' }), null);
  assert.equal(legacyMealPlannedTime({ name: '12:30 PM', time: '7:00am' }), '07:00');
  assert.equal(legacyMealPlannedTime({ name: 'Breakfast', time: '13:30' }), '13:30');
});

test('renameImportedMeal names from the clock and moves an empty time', () => {
  assert.equal(fallbackMealNameForNumber(1), 'Breakfast');
  assert.equal(fallbackMealNameForNumber(5), 'Meal 5');
  assert.deepEqual(renameImportedMeal('5\'4"', 1, null), { name: 'Breakfast', plannedTime: null });
  assert.deepEqual(renameImportedMeal('5\'4"', 5, null), { name: 'Meal 5', plannedTime: null });
  assert.deepEqual(renameImportedMeal('9:30am', 2, null), { name: 'Breakfast', plannedTime: '09:30' });
  assert.deepEqual(renameImportedMeal('12:30 PM', 2, null), { name: 'Lunch', plannedTime: '12:30' });
  assert.deepEqual(renameImportedMeal('3 pm', 5, null), { name: 'Snack', plannedTime: '15:00' });
  assert.deepEqual(renameImportedMeal('6:30 PM', 6, null), { name: 'Dinner', plannedTime: '18:30' });
  assert.deepEqual(renameImportedMeal('5\'4"', 6, '15:00'), { name: 'Snack', plannedTime: '15:00' });
  assert.deepEqual(renameImportedMeal('12:30 PM', 2, '13:00'), { name: 'Lunch', plannedTime: '13:00' });
  assert.equal(renameImportedMeal('Breakfast', 1, null), null);
  assert.equal(describeMealRename('12:30 PM', 'Lunch', '12:30'), '"12:30 PM" → Lunch, time → 12:30');
  assert.equal(describeMealRename('5\'4"', 'Breakfast', null), '"5\'4\\"" → Breakfast');
});

test('template meals belong to the client on the plan, not the coach who created them', () => {
  const clients = new Set(['rachel', 'gary']);
  assert.deepEqual(
    templateClientIds({
      programUserIds: ['rachel'],
      planPeriodUserIds: ['rachel'],
      clientIds: clients
    }),
    ['rachel']
  );
  assert.deepEqual(
    templateClientIds({
      programUserIds: [],
      planPeriodUserIds: ['gary'],
      clientIds: clients
    }),
    ['gary']
  );
  assert.deepEqual(
    templateClientIds({
      programUserIds: [],
      planPeriodUserIds: [],
      clientIds: new Set(['tommy', 'rachel'])
    }),
    []
  );
});
