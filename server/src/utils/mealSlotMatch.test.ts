import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isDinnerMeal, matchesMealSlot, mealMatchesCardSet, findCardSetForTemplateMeal } from './mealSlotMatch.js';

describe('mealSlotMatch', () => {
  it('matches both snack slots by name', () => {
    const morningSnack = { name: 'Snack', plannedTime: '10:30' };
    const afternoonSnack = { name: 'Snack', plannedTime: '15:30' };
    assert.equal(matchesMealSlot(morningSnack, 'SNACK'), true);
    assert.equal(matchesMealSlot(afternoonSnack, 'SNACK'), true);
    assert.equal(mealMatchesCardSet(afternoonSnack, 'SNACK'), true);
  });

  it('does not classify morning snacks as breakfast by time', () => {
    const morningSnack = { name: 'Snack', plannedTime: '10:30' };
    assert.equal(matchesMealSlot(morningSnack, 'BREAKFAST'), false);
    assert.equal(
      findCardSetForTemplateMeal(morningSnack, [
        { slotType: 'BREAKFAST' as const, id: 'breakfast' },
        { slotType: 'SNACK' as const, id: 'snack' }
      ])?.id,
      'snack'
    );
  });

  it('treats dinner meals separately from snacks', () => {
    const dinner = { name: 'Dinner', plannedTime: '18:30' };
    assert.equal(isDinnerMeal(dinner), true);
    assert.equal(matchesMealSlot(dinner, 'SNACK'), false);
    assert.equal(mealMatchesCardSet(dinner, 'DINNER'), true);
    assert.equal(mealMatchesCardSet(dinner, 'SNACK'), false);
  });
});
