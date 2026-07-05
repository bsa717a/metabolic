import { CoachRelationshipStatus, PlanTier, type User } from '@prisma/client';
import { prisma } from '../db/prisma.js';

/** Minimum subscription tier required for each feature. */
export const FEATURE_KEYS = [
  'basic_food_logging',
  'basic_progress_tracking',
  'limited_dashboard',
  'meal_planning_preview',
  'intro_virtual_coach',
  'limited_ai_coach',
  'personalized_targets',
  'weekly_nutrition_plan',
  'meal_planning',
  'meal_reminders',
  'full_progress_dashboard',
  'weekly_virtual_coach',
  'basic_recipe_help',
  'restaurant_macros_guidance',
  'plan_adjustments',
  'deeper_weekly_analysis',
  'advanced_progress_reports',
  'food_pattern_detection',
  'habit_consistency_scoring',
  'stuck_analysis',
  'detailed_virtual_coach',
  'extended_ai_coach',
  'adaptive_recommendations',
  'measurement_trend_review',
  'personalized_recipe_guidance',
  'assigned_coach',
  'coach_reviewed_checkins',
  'coach_adjusted_plans',
  'coach_created_goals',
  'coach_action_items',
  'coach_notes',
  'coach_dashboard_visibility',
  'weekly_client_review',
  'food_vs_planned_review',
  'client_timeline',
  'session_notes'
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

const TIER_ORDER: Record<PlanTier, number> = {
  STARTER: 0,
  SELF_GUIDED: 1,
  PLUS: 2,
  COACH_LED: 3
};

export const FEATURE_MATRIX: Record<FeatureKey, PlanTier> = {
  basic_food_logging: PlanTier.STARTER,
  basic_progress_tracking: PlanTier.STARTER,
  limited_dashboard: PlanTier.STARTER,
  meal_planning_preview: PlanTier.STARTER,
  intro_virtual_coach: PlanTier.STARTER,
  limited_ai_coach: PlanTier.STARTER,
  personalized_targets: PlanTier.SELF_GUIDED,
  weekly_nutrition_plan: PlanTier.SELF_GUIDED,
  meal_planning: PlanTier.SELF_GUIDED,
  meal_reminders: PlanTier.SELF_GUIDED,
  full_progress_dashboard: PlanTier.SELF_GUIDED,
  weekly_virtual_coach: PlanTier.SELF_GUIDED,
  basic_recipe_help: PlanTier.SELF_GUIDED,
  restaurant_macros_guidance: PlanTier.SELF_GUIDED,
  plan_adjustments: PlanTier.SELF_GUIDED,
  deeper_weekly_analysis: PlanTier.PLUS,
  advanced_progress_reports: PlanTier.PLUS,
  food_pattern_detection: PlanTier.PLUS,
  habit_consistency_scoring: PlanTier.PLUS,
  stuck_analysis: PlanTier.PLUS,
  detailed_virtual_coach: PlanTier.PLUS,
  extended_ai_coach: PlanTier.PLUS,
  adaptive_recommendations: PlanTier.PLUS,
  measurement_trend_review: PlanTier.PLUS,
  personalized_recipe_guidance: PlanTier.PLUS,
  assigned_coach: PlanTier.COACH_LED,
  coach_reviewed_checkins: PlanTier.COACH_LED,
  coach_adjusted_plans: PlanTier.COACH_LED,
  coach_created_goals: PlanTier.COACH_LED,
  coach_action_items: PlanTier.COACH_LED,
  coach_notes: PlanTier.COACH_LED,
  coach_dashboard_visibility: PlanTier.COACH_LED,
  weekly_client_review: PlanTier.COACH_LED,
  food_vs_planned_review: PlanTier.COACH_LED,
  client_timeline: PlanTier.COACH_LED,
  session_notes: PlanTier.COACH_LED
};

const COACH_LED_FEATURES = new Set<FeatureKey>(
  FEATURE_KEYS.filter((key) => FEATURE_MATRIX[key] === PlanTier.COACH_LED)
);

export function planToSlug(plan: PlanTier): string {
  switch (plan) {
    case PlanTier.STARTER:
      return 'starter';
    case PlanTier.SELF_GUIDED:
      return 'self_guided';
    case PlanTier.PLUS:
      return 'plus';
    case PlanTier.COACH_LED:
      return 'coach_led';
  }
}

export function slugToPlan(slug: string): PlanTier | null {
  switch (slug) {
    case 'starter':
      return PlanTier.STARTER;
    case 'self_guided':
      return PlanTier.SELF_GUIDED;
    case 'plus':
      return PlanTier.PLUS;
    case 'coach_led':
      return PlanTier.COACH_LED;
    default:
      return null;
  }
}

/** Plus-level access for COACH_LED (including grace period). */
export function effectiveTier(user: Pick<User, 'plan' | 'gracePeriodEndsAt'>): PlanTier {
  if (user.plan === PlanTier.COACH_LED) {
    return PlanTier.PLUS;
  }
  return user.plan;
}

export function tierMeetsRequirement(userTier: PlanTier, requiredTier: PlanTier): boolean {
  if (requiredTier === PlanTier.COACH_LED) {
    return userTier === PlanTier.COACH_LED;
  }
  return TIER_ORDER[userTier] >= TIER_ORDER[requiredTier];
}

export function hasFeature(user: Pick<User, 'plan' | 'gracePeriodEndsAt'>, feature: FeatureKey): boolean {
  const required = FEATURE_MATRIX[feature];
  const tier = effectiveTier(user);
  if (required === PlanTier.COACH_LED) {
    return user.plan === PlanTier.COACH_LED;
  }
  return tierMeetsRequirement(tier, required);
}

export async function hasCoachLedAccess(userId: string): Promise<boolean> {
  const assignment = await prisma.coachAssignment.findFirst({
    where: {
      userId,
      status: CoachRelationshipStatus.ACTIVE,
      OR: [{ accessEndsAt: null }, { accessEndsAt: { gt: new Date() } }]
    },
    select: { id: true }
  });
  return Boolean(assignment);
}

export async function hasCoachFeature(
  user: Pick<User, 'id' | 'plan' | 'gracePeriodEndsAt'>,
  feature: FeatureKey
): Promise<boolean> {
  if (!COACH_LED_FEATURES.has(feature)) {
    return hasFeature(user, feature);
  }
  if (user.plan !== PlanTier.COACH_LED) return false;
  return hasCoachLedAccess(user.id);
}

export function getRequiredPlan(feature: FeatureKey): PlanTier {
  return FEATURE_MATRIX[feature];
}

export function getUpgradePlan(current: PlanTier, required: PlanTier): PlanTier {
  if (required === PlanTier.COACH_LED) return PlanTier.COACH_LED;
  if (current === PlanTier.STARTER && required !== PlanTier.STARTER) return PlanTier.SELF_GUIDED;
  if (TIER_ORDER[current] < TIER_ORDER[PlanTier.PLUS] && TIER_ORDER[required] >= TIER_ORDER[PlanTier.PLUS]) {
    return PlanTier.PLUS;
  }
  return required;
}
