import type { CoachClientPlanStatus } from '../types';

/**
 * Header under the client name. Nutrition state still comes from plan-status.
 * A saved exercise plan must not be described as "no plan assigned".
 */
export function formatPlanStatusLine(planStatus: CoachClientPlanStatus | null): string | null {
  if (!planStatus) return null;
  if (planStatus.state === 'on_plan') {
    const parts = [
      planStatus.nutritionTemplateName ?? 'Weekly plan',
      planStatus.weekNumber != null ? `Week ${planStatus.weekNumber}` : null,
      planStatus.planDayIndex != null ? `day ${planStatus.planDayIndex}` : null,
      planStatus.calorieTarget != null ? `${planStatus.calorieTarget} kcal` : null
    ].filter(Boolean);
    return parts.join(' · ');
  }
  if (planStatus.state === 'coached_no_plan') {
    const exercisePlan = planStatus.exercisePlanName?.trim();
    if (exercisePlan) return `No food plan assigned · Exercise: ${exercisePlan}`;
    return 'Tracking freely — no weekly plan assigned yet';
  }
  return 'Self-directed tracking';
}

/** Secondary exercise line. Omitted when the status line already names the exercise plan. */
export function formatCoachExerciseLine(planStatus: CoachClientPlanStatus | null): string | null {
  const exercisePlan = planStatus?.exercisePlanName?.trim() || '';
  if (exercisePlan && planStatus?.state === 'coached_no_plan') return null;
  const name = exercisePlan || planStatus?.exerciseTemplateName?.trim() || '';
  return name ? `Exercise: ${name}` : null;
}
