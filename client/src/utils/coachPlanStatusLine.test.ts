import { describe, expect, it } from 'vitest';
import type { CoachClientPlanStatus } from '../types';
import { formatCoachExerciseLine, formatPlanStatusLine, planStatusWithExercisePlan } from './coachPlanStatusLine';

function status(partial: Partial<CoachClientPlanStatus>): CoachClientPlanStatus {
  return {
    state: 'coached_no_plan',
    mode: 'COACHED',
    calorieTarget: null,
    proteinTarget: null,
    weekNumber: null,
    effectiveDate: null,
    endDate: null,
    nextCheckInDate: null,
    planDayIndex: null,
    nutritionTemplateName: null,
    exerciseTemplateName: null,
    exercisePlanName: null,
    targetSource: null,
    resolvedTargets: null,
    overrideTargets: { calories: null, protein: null, carbs: null, fat: null },
    ...partial
  };
}

describe('formatPlanStatusLine', () => {
  it('keeps the free-tracking line when nothing is assigned', () => {
    expect(formatPlanStatusLine(status({}))).toBe('Tracking freely — no weekly plan assigned yet');
  });

  it('names the saved exercise plan and says the food plan is unassigned', () => {
    const line = formatPlanStatusLine(status({ exercisePlanName: '5 Day Split (#5)' }));
    expect(line).toBe('No food plan assigned · Exercise: 5 Day Split (#5)');
    expect(line).not.toContain('no weekly plan');
    expect(line).not.toContain('Tracking freely');
  });

  it('ignores a blank exercise plan name', () => {
    expect(formatPlanStatusLine(status({ exercisePlanName: '  ' }))).toBe(
      'Tracking freely — no weekly plan assigned yet'
    );
  });

  it('keeps the nutrition summary when a food plan is assigned', () => {
    expect(
      formatPlanStatusLine(
        status({
          state: 'on_plan',
          nutritionTemplateName: 'Balanced 1800',
          weekNumber: 2,
          planDayIndex: 4,
          calorieTarget: 1800,
          exercisePlanName: '5 Day Split (#5)'
        })
      )
    ).toBe('Balanced 1800 · Week 2 · day 4 · 1800 kcal');
  });

  it('leaves self-directed tracking unchanged', () => {
    expect(formatPlanStatusLine(status({ state: 'self_directed', mode: 'SELF_DIRECTED' }))).toBe(
      'Self-directed tracking'
    );
  });
});

describe('planStatusWithExercisePlan', () => {
  it('shows the plan that was just applied while plan-status is still stale', () => {
    const next = planStatusWithExercisePlan(status({ exercisePlanName: null }), '5 Day Split (#5)');
    expect(formatPlanStatusLine(next)).toBe('No food plan assigned · Exercise: 5 Day Split (#5)');
    expect(next?.nutritionTemplateName).toBeNull();
  });

  it('clears the exercise name when the saved routine has no plan', () => {
    const next = planStatusWithExercisePlan(status({ exercisePlanName: '5 Day Split (#5)' }), null);
    expect(formatPlanStatusLine(next)).toBe('Tracking freely — no weekly plan assigned yet');
  });

  it('leaves a missing status empty', () => {
    expect(planStatusWithExercisePlan(null, '5 Day Split (#5)')).toBeNull();
  });
});

describe('formatCoachExerciseLine', () => {
  it('does not repeat the exercise plan already named in the status line', () => {
    expect(formatCoachExerciseLine(status({ exercisePlanName: '5 Day Split (#5)' }))).toBeNull();
  });

  it('shows the exercise plan under an assigned food plan', () => {
    expect(
      formatCoachExerciseLine(
        status({
          state: 'on_plan',
          exercisePlanName: '5 Day Split (#5)',
          exerciseTemplateName: 'Core #3'
        })
      )
    ).toBe('Exercise: 5 Day Split (#5)');
  });
});
