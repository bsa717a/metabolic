import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyUniqueMealNames,
  describeMealRename,
  fallbackMealNameForNumber,
  isImportedJunkMealName,
  isProperMealName,
  legacyMealName,
  legacyMealNameLocked,
  legacyMealPlannedTime,
  isImportedMealRenameClient,
  mealNameForPlannedTime,
  planImportedMealRenames,
  renameImportedMeal,
  templateClientIds,
  uniqueMealNamesForDay,
  type ImportedMealRename,
  type ImportedMealSlot
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
  assert.equal(legacyMealName({ mealnum: 5, name: 'Meal 5', time: '17:30' }, 4), 'Dinner');
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
  assert.equal(legacyMealPlannedTime({ name: '12:30 PM', time: '11:30' }), '12:30');
  assert.equal(legacyMealPlannedTime({ name: '11:30 am', time: '08:30' }), '11:30');
  assert.equal(legacyMealPlannedTime({ name: 'Breakfast', time: '13:30' }), '13:30');
  assert.equal(legacyMealName({ mealnum: 2, name: '11:30 am', time: '08:30' }, 1), 'Lunch');
  assert.equal(legacyMealName({ mealnum: 2, name: '9:30am', time: '11:30' }, 1), 'Breakfast');
});

test('renameImportedMeal names from the clock and moves an empty time', () => {
  assert.equal(fallbackMealNameForNumber(1), 'Breakfast');
  assert.equal(fallbackMealNameForNumber(5), 'Meal 5');
  assert.deepEqual(renameImportedMeal('5\'4"', 1, null), { name: 'Breakfast', plannedTime: null });
  assert.deepEqual(renameImportedMeal('5\'4"', 5, null), { name: 'Meal 5', plannedTime: null });
  assert.deepEqual(renameImportedMeal('9:30am', 2, '11:30'), { name: 'Breakfast', plannedTime: '09:30' });
  assert.deepEqual(renameImportedMeal('11:30 am', 2, '08:30'), { name: 'Lunch', plannedTime: '11:30' });
  assert.deepEqual(renameImportedMeal('12:30 PM', 2, '11:30'), { name: 'Lunch', plannedTime: '12:30' });
  assert.deepEqual(renameImportedMeal('3pm', 3, '11:30'), { name: 'Snack', plannedTime: '15:00' });
  assert.deepEqual(renameImportedMeal('3:30 pm', 3, '11:30'), { name: 'Snack', plannedTime: '15:30' });
  assert.deepEqual(renameImportedMeal('3 pm', 5, null), { name: 'Snack', plannedTime: '15:00' });
  assert.deepEqual(renameImportedMeal('6:30 PM', 6, null), { name: 'Dinner', plannedTime: '18:30' });
  assert.deepEqual(renameImportedMeal('5\'4"', 1, '08:30'), { name: 'Breakfast', plannedTime: '08:30' });
  assert.deepEqual(renameImportedMeal('5\'4"', 2, '11:30'), { name: 'Lunch', plannedTime: '11:30' });
  assert.deepEqual(renameImportedMeal('5\'4"', 3, '14:30'), { name: 'Snack', plannedTime: '14:30' });
  assert.deepEqual(renameImportedMeal('5\'4"', 4, '17:30'), { name: 'Dinner', plannedTime: '17:30' });
  assert.deepEqual(renameImportedMeal('5\'4"', 6, '15:00'), { name: 'Snack', plannedTime: '15:00' });
  assert.equal(renameImportedMeal('Breakfast', 1, null), null);
  assert.equal(renameImportedMeal('Post workout', 1, '08:30'), null);
  assert.deepEqual(renameImportedMeal('Meal 1', 1, '08:30'), { name: 'Breakfast', plannedTime: '08:30' });
  assert.deepEqual(renameImportedMeal('Meal 5', 5, '17:30'), { name: 'Dinner', plannedTime: '17:30' });
  assert.deepEqual(renameImportedMeal('Meal 3', 3, '14:30'), { name: 'Snack', plannedTime: '14:30' });
  assert.equal(renameImportedMeal('Meal 5', 5, null), null);
  assert.equal(describeMealRename('12:30 PM', 'Lunch', '12:30'), '"12:30 PM" → Lunch, time → 12:30');
  assert.equal(describeMealRename('5\'4"', 'Breakfast', null), '"5\'4\\"" → Breakfast');
});

