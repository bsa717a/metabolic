import { describe, expect, it } from 'vitest';
import { buildCoachChatOpeningMessage, countMealProgress } from './coachChatGreeting';
import type { Meal } from '../../types';

function meal(status: Meal['status'], name = 'Breakfast'): Meal {
  return {
    id: name,
    mealNumber: 1,
    name,
    status,
    plannedCalories: 400,
    plannedProtein: 30,
    plannedCarbs: 40,
    plannedFat: 10,
    actualCalories: 0,
    actualProtein: 0,
    actualCarbs: 0,
    actualFat: 0,
    items: []
  };
}

describe('buildCoachChatOpeningMessage', () => {
  it('greets by first name', () => {
    expect(buildCoachChatOpeningMessage('Jake', [])).toMatch(/Hey Jake, what can I do for you\?/);
  });

  it('adds motivation when meals are logged', () => {
    const message = buildCoachChatOpeningMessage('Jake', [
      meal('EATEN_AS_PLANNED', 'Breakfast'),
      meal('PLANNED', 'Lunch')
    ]);
    expect(message).toMatch(/Hey Jake/);
    expect(message).toMatch(/Good start|momentum|crushing|on a roll|Solid progress|halfway/i);
  });

  it('celebrates a full meal day', () => {
    const message = buildCoachChatOpeningMessage('Jake', [
      meal('EATEN_AS_PLANNED', 'Breakfast'),
      meal('MODIFIED', 'Lunch')
    ]);
    expect(message).toMatch(/crushing|Full sweep|every meal/i);
  });
});

describe('countMealProgress', () => {
  it('ignores skipped meals in the denominator', () => {
    expect(countMealProgress([meal('EATEN_AS_PLANNED'), meal('SKIPPED', 'Snack')])).toEqual({
      logged: 1,
      planned: 1
    });
  });
});
