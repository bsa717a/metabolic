import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mockMealPrepBatch, type MealPrepBatchInput } from './aiService.js';
import { buildPrepBatches, type PlannedMealRow } from './mealPrepService.js';

function meal(overrides: Partial<PlannedMealRow> & { date: string }): PlannedMealRow {
  const { date, ...rest } = overrides;
  return {
    name: 'Chicken & Rice Bowl',
    cardSelections: null,
    dailyLog: { date: new Date(`${date}T00:00:00.000Z`) },
    items: [],
    ...rest
  };
}

function item(
  name: string,
  quantity: number,
  unit: string,
  food: PlannedMealRow['items'][number]['food'] = null
): PlannedMealRow['items'][number] {
  return { nameSnapshot: name, quantity, unit, food };
}

describe('buildPrepBatches', () => {
  it('groups repeated meals by name and sums quantities into one cook-now total', () => {
    const rows = [
      meal({ date: '2026-07-13', items: [item('Chicken breast', 6, 'oz'), item('White rice', 1, 'cup')] }),
      meal({ date: '2026-07-14', items: [item('Chicken breast', 6, 'oz'), item('White rice', 1, 'cup')] }),
      meal({ date: '2026-07-15', items: [item('Chicken breast', 6, 'oz'), item('White rice', 1, 'cup')] })
    ];

    const { plannedDayCount, batches } = buildPrepBatches(rows);

    assert.equal(plannedDayCount, 3);
    assert.equal(batches.length, 1);
    assert.equal(batches[0].occurrenceCount, 3);
    assert.deepEqual(batches[0].dates, ['2026-07-13', '2026-07-14', '2026-07-15']);
    assert.deepEqual(batches[0].cookNow, [
      { name: 'Chicken breast', totalQuantity: 18, unit: 'oz' },
      { name: 'White rice', totalQuantity: 3, unit: 'cup' }
    ]);
  });

  it('treats name matching as case- and whitespace-insensitive', () => {
    const rows = [
      meal({ date: '2026-07-13', name: 'Taco  Bowl', items: [item('Ground turkey', 4, 'oz')] }),
      meal({ date: '2026-07-14', name: 'taco bowl', items: [item('Ground turkey', 4, 'oz')] })
    ];

    const { batches } = buildPrepBatches(rows);
    assert.equal(batches.length, 1);
    assert.equal(batches[0].occurrenceCount, 2);
  });

  it('groups by card selections when present, even across renamed meals', () => {
    const picks = { setId: 'set1', picks: { cardA: 'opt1', cardB: ['opt2', 'opt3'] } };
    const samePicksDifferentOrder = { setId: 'set1', picks: { cardB: ['opt3', 'opt2'], cardA: 'opt1' } };
    const rows = [
      meal({ date: '2026-07-13', name: 'Dinner', cardSelections: picks, items: [item('Salmon', 5, 'oz')] }),
      meal({
        date: '2026-07-14',
        name: 'Dinner (edited)',
        cardSelections: samePicksDifferentOrder,
        items: [item('Salmon', 5, 'oz')]
      })
    ];

    const { batches } = buildPrepBatches(rows);
    assert.equal(batches.length, 1);
    assert.equal(batches[0].occurrenceCount, 2);
    assert.deepEqual(batches[0].cookNow, [{ name: 'Salmon', totalQuantity: 10, unit: 'oz' }]);
  });

  it('keeps different card picks in separate batches even when names match', () => {
    const rows = [
      meal({
        date: '2026-07-13',
        cardSelections: { setId: 'set1', picks: { cardA: 'opt1' } },
        items: [item('Salmon', 5, 'oz')]
      }),
      meal({
        date: '2026-07-14',
        cardSelections: { setId: 'set1', picks: { cardA: 'opt9' } },
        items: [item('Steak', 5, 'oz')]
      })
    ];

    const { batches } = buildPrepBatches(rows);
    assert.equal(batches.length, 2);
  });

  it('splits add-fresh items via food badges and computes per-serving amounts', () => {
    const freshFood = { role: 'FREE', textureTags: [], isFreeFood: true };
    const rows = [
      meal({ date: '2026-07-13', items: [item('Chicken breast', 6, 'oz'), item('Pico de gallo', 2, 'tbsp', freshFood)] }),
      meal({ date: '2026-07-14', items: [item('Chicken breast', 6, 'oz'), item('Pico de gallo', 2, 'tbsp', freshFood)] })
    ];

    const { batches } = buildPrepBatches(rows);
    assert.deepEqual(batches[0].cookNow, [{ name: 'Chicken breast', totalQuantity: 12, unit: 'oz' }]);
    assert.deepEqual(batches[0].addFresh, [
      {
        name: 'Pico de gallo',
        quantityPerServing: 2,
        unit: 'tbsp',
        servingCount: 2,
        dates: ['2026-07-13', '2026-07-14']
      }
    ]);
  });

  it('flags fresh ingredients by name when no food badge exists', () => {
    const rows = [
      meal({ date: '2026-07-13', items: [item('Avocado, sliced', 0.5, 'each'), item('Brown rice', 1, 'cup')] }),
      meal({ date: '2026-07-14', items: [item('Avocado, sliced', 0.5, 'each'), item('Brown rice', 1, 'cup')] })
    ];

    const { batches } = buildPrepBatches(rows);
    assert.deepEqual(batches[0].addFresh, [
      {
        name: 'Avocado, sliced',
        quantityPerServing: 0.5,
        unit: 'each',
        servingCount: 2,
        dates: ['2026-07-13', '2026-07-14']
      }
    ]);
    assert.deepEqual(batches[0].cookNow, [{ name: 'Brown rice', totalQuantity: 2, unit: 'cup' }]);
  });

  it('identifies which servings receive an add-fresh item that only occurs in part of a batch', () => {
    // Same card picks group these; lemon appears in only one of three occurrences.
    const picks = { setId: 'set1', picks: { cardA: 'opt1' } };
    const rows = [
      meal({ date: '2026-07-13', cardSelections: picks, items: [item('Cod', 5, 'oz'), item('Lemon wedge', 2, 'wedge')] }),
      meal({ date: '2026-07-14', cardSelections: picks, items: [item('Cod', 5, 'oz')] }),
      meal({ date: '2026-07-15', cardSelections: picks, items: [item('Cod', 5, 'oz')] })
    ];

    const { batches } = buildPrepBatches(rows);
    assert.equal(batches.length, 1);
    assert.deepEqual(batches[0].addFresh, [
      {
        name: 'Lemon wedge',
        quantityPerServing: 2,
        unit: 'wedge',
        servingCount: 1,
        dates: ['2026-07-13']
      }
    ]);
  });

  it('does not classify cooked dishes as fresh from a substring in their names', () => {
    const rows = [
      meal({
        date: '2026-07-13',
        items: [item('Orange chicken', 1, 'serving'), item('Cilantro lime rice', 1, 'cup')]
      })
    ];

    const { batches } = buildPrepBatches(rows);
    assert.deepEqual(batches[0].addFresh, []);
    assert.deepEqual(batches[0].cookNow, [
      { name: 'Cilantro lime rice', totalQuantity: 1, unit: 'cup' },
      { name: 'Orange chicken', totalQuantity: 1, unit: 'serving' }
    ]);
  });

  it('splits same-named slot meals with different foods into separate batches', () => {
    // "Snack" is a slot name, not a dish — eggs one day, protein bar the next.
    const rows = [
      meal({ date: '2026-07-13', name: 'Snack', items: [item('Eggs', 2, 'each')] }),
      meal({ date: '2026-07-14', name: 'Snack', items: [item('Protein bar', 1, 'bar')] }),
      meal({ date: '2026-07-15', name: 'Snack', items: [item('Eggs', 2, 'each')] })
    ];

    const { batches } = buildPrepBatches(rows);
    assert.equal(batches.length, 2);
    assert.equal(batches[0].occurrenceCount, 2);
    assert.deepEqual(batches[0].cookNow, [{ name: 'Eggs', totalQuantity: 4, unit: 'each' }]);
  });

  it('still merges same-named meals when only portions differ', () => {
    const rows = [
      meal({ date: '2026-07-13', name: 'Dinner', items: [item('Salmon', 5, 'oz'), item('Rice', 1, 'cup')] }),
      meal({ date: '2026-07-14', name: 'Dinner', items: [item('Salmon', 6.5, 'oz'), item('Rice', 1.25, 'cup')] })
    ];

    const { batches } = buildPrepBatches(rows);
    assert.equal(batches.length, 1);
    assert.deepEqual(batches[0].cookNow, [
      { name: 'Rice', totalQuantity: 2.25, unit: 'cup' },
      { name: 'Salmon', totalQuantity: 11.5, unit: 'oz' }
    ]);
  });

  it('sorts batches by occurrence count, then label', () => {
    const rows = [
      meal({ date: '2026-07-13', name: 'Zucchini Pasta', items: [item('Zucchini', 1, 'cup')] }),
      meal({ date: '2026-07-13', name: 'Breakfast Scramble', items: [item('Eggs', 3, 'egg')] }),
      meal({ date: '2026-07-14', name: 'Breakfast Scramble', items: [item('Eggs', 3, 'egg')] })
    ];

    const { batches } = buildPrepBatches(rows);
    assert.deepEqual(
      batches.map((batch) => batch.label),
      ['Breakfast Scramble', 'Zucchini Pasta']
    );
    assert.deepEqual(
      batches.map((batch) => batch.id),
      ['0', '1']
    );
  });

  it('counts planned days once even with multiple meals per day', () => {
    const rows = [
      meal({ date: '2026-07-13', name: 'Lunch Bowl', items: [item('Quinoa', 1, 'cup')] }),
      meal({ date: '2026-07-13', name: 'Dinner Bowl', items: [item('Rice', 1, 'cup')] })
    ];

    const { plannedDayCount } = buildPrepBatches(rows);
    assert.equal(plannedDayCount, 1);
  });

  it('defaults a blank unit to serving and merges case-insensitive ingredient names', () => {
    const rows = [
      meal({ date: '2026-07-13', items: [item('Greek Yogurt', 1, '')] }),
      meal({ date: '2026-07-14', items: [item('greek yogurt', 1, ' ')] })
    ];

    const { batches } = buildPrepBatches(rows);
    assert.deepEqual(batches[0].cookNow, [{ name: 'Greek Yogurt', totalQuantity: 2, unit: 'serving' }]);
  });
});

describe('mockMealPrepBatch', () => {
  it('marks a heated snack batch as cook even when its label sounds handheld', () => {
    const batch: MealPrepBatchInput = {
      id: 'snack',
      label: 'Snack',
      occurrenceCount: 2,
      cookNow: [{ name: 'Scrambled eggs', totalQuantity: 4, unit: 'egg' }],
      addFresh: []
    };

    assert.equal(mockMealPrepBatch(batch).prepStyle, 'cook');
  });
});
