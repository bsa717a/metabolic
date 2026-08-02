import type { BadgeCategory, BadgeTier } from '@prisma/client';

export type LevelRequirement =
  | { type: 'review_meal_plan' }
  | { type: 'log_all_planned_meals' }
  | { type: 'log_outside_plan' }
  | { type: 'complete_daily_food_log' }
  | { type: 'enter_starting_weight' }
  | { type: 'enter_core_measurements' }
  | { type: 'upload_progress_photo'; pose: 'front' | 'side' | 'back' }
  | { type: 'save_baseline_snapshot' }
  | { type: 'food_log_days'; count: number }
  | { type: 'log_different_meal' }
  | { type: 'daily_check_in' }
  | { type: 'second_snapshot_complete' }
  | { type: 'view_comparison' }
  | { type: 'weekly_snapshot_weeks'; count: number }
  | { type: 'food_log_days_in_week'; count: number }
  | { type: 'weekly_reflection' }
  | { type: 'review_two_week_comparison' }
  | { type: 'review_meal_consistency' }
  | { type: 'select_focus_goal' }
  | { type: 'food_log_days_in_14'; count: number }
  | { type: 'weekly_snapshots_count'; count: number }
  | { type: 'complete_focus_goal' }
  | { type: 'review_progress_timeline' }
  | { type: 'complete_guided_discovery'; discoveryId: string };

export type LevelDef = {
  id: string;
  name: string;
  description: string;
  purpose: string;
  order: number;
  requirements: LevelRequirement[];
  unlocks: string[];
  completionMessage: string;
  badgeIds: string[];
};

export type BadgeDef = {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: BadgeCategory;
  requirementType: string;
  requirementThreshold: number;
  tier?: BadgeTier;
};

export const LEVEL_DEFINITIONS: LevelDef[] = [
  {
    id: 'level-1',
    name: 'Becoming Aware',
    description:
      'Begin to understand and listen to your body without judgment. Complete the guided Observe Hunger discovery.',
    purpose: 'I am beginning to understand and listen to my body without judgment.',
    order: 1,
    requirements: [{ type: 'complete_guided_discovery', discoveryId: 'observe-hunger' }],
    unlocks: ['Level 2', 'Hunger Awareness skill'],
    completionMessage:
      'You practiced noticing without judging. Awareness is the first step toward understanding what your body needs.',
    badgeIds: []
  },
  {
    id: 'level-2',
    name: 'Capture Your Baseline',
    description: 'Create your starting point so you can see how your body changes over time.',
    purpose: 'Teach the user how to create a starting snapshot.',
    order: 2,
    requirements: [
      { type: 'enter_starting_weight' },
      { type: 'enter_core_measurements' },
      { type: 'upload_progress_photo', pose: 'front' },
      { type: 'upload_progress_photo', pose: 'side' },
      { type: 'upload_progress_photo', pose: 'back' },
      { type: 'save_baseline_snapshot' }
    ],
    unlocks: ['Baseline snapshot', 'Progress comparison screen', 'Level 3'],
    completionMessage:
      'Your baseline is saved. This gives you a starting point so you can see progress that may not always show up on the scale.',
    badgeIds: ['baseline-captured']
  },
  {
    id: 'level-3',
    name: 'Build a Routine',
    description: 'Practice consistent and honest food logging.',
    purpose: 'Help the user practice consistent and honest food logging.',
    order: 3,
    requirements: [
      { type: 'food_log_days', count: 3 },
      { type: 'log_different_meal' },
      { type: 'daily_check_in' }
    ],
    unlocks: ['7-day consistency view', 'Basic meal adherence insights', 'Level 4'],
    completionMessage:
      'You are building the habit. Consistent and honest tracking gives you better insights than perfect tracking for a few days.',
    badgeIds: ['getting-consistent']
  },
  {
    id: 'level-4',
    name: 'Add Your Second Snapshot',
    description: 'Learn how progress snapshots work over time.',
    purpose: 'Teach the user how progress snapshots work.',
    order: 4,
    requirements: [
      { type: 'second_snapshot_complete' },
      { type: 'view_comparison' }
    ],
    unlocks: ['Progress timeline', 'Measurement trend view', 'Level 5'],
    completionMessage:
      'You completed your first comparison. Progress is more than a single number, and now you can start seeing the full picture.',
    badgeIds: ['first-comparison']
  },
  {
    id: 'level-5',
    name: 'Build Momentum',
    description: 'Reinforce consistency across multiple weeks.',
    purpose: 'Reinforce consistency across multiple weeks.',
    order: 5,
    requirements: [
      { type: 'weekly_snapshot_weeks', count: 2 },
      { type: 'food_log_days_in_week', count: 5 },
      { type: 'weekly_reflection' }
    ],
    unlocks: ['Extended data tracking', 'Deeper insights', 'Level 6'],
    completionMessage:
      'You are building real momentum. Small actions repeated consistently are what create lasting results.',
    badgeIds: ['momentum-builder']
  },
  {
    id: 'level-6',
    name: 'Understand Your Patterns',
    description: 'Learn from your data and choose a focus for next week.',
    purpose: 'Help the user learn from their data.',
    order: 6,
    requirements: [
      { type: 'review_two_week_comparison' },
      { type: 'review_meal_consistency' },
      { type: 'select_focus_goal' }
    ],
    unlocks: ['Personalized weekly focus goal', 'Weekly insight cards', 'Level 7'],
    completionMessage: 'You are no longer just collecting data. You are using it to make better decisions.',
    badgeIds: ['pattern-finder']
  },
  {
    id: 'level-7',
    name: 'Metabolic Momentum',
    description: 'Establish sustainable habits for long-term success.',
    purpose: 'Help the user establish sustainable habits.',
    order: 7,
    requirements: [
      { type: 'food_log_days_in_14', count: 10 },
      { type: 'weekly_snapshots_count', count: 3 },
      { type: 'complete_focus_goal' },
      { type: 'review_progress_timeline' }
    ],
    unlocks: ['Advanced insights', 'Custom goals', 'Extended trend views'],
    completionMessage:
      'You have built a strong foundation. You now have the habits and data needed to keep improving.',
    badgeIds: ['metabolic-momentum']
  }
];

