import type { AppUser, Meal, PlanStatus } from '../types';
import { getRequiredPlan, hasFeature, planLabel } from './entitlements';

/** Query flag so the billing page can name the plan that unlocks a weekly plan. */
export const WEEKLY_PLAN_BILLING_PARAM = 'weeklyPlan';

export function weeklyPlanBillingPath() {
  return `/upgrade?${WEEKLY_PLAN_BILLING_PARAM}=1`;
}

/** Display name of the plan that actually unlocks `weekly_nutrition_plan`. */
export function weeklyPlanUnlockName() {
  return planLabel(getRequiredPlan('weekly_nutrition_plan'));
}

export function userCanRequestWeeklyPlan(
  user: Pick<AppUser, 'plan' | 'assignedCoach'> | null | undefined
) {
  if (!user?.plan) return true;
  return hasFeature(user, 'weekly_nutrition_plan');
}

export function todayHasPlannedFood(meals: Meal[] | null | undefined) {
  if (!meals?.length) return false;
  return meals.some((meal) => {
    if (Number(meal.plannedCalories) > 0) return true;
    return (meal.items ?? []).some((item) => item.type === 'PLANNED' && item.nameSnapshot.trim().length > 0);
  });
}

export function offPlanHomeCopy(state: PlanStatus['state'], hasPlannedFood: boolean) {
  if (hasPlannedFood) {
    return {
      title: 'Today has planned food',
      detail: 'Your meals for today are already planned.'
    };
  }
  return {
    title: 'You\'re tracking freely \u2014 no plan yet',
    detail:
      state === 'coached_no_plan'
        ? 'Your coach hasn\u2019t assigned a plan. You can start a matched one now.'
        : 'A weekly plan gives you built meals, portions sized to you, and a weekly check-in rhythm.'
  };
}
