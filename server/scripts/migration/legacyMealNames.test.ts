import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  fallbackMealNameForNumber,
  isImportedJunkMealName,
  legacyMealName,
  renameImportedMeal
} from './legacyMealNames.ts';

test('legacyMealName keeps a real name and the old label fields', () => {
  assert.equal(legacyMealName({ mealnum: 1, name: 'Breakfast' }, 0), 'Breakfast');
  assert.equal(legacyMealName({ mealnum: 2, name: "5'4\"", meal_name: 'Lunch' }, 1), 'Lunch');
  assert.equal(legacyMealName({ mealnum: 1, name: '12:30 PM', title: 'Post workout' }, 0), 'Post workout');
  assert.equal(legacyMealName({ mealnum: 3, name: "5'4\"", type: 'snack' }, 2), 'Snack');
});

test('legacyMealName falls back to Breakfast, Lunch, Snack, Dinner by order', () => {
  assert.equal(legacyMealName({ mealnum: 1, name: '5\'4"' }, 0), 'Breakfast');
  assert.equal(legacyMealName({ mealnum: 2, name: '12:30 PM' }, 1), 'Lunch');
  assert.equal(legacyMealName({ mealnum: 3, name: '7:00am' }, 2), 'Snack');
  assert.equal(legacyMealName({ mealnum: 4, name: '' }, 3), 'Dinner');
  assert.equal(legacyMealName({ mealnum: 5, name: '5 ft 4 in' }, 4), 'Meal 5');
  assert.equal(legacyMealName({ name: '12:30 p.m.' }, 1), 'Lunch');
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

test('renameImportedMeal uses meal number and keeps a clock time', () => {
  assert.equal(fallbackMealNameForNumber(1), 'Breakfast');
  assert.equal(fallbackMealNameForNumber(2), 'Lunch');
  assert.equal(fallbackMealNameForNumber(4), 'Dinner');
  assert.deepEqual(renameImportedMeal('5\'4"', 1, null), { name: 'Breakfast', plannedTime: null });
  assert.deepEqual(renameImportedMeal('12:30 PM', 2, null), { name: 'Lunch', plannedTime: '12:30' });
  assert.deepEqual(renameImportedMeal('12:30 PM', 2, '13:00'), { name: 'Lunch', plannedTime: '13:00' });
  assert.equal(renameImportedMeal('Breakfast', 1, null), null);
});
