import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isDinnerMeal, matchesMealSlot, mealMatchesCardSet, findCardSetForTemplateMeal } from './mealSlotMatch.js';

const structureSlots = [
  { mealNumber: 1, slotType: 'BREAKFAST' as const },
  { mealNumber: 2, slotType: 'SNACK' as const },
  { mealNumber: 3, slotType: 'LUNCH' as const },
  { mealNumber: 4, slotType: 'SNACK' as const },
  { mealNumber: 5, slotType: 'DINNER' as const }
];

const sets = [
  { slotType: 'BREAKFAST' as const, id: 'breakfast' },
  { slotType: 'SNACK' as const, id: 'snack' },
  { slotType: 'LUNCH' as const, id: 'lunch' },
  { slotType: 'DINNER' as const, id: 'dinner' }
];

describe('mealSlotMatch', () => {
  it('matches both snack slots by name', () => {
    const morningSnack = { mealNumber: 2, name: 'Snack', plannedTime: '10:30' };
    const afternoonSnack = { mealNumber: 4, name: 'Snack', plannedTime: '15:30' };
    assert.equal(matchesMealSlot(morningSnack, 'SNACK'), true);
    assert.equal(matchesMealSlot(afternoonSnack, 'SNACK'), true);
    assert.equal(mealMatchesCardSet(afternoonSnack, 'SNACK'), true);
  });

  it('does not classify morning snacks as breakfast by time', () => {
    const morningSnack = { mealNumber: 2, name: 'Snack', plannedTime: '10:30' };
    assert.equal(matchesMealSlot(morningSnack, 'BREAKFAST'), false);
    assert.equal(findCardSetForTemplateMeal(morningSnack, sets)?.id, 'snack');
  });

  it('falls back to meal structure when the template meal name is generic', () => {
    const afternoonMeal = { mealNumber: 4, name: 'Meal 4', plannedTime: '15:30' };
    assert.equal(findCardSetForTemplateMeal(afternoonMeal, sets), undefined);
    assert.equal(findCardSetForTemplateMeal(afternoonMeal, sets, structureSlots)?.id, 'snack');
  });

  it('treats dinner meals separately from snacks', () => {
    const dinner = { mealNumber: 5, name: 'Dinner', plannedTime: '18:30' };
    assert.equal(isDinnerMeal(dinner), true);
    assert.equal(matchesMealSlot(dinner, 'SNACK'), false);
    assert.equal(mealMatchesCardSet(dinner, 'DINNER'), true);
    assert.equal(mealMatchesCardSet(dinner, 'SNACK'), false);
  });
});
