import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dedupeMealsByNumber } from './dedupeMealsByNumber.js';

describe('dedupeMealsByNumber', () => {
  it('keeps a single meal per number and prefers the one with more items', () => {
    const meals = [
      { mealNumber: 1, name: 'Breakfast empty', items: [] },
      { mealNumber: 1, name: 'Breakfast filled', items: [{ id: 'a' }, { id: 'b' }] },
      { mealNumber: 2, name: 'Snack', items: [{ id: 'c' }] },
      { mealNumber: 1, name: 'Breakfast one item', items: [{ id: 'd' }] }
    ];
    assert.deepEqual(
      dedupeMealsByNumber(meals).map((meal) => meal.name),
      ['Breakfast filled', 'Snack']
    );
  });

  it('prefers a logged meal over a richer planned template duplicate', () => {
    const meals = [
      {
        mealNumber: 1,
        name: 'Template',
        status: 'PLANNED',
        items: [
          { type: 'PLANNED' },
          { type: 'PLANNED' },
          { type: 'PLANNED' }
        ]
      },
      {
        mealNumber: 1,
        name: 'Logged',
        status: 'MODIFIED',
        items: [{ type: 'ACTUAL' }]
      }
    ];
    assert.equal(dedupeMealsByNumber(meals)[0]?.name, 'Logged');
  });

  it('returns meals unchanged when numbers are unique', () => {
    const meals = [
      { mealNumber: 3, items: [] },
      { mealNumber: 1, items: [] }
    ];
    assert.deepEqual(
      dedupeMealsByNumber(meals).map((meal) => meal.mealNumber),
      [1, 3]
    );
  });
});