test('importer dedupe still splits a repeated band name on a new import', () => {
  const renamed = ['7pm', '11pm'].map((name, index) => renameImportedMeal(name, index + 1, '17:30'));
  assert.deepEqual(renamed, [
    { name: 'Dinner', plannedTime: '19:00' },
    { name: 'Dinner', plannedTime: '23:00' }
  ]);
  const day = uniqueMealNamesForDay([
    { mealNumber: 1, name: 'Dinner', plannedTime: '19:00' },
    { mealNumber: 2, name: 'Dinner', plannedTime: '23:00' }
  ]);
  assert.deepEqual(day.map((meal) => meal.name), ['Dinner', 'Late snack']);

  const lunches = uniqueMealNamesForDay([
    { mealNumber: 2, name: 'Lunch', plannedTime: '12:30' },
    { mealNumber: 1, name: 'Lunch', plannedTime: '11:30' }
  ]);
  assert.deepEqual(
    [...lunches].sort((a, b) => a.mealNumber - b.mealNumber).map((meal) => meal.name),
    ['Lunch', 'Late lunch']
  );
});

test('proper names stay, and a Meal N yields when it would repeat one', () => {
  assert.equal(isProperMealName('Breakfast'), true);
  assert.equal(isProperMealName('Post workout'), true);
  assert.equal(isProperMealName('Meal 5'), false);
  assert.equal(isProperMealName('5\'4"'), false);
  assert.equal(isProperMealName('7pm'), false);

  const breakfasts = uniqueMealNamesForDay(
    [1, 2, 3, 4, 5].map((mealNumber) => ({
      mealNumber,
      name: 'Breakfast',
      plannedTime: '08:30',
      locked: true
    }))
  );
  assert.deepEqual(breakfasts.map((meal) => meal.name), ['Breakfast', 'Breakfast', 'Breakfast', 'Breakfast', 'Breakfast']);

  const withPlaceholder = uniqueMealNamesForDay([
    ...[1, 2, 3, 4, 5].map((mealNumber) => ({
      mealNumber,
      name: 'Breakfast',
      plannedTime: '08:30',
      locked: true
    })),
    { mealNumber: 6, name: 'Breakfast', plannedTime: '09:00', locked: false }
  ]);
  assert.deepEqual(withPlaceholder.map((meal) => meal.name), [
    'Breakfast',
    'Breakfast',
    'Breakfast',
    'Breakfast',
    'Breakfast',
    'Late breakfast'
  ]);

  const dinner = uniqueMealNamesForDay([
    { mealNumber: 5, name: 'Dinner', plannedTime: '17:30', locked: false },
    { mealNumber: 1, name: 'Dinner', plannedTime: '19:00', locked: true }
  ]);
  assert.deepEqual(dinner.map((meal) => meal.name), ['Late snack', 'Dinner']);

  const lunch = uniqueMealNamesForDay([
    { mealNumber: 2, name: 'Lunch', plannedTime: '12:00', locked: true },
    { mealNumber: 6, name: 'Lunch', plannedTime: '12:30', locked: false }
  ]);
  assert.deepEqual(lunch.map((meal) => meal.name), ['Lunch', 'Late lunch']);
});