export const BADGE_DEFINITIONS: BadgeDef[] = [
  { id: 'first-step', name: 'First Step', description: 'Complete the first logged meal.', icon: 'footprints', category: 'GETTING_STARTED', requirementType: 'meals_logged', requirementThreshold: 1 },
  { id: 'first-day-complete', name: 'First Day Complete', description: 'Complete a full day of food logging.', icon: 'calendar-check', category: 'GETTING_STARTED', requirementType: 'daily_food_logs_complete', requirementThreshold: 1 },
  { id: 'baseline-captured', name: 'Baseline Captured', description: 'Save starting measurements and progress photos.', icon: 'camera', category: 'GETTING_STARTED', requirementType: 'baseline_snapshot', requirementThreshold: 1 },
  { id: 'first-comparison', name: 'First Comparison', description: 'Complete the second progress snapshot and view the comparison.', icon: 'columns-2', category: 'GETTING_STARTED', requirementType: 'snapshots_complete', requirementThreshold: 2 },
  { id: 'three-day-momentum', name: 'Three-Day Momentum', description: 'Log food for 3 consecutive days.', icon: 'flame', category: 'CONSISTENCY', requirementType: 'food_logging_streak', requirementThreshold: 3 },
  { id: 'seven-day-momentum', name: 'Seven-Day Momentum', description: 'Log food for 7 consecutive days.', icon: 'flame', category: 'CONSISTENCY', requirementType: 'food_logging_streak', requirementThreshold: 7 },
  { id: 'week-one-complete', name: 'Week One Complete', description: 'Complete food logging on at least 5 days in one week.', icon: 'calendar-range', category: 'CONSISTENCY', requirementType: 'food_log_days_in_week', requirementThreshold: 5 },
  { id: 'momentum-builder', name: 'Momentum Builder', description: 'Complete measurements and photos for 2 consecutive weeks.', icon: 'trending-up', category: 'CONSISTENCY', requirementType: 'weekly_snapshot_streak', requirementThreshold: 2 },
  { id: 'four-week-foundation', name: 'Four-Week Foundation', description: 'Complete a full progress snapshot for 4 consecutive weeks.', icon: 'layers', category: 'CONSISTENCY', requirementType: 'weekly_snapshot_streak', requirementThreshold: 4 },
  { id: 'consistency-over-perfection', name: 'Consistency Over Perfection', description: 'Log meals honestly for 14 days.', icon: 'heart-handshake', category: 'CONSISTENCY', requirementType: 'honest_log_days', requirementThreshold: 14 },
  { id: 'honest-tracker', name: 'Honest Tracker', description: 'Log the first meal that was different from the meal plan.', icon: 'pen-line', category: 'HONEST_TRACKING', requirementType: 'different_meals_logged', requirementThreshold: 1 },
  { id: 'real-life-logged', name: 'Real Life Logged', description: 'Log 5 meals that were different from the original plan.', icon: 'notebook-pen', category: 'HONEST_TRACKING', requirementType: 'different_meals_logged', requirementThreshold: 5 },
  { id: 'back-on-track', name: 'Back on Track', description: 'Return and complete a Daily Win after missing several days.', icon: 'refresh-cw', category: 'HONEST_TRACKING', requirementType: 'recovery_daily_win', requirementThreshold: 1 },
  { id: 'snapshot-taken', name: 'Snapshot Taken', description: 'Upload the first complete progress photo set.', icon: 'image', category: 'PROGRESS', requirementType: 'snapshots_complete', requirementThreshold: 1 },
  { id: 'two-week-snapshot-streak', name: 'Two-Week Snapshot Streak', description: 'Complete measurements and progress photos for 2 consecutive weeks.', icon: 'camera', category: 'PROGRESS', requirementType: 'weekly_snapshot_streak', requirementThreshold: 2 },
  { id: 'measurement-streak', name: 'Measurement Streak', description: 'Complete measurements for 3 consecutive weeks.', icon: 'ruler', category: 'PROGRESS', requirementType: 'weekly_measurement_streak', requirementThreshold: 3 },
  { id: 'progress-in-focus', name: 'Progress in Focus', description: 'Complete 4 photo snapshots.', icon: 'focus', category: 'PROGRESS', requirementType: 'snapshots_complete', requirementThreshold: 4 },
  { id: 'pattern-finder', name: 'Pattern Finder', description: 'Choose the first personalized focus goal after reviewing progress data.', icon: 'search', category: 'PROGRESS', requirementType: 'focus_goal_selected', requirementThreshold: 1 },
  { id: 'getting-consistent', name: 'Getting Consistent', description: 'Build a routine with honest food logging.', icon: 'repeat', category: 'CONSISTENCY', requirementType: 'food_log_days', requirementThreshold: 3 },
  { id: 'metabolic-momentum', name: 'Metabolic Momentum', description: 'Establish sustainable habits across the program.', icon: 'sparkles', category: 'CONSISTENCY', requirementType: 'level_completed', requirementThreshold: 7 },
  { id: 'hydration-hero-bronze', name: 'Hydration Hero', description: 'Hit the water target 5 times.', icon: 'droplets', category: 'HABIT', requirementType: 'water_goal_days', requirementThreshold: 5, tier: 'BRONZE' },
  { id: 'hydration-hero-silver', name: 'Hydration Hero', description: 'Hit the water target 15 times.', icon: 'droplets', category: 'HABIT', requirementType: 'water_goal_days', requirementThreshold: 15, tier: 'SILVER' },
  { id: 'hydration-hero-gold', name: 'Hydration Hero', description: 'Hit the water target 30 times.', icon: 'droplets', category: 'HABIT', requirementType: 'water_goal_days', requirementThreshold: 30, tier: 'GOLD' },
  { id: 'daily-check-in-streak', name: 'Daily Check-In Streak', description: 'Complete 7 consecutive daily reflections.', icon: 'clipboard-list', category: 'HABIT', requirementType: 'daily_check_in_streak', requirementThreshold: 7 }
];

