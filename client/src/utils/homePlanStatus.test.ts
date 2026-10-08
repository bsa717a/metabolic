import { describe, expect, it } from 'vitest';
import type { Meal } from '../types';
import { getRequiredPlan, planLabel } from './entitlements';
import {
  offPlanHomeCopy,
  todayHasPlannedFood,
  userCanRequestWeeklyPlan,
  weeklyPlanBillingPath,
  weeklyPlanUnlockName
} from './homePlanStatus';

function meal(overrides: Partial<Meal> = {}): Meal {
  return {
    id: 'meal-1',
    mealNumber: 1,
    name: 'Breakfast',
    status: 'PLANNED',
    plannedCalories: 0,
    plannedProtein: 0,
    plannedCarbs: 0,
    plannedFat: 0,
    actualCalories: 0,
    actualProtein: 0,
    actualCarbs: 0,
    actualFat: 0,
    items: [],
    ...overrides
  };
}

describe('todayHasPlannedFood', () => {
  it('is false when today has no meals or only empty slots', () => {
    expect(todayHasPlannedFood(undefined)).toBe(false);
    expect(todayHasPlannedFood([])).toBe(false);
    expect(todayHasPlannedFood([meal()])).toBe(false);
  });

  it('is true when a meal has a planned calorie target', () => {
    expect(todayHasPlannedFood([meal({ plannedCalories: 450 })])).toBe(true);
  });

  it('is true when a meal has a named planned food', () => {
    expect(
      todayHasPlannedFood([
        meal({
          items: [
            {
              id: 'item-1',
              type: 'PLANNED',
              nameSnapshot: 'Eggs',
              quantity: 2,
              unit: 'each',
              calories: 0,
              protein: 0,
              carbs: 0,
              fat: 0
            }
          ]
        })
      ])
    ).toBe(true);
  });
});

describe('offPlanHomeCopy', () => {
  it('says today has planned food instead of no plan', () => {
    const copy = offPlanHomeCopy('coached_no_plan', true);
    expect(copy.title).toBe('Today has planned food');
    expect(copy.detail).toBe('Your meals for today are already planned.');
    expect(`${copy.title} ${copy.detail}`.toLowerCase()).not.toContain('no plan');
    expect(copy.detail).not.toContain('hasn\u2019t assigned');
  });

  it('keeps the no-plan copy when nothing is planned today', () => {
    expect(offPlanHomeCopy('coached_no_plan', false).title).toContain('no plan yet');
    expect(offPlanHomeCopy('coached_no_plan', false).detail).toContain('hasn\u2019t assigned a plan');
    expect(offPlanHomeCopy('self_directed', false).detail).toContain('weekly plan');
  });
});

describe('weekly plan billing', () => {
  it('names the plan from the entitlements matrix and opens billing', () => {
    expect(getRequiredPlan('weekly_nutrition_plan')).toBe('self_guided');
    expect(weeklyPlanUnlockName()).toBe(planLabel('self_guided'));
    expect(weeklyPlanUnlockName()).toBe('Self-Guided Metabolic');
    expect(weeklyPlanBillingPath()).toBe('/upgrade?weeklyPlan=1');
  });

  it('sends starter members to billing and lets self-guided members request a plan', () => {
    expect(userCanRequestWeeklyPlan({ plan: 'starter', assignedCoach: null })).toBe(false);
    expect(userCanRequestWeeklyPlan({ plan: 'self_guided', assignedCoach: null })).toBe(true);
    expect(userCanRequestWeeklyPlan({ plan: 'plus', assignedCoach: null })).toBe(true);
    expect(userCanRequestWeeklyPlan(null)).toBe(true);
  });
});