test('a real label next to a clock or height stays Breakfast', () => {
  const labeled = { name: '12:30 PM', meal_name: 'Breakfast', time: '12:30' };
  const titled = { name: "5'4\"", title: 'Breakfast', time: '08:30' };
  const clockOnly = { name: '9:30am', time: '' };
  assert.equal(legacyMealNameLocked(labeled), true);
  assert.equal(legacyMealNameLocked(titled), true);
  assert.equal(legacyMealNameLocked(clockOnly), false);
  assert.equal(legacyMealNameLocked({ name: 'Meal 5', time: '08:30' }), false);
  assert.equal(legacyMealNameLocked({ name: "5'4\"" }), false);

  const day = applyUniqueMealNames(
    [
      { mealNumber: 1, name: legacyMealName(labeled, 0), plannedTime: legacyMealPlannedTime(labeled) },
      { mealNumber: 2, name: legacyMealName(titled, 1), plannedTime: legacyMealPlannedTime(titled) },
      { mealNumber: 3, name: legacyMealName(clockOnly, 2), plannedTime: legacyMealPlannedTime(clockOnly) }
    ],
    [legacyMealNameLocked(labeled), legacyMealNameLocked(titled), legacyMealNameLocked(clockOnly)]
  );
  assert.deepEqual(day.map((meal) => meal.name), ['Breakfast', 'Breakfast', 'Late breakfast']);
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

function slot(id: string, name: string, mealNumber: number, plannedTime: string | null): ImportedMealSlot {
  return { id, name, mealNumber, plannedTime };
}

function assertCleanRenames(meals: ImportedMealSlot[], changes: ImportedMealRename[]) {
  const byId = new Map(changes.map((change) => [change.id, change.to]));
  const finals = meals.map((meal) => byId.get(meal.id) ?? meal.name);
  for (const change of changes) {
    assert.equal(/late/i.test(change.to), false, change.to);
    assert.ok(['Breakfast', 'Lunch', 'Snack', 'Dinner'].includes(change.to), change.to);
    const key = change.to.trim().toLowerCase();
    assert.equal(
      finals.filter((name) => name.trim().toLowerCase() === key).length,
      1,
      change.to
    );
  }
}

test('a day or plan with no height or clock is untouched', () => {
  const meals = [
    slot('a', 'Breakfast', 1, '08:30'),
    slot('b', 'Meal 2', 2, '12:00'),
    slot('c', 'Meal 3', 3, '17:30'),
    slot('d', 'Post workout', 4, '15:00')
  ];
  assert.deepEqual(planImportedMealRenames(meals), []);
});

test('a day with a height or a clock renames Meal N from its time', () => {
  const withHeight = [
    slot('h', '5\'4"', 1, '08:30'),
    slot('m', 'Meal 5', 5, '17:30')
  ];
  const heightChanges = planImportedMealRenames(withHeight);
  assert.deepEqual(heightChanges, [
    { id: 'h', from: '5\'4"', to: 'Breakfast', plannedTime: null },
    { id: 'm', from: 'Meal 5', to: 'Dinner', plannedTime: null }
  ]);
  assertCleanRenames(withHeight, heightChanges);

  const withClock = [
    slot('c', '12:30 PM', 2, '11:30'),
    slot('m', 'Meal 3', 3, '14:30')
  ];
  const clockChanges = planImportedMealRenames(withClock);
  assert.deepEqual(clockChanges, [
    { id: 'c', from: '12:30 PM', to: 'Lunch', plannedTime: '12:30' },
    { id: 'm', from: 'Meal 3', to: 'Snack', plannedTime: null }
  ]);
  assertCleanRenames(withClock, clockChanges);

  assert.deepEqual(planImportedMealRenames([slot('c', '9:30am', 2, '11:30')]), [
    { id: 'c', from: '9:30am', to: 'Breakfast', plannedTime: '09:30' }
  ]);
  assert.deepEqual(planImportedMealRenames([slot('c', '3:30 pm', 3, '11:30')]), [
    { id: 'c', from: '3:30 pm', to: 'Snack', plannedTime: '15:30' }
  ]);
  assert.deepEqual(planImportedMealRenames([slot('h', '5\'4"', 1, null)]), []);
});

test('04:30 stays a placeholder rather than Dinner', () => {
  const meals = [
    slot('h', '5\'4"', 1, '12:00'),
    slot('m', 'Meal 2', 2, '04:30'),
    slot('c', '4:30 AM', 3, '08:30')
  ];
  const changes = planImportedMealRenames(meals);
  assert.deepEqual(changes, [{ id: 'h', from: '5\'4"', to: 'Lunch', plannedTime: null }]);
  assertCleanRenames(meals, changes);
  assert.equal(
    changes.some((change) => change.to === 'Dinner' || /late/i.test(change.to)),
    false
  );
  assert.deepEqual(planImportedMealRenames([slot('c', '04:30', 1, '04:30')]), []);
  assert.deepEqual(planImportedMealRenames([slot('c', '12:00 AM', 1, null)]), []);
  assert.deepEqual(planImportedMealRenames([slot('c', '17:00', 1, null)]), [
    { id: 'c', from: '17:00', to: 'Dinner', plannedTime: '17:00' }
  ]);
  assert.deepEqual(planImportedMealRenames([slot('c', '11:59 PM', 1, null)]), [
    { id: 'c', from: '11:59 PM', to: 'Dinner', plannedTime: '23:59' }
  ]);
});

test('9:30am stays 9:30am when Breakfast is already on the day', () => {
  const meals = [
    slot('b', 'Breakfast', 1, '08:00'),
    slot('c', '9:30am', 2, '11:30'),
    slot('m', 'Meal 3', 3, '09:00')
  ];
  const changes = planImportedMealRenames(meals);
  assert.deepEqual(changes, []);
  assert.equal(changes.some((change) => /late/i.test(change.to)), false);
});

test('a repeated evening clock does not become Late snack or Late snack 2', () => {
  const meals = [
    slot('late', '11pm', 2, '17:30'),
    slot('early', '7pm', 1, '17:30'),
    slot('m', 'Meal 4', 4, '21:00'),
    slot('third', '6:30 PM', 5, '17:30')
  ];
  const changes = planImportedMealRenames(meals);
  assert.deepEqual(changes, [{ id: 'third', from: '6:30 PM', to: 'Dinner', plannedTime: '18:30' }]);
  assertCleanRenames(meals, changes);
  assert.equal(JSON.stringify(changes).includes('Late'), false);
});

test('a rename does not create a case-insensitive duplicate', () => {
  const meals = [
    slot('p', 'breakfast', 1, '08:00'),
    slot('c', '9:30am', 2, '11:30'),
    slot('s', 'SNACK', 3, '15:00'),
    slot('m', 'Meal 4', 4, '15:30'),
    slot('h', '5\'4"', 5, '12:30')
  ];
  const changes = planImportedMealRenames(meals);
  assert.deepEqual(changes, [{ id: 'h', from: '5\'4"', to: 'Lunch', plannedTime: null }]);
  assertCleanRenames(meals, changes);

  const sameBand = [
    slot('b', '3:30 pm', 2, '14:30'),
    slot('a', '3pm', 1, '11:30')
  ];
  const bandChanges = planImportedMealRenames(sameBand);
  assert.deepEqual(bandChanges, [{ id: 'a', from: '3pm', to: 'Snack', plannedTime: '15:00' }]);
  assertCleanRenames(sameBand, bandChanges);
});

test('proper names stay, including repeated Breakfasts', () => {
  const meals = [1, 2, 3, 4, 5].map((mealNumber) => slot(`b${mealNumber}`, 'Breakfast', mealNumber, '08:30'));
  meals.push(slot('h', '5\'4"', 6, '12:00'));
  meals.push(slot('p', 'Post workout', 7, '15:00'));
  const changes = planImportedMealRenames(meals);
  assert.deepEqual(changes, [{ id: 'h', from: '5\'4"', to: 'Lunch', plannedTime: null }]);
  assertCleanRenames(meals, changes);
});

test('a coach or staff account is excluded from the imported meal rename', () => {
  assert.equal(isImportedMealRenameClient('USER'), true);
  for (const role of ['COACH', 'ADMIN', 'SUPER_ADMIN', 'VIEWER']) {
    assert.equal(isImportedMealRenameClient(role), false, role);
  }
});