export const STREAK_GRACE_CONFIG: Partial<Record<string, { graceDaysAvailable: number; allowGrace: boolean }>> = {
  FOOD_LOGGING_DAILY: { graceDaysAvailable: 2, allowGrace: true },
  DAILY_WIN: { graceDaysAvailable: 2, allowGrace: true },
  WATER_GOAL_DAILY: { graceDaysAvailable: 1, allowGrace: true },
  DAILY_CHECK_IN: { graceDaysAvailable: 1, allowGrace: true },
  WEEKLY_SNAPSHOT: { graceDaysAvailable: 0, allowGrace: false },
  WEEKLY_MEASUREMENTS: { graceDaysAvailable: 0, allowGrace: false },
  WEEKLY_PHOTOS: { graceDaysAvailable: 0, allowGrace: false }
};

/** Matches program metric snapshot types (Program page tracking). */
export const CORE_MEASUREMENT_METRIC_TYPES = ['WAIST', 'HIPS', 'CHEST'] as const;

export const FOCUS_GOAL_OPTIONS = [
  'Log every meal',
  'Drink more water',
  'Reduce unplanned snacks',
  'Prepare lunch in advance',
  'Eat breakfast consistently',
  'Improve protein intake',
  'Improve sleep consistency',
  'Complete daily movement goal'
] as const;
