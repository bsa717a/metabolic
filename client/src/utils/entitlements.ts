import type { AppUser, PlanSlug } from '../types';

export type FeatureKey =
  | 'basic_food_logging'
  | 'basic_progress_tracking'
  | 'limited_dashboard'
  | 'meal_planning_preview'
  | 'intro_virtual_coach'
  | 'limited_ai_coach'
  | 'personalized_targets'
  | 'weekly_nutrition_plan'
  | 'meal_planning'
  | 'meal_reminders'
  | 'full_progress_dashboard'
  | 'weekly_virtual_coach'
  | 'basic_recipe_help'
  | 'restaurant_macros_guidance'
  | 'plan_adjustments'
  | 'deeper_weekly_analysis'
  | 'advanced_progress_reports'
  | 'food_pattern_detection'
  | 'habit_consistency_scoring'
  | 'stuck_analysis'
  | 'detailed_virtual_coach'
  | 'extended_ai_coach'
  | 'adaptive_recommendations'
  | 'measurement_trend_review'
  | 'personalized_recipe_guidance'
  | 'assigned_coach'
  | 'coach_reviewed_checkins'
  | 'coach_adjusted_plans'
  | 'coach_created_goals'
  | 'coach_action_items'
  | 'coach_notes'
  | 'coach_dashboard_visibility'
  | 'weekly_client_review'
  | 'food_vs_planned_review'
  | 'client_timeline'
  | 'session_notes';

const TIER_ORDER: Record<PlanSlug, number> = {
  starter: 0,
  self_guided: 1,
  plus: 2,
  coach_led: 3
};

export const FEATURE_MATRIX: Record<FeatureKey, PlanSlug> = {
  basic_food_logging: 'starter',
  basic_progress_tracking: 'starter',
  limited_dashboard: 'starter',
  meal_planning_preview: 'starter',
  intro_virtual_coach: 'starter',
  limited_ai_coach: 'starter',
  personalized_targets: 'self_guided',
  weekly_nutrition_plan: 'self_guided',
  meal_planning: 'self_guided',
  meal_reminders: 'self_guided',
  full_progress_dashboard: 'self_guided',
  weekly_virtual_coach: 'self_guided',
  basic_recipe_help: 'self_guided',
  restaurant_macros_guidance: 'self_guided',
  plan_adjustments: 'self_guided',
  deeper_weekly_analysis: 'plus',
  advanced_progress_reports: 'plus',
  food_pattern_detection: 'plus',
  habit_consistency_scoring: 'plus',
  stuck_analysis: 'plus',
  detailed_virtual_coach: 'plus',
  extended_ai_coach: 'plus',
  adaptive_recommendations: 'plus',
  measurement_trend_review: 'plus',
  personalized_recipe_guidance: 'plus',
  assigned_coach: 'coach_led',
  coach_reviewed_checkins: 'coach_led',
  coach_adjusted_plans: 'coach_led',
  coach_created_goals: 'coach_led',
  coach_action_items: 'coach_led',
  coach_notes: 'coach_led',
  coach_dashboard_visibility: 'coach_led',
  weekly_client_review: 'coach_led',
  food_vs_planned_review: 'coach_led',
  client_timeline: 'coach_led',
  session_notes: 'coach_led'
};

export function effectiveTier(user: Pick<AppUser, 'plan'>): PlanSlug {
  if (user.plan === 'coach_led') return 'plus';
  return user.plan ?? 'starter';
}

function tierMeetsRequirement(userTier: PlanSlug, requiredTier: PlanSlug): boolean {
  if (requiredTier === 'coach_led') return userTier === 'coach_led';
  return TIER_ORDER[userTier] >= TIER_ORDER[requiredTier];
}

export function hasFeature(user: Pick<AppUser, 'plan' | 'assignedCoach'>, feature: FeatureKey): boolean {
  const required = FEATURE_MATRIX[feature];
  const tier = effectiveTier(user);
  if (required === 'coach_led') {
    return user.plan === 'coach_led' && Boolean(user.assignedCoach);
  }
  return tierMeetsRequirement(tier, required);
}

export function getRequiredPlan(feature: FeatureKey): PlanSlug {
  return FEATURE_MATRIX[feature];
}

export function getUpgradePlan(current: PlanSlug, required: PlanSlug): PlanSlug {
  if (required === 'coach_led') return 'coach_led';
  if (current === 'starter' && required !== 'starter') return 'self_guided';
  if (TIER_ORDER[current] < TIER_ORDER.plus && TIER_ORDER[required] >= TIER_ORDER.plus) return 'plus';
  return required;
}

export function planLabel(plan: PlanSlug): string {
  switch (plan) {
    case 'starter':
      return 'Starter';
    case 'self_guided':
      return 'Self-Guided Metabolic';
    case 'plus':
      return 'Metabolic Plus';
    case 'coach_led':
      return 'Coach-Led';
  }
}

export function planPriceLabel(plan: PlanSlug): string | null {
  switch (plan) {
    case 'starter':
      return 'Free';
    case 'self_guided':
      return '$19/month';
    case 'plus':
      return '$59/month';
    case 'coach_led':
      return null;
  }
}
