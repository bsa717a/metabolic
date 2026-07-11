import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parsePlannedMealUpdate, PlanEditError } from './planEditService.js';

const TODAY = '2026-07-10';

function validArgs(overrides: Record<string, unknown> = {}) {
  return {
    date: '2026-07-11',
    meals: [
      {
        mealName: 'Breakfast',
        plannedTime: '06:30',
        items: [{ name: 'Banana', quantity: 1, unit: 'medium', calories: 105, protein: 1, carbs: 27, fat: 0.4 }]
      }
    ],
    ...overrides
  };
}

describe('parsePlannedMealUpdate', () => {
  it('accepts a valid single-meal update', () => {
    const parsed = parsePlannedMealUpdate(validArgs(), TODAY);
    assert.equal(parsed.date, '2026-07-11');
    assert.equal(parsed.meals.length, 1);
    assert.deepEqual(parsed.meals[0].items[0], {
      name: 'Banana',
      quantity: 1,
      unit: 'medium',
      calories: 105,
      protein: 1,
      carbs: 27,
      fat: 0.4
    });
  });

  it('accepts today itself', () => {
    assert.doesNotThrow(() => parsePlannedMealUpdate(validArgs({ date: TODAY }), TODAY));
  });

  it('rejects past dates with a user-readable message', () => {
    assert.throws(() => parsePlannedMealUpdate(validArgs({ date: '2026-07-09' }), TODAY), PlanEditError);
    assert.throws(() => parsePlannedMealUpdate(validArgs({ date: '2026-07-09' }), TODAY), /in the past/);
  });

  it('rejects dates beyond the 31-day horizon', () => {
    assert.throws(() => parsePlannedMealUpdate(validArgs({ date: '2026-09-01' }), TODAY), /31 days/);
  });

  it('rejects malformed dates and relative words', () => {
    assert.throws(() => parsePlannedMealUpdate(validArgs({ date: 'tomorrow' }), TODAY), /YYYY-MM-DD/);
    assert.throws(() => parsePlannedMealUpdate(validArgs({ date: '2026-7-11' }), TODAY), /YYYY-MM-DD/);
  });

  it('rejects an empty or missing meals array', () => {
    assert.throws(() => parsePlannedMealUpdate(validArgs({ meals: [] }), TODAY), /non-empty/);
    assert.throws(() => parsePlannedMealUpdate({ date: '2026-07-11' }, TODAY), /non-empty/);
  });

  it('rejects a meal with no items', () => {
    assert.throws(
      () => parsePlannedMealUpdate(validArgs({ meals: [{ mealName: 'Lunch', items: [] }] }), TODAY),
      /at least one item/
    );
  });

  it('rejects duplicate meal names in one update', () => {
    const meals = [
      { mealName: 'Lunch', items: [{ name: 'Apple', calories: 95, protein: 0.5, carbs: 25, fat: 0 }] },
      { mealName: 'lunch', items: [{ name: 'Pear', calories: 100, protein: 0.5, carbs: 27, fat: 0 }] }
    ];
    assert.throws(() => parsePlannedMealUpdate(validArgs({ meals }), TODAY), /appears twice/);
  });

  it('rejects unrealistic item macros', () => {
    const meals = [{ mealName: 'Lunch', items: [{ name: 'Mystery', calories: 9000, protein: 0, carbs: 0, fat: 0 }] }];
    assert.throws(() => parsePlannedMealUpdate(validArgs({ meals }), TODAY), /not realistic/);
  });

  it('rejects negative and non-numeric macros', () => {
    const negative = [{ mealName: 'Lunch', items: [{ name: 'Apple', calories: -10, protein: 0, carbs: 0, fat: 0 }] }];
    assert.throws(() => parsePlannedMealUpdate(validArgs({ meals: negative }), TODAY), /non-negative/);
    const missing = [{ mealName: 'Lunch', items: [{ name: 'Apple', protein: 0, carbs: 0, fat: 0 }] }];
    assert.throws(() => parsePlannedMealUpdate(validArgs({ meals: missing }), TODAY), /non-negative/);
  });

  it('rejects invalid plannedTime formats', () => {
    const meals = [
      { mealName: 'Lunch', plannedTime: '1pm', items: [{ name: 'Apple', calories: 95, protein: 0.5, carbs: 25, fat: 0 }] }
    ];
    assert.throws(() => parsePlannedMealUpdate(validArgs({ meals }), TODAY), /HH:MM/);
  });

  it('defaults quantity to 1 and unit to serving', () => {
    const meals = [{ mealName: 'Snack', items: [{ name: 'Protein bar', calories: 200, protein: 15, carbs: 20, fat: 7 }] }];
    const parsed = parsePlannedMealUpdate(validArgs({ meals }), TODAY);
    assert.equal(parsed.meals[0].items[0].quantity, 1);
    assert.equal(parsed.meals[0].items[0].unit, 'serving');
  });

  it('rejects an item without a name', () => {
    const meals = [{ mealName: 'Snack', items: [{ calories: 200, protein: 15, carbs: 20, fat: 7 }] }];
    assert.throws(() => parsePlannedMealUpdate(validArgs({ meals }), TODAY), /missing its name/);
  });
});
