import type { GamificationDashboard } from '../../types/gamification';

const DEMO_LEVEL: NonNullable<GamificationDashboard['currentLevel']> = {
  id: 'level-1',
  number: 1,
  name: 'Log Your First Day',
  description: 'Learn the basics of daily tracking.',
  purpose: 'Build your first logging habit.',
  progressPercent: 40,
  tasks: [
    { key: 'log-meal', label: 'Log your first meal', complete: false },
    { key: 'log-water', label: 'Log water intake', complete: false }
  ],
  nextAction: 'Log a meal',
  nextUnlock: 'Level 2 preview',
  ctaLabel: 'Continue',
  ctaPath: '/level-up'
};

const DEMO_DASHBOARD: GamificationDashboard = {
  currentLevel: DEMO_LEVEL,
  momentum: {
    foodLoggingStreak: 7,
    foodLoggingBest: 7,
    snapshotStreak: 0,
    waterGoalStreak: 5,
    dailyWinsThisWeek: 3,
    graceDaysAvailable: 2,
    graceDaysUsed: 0,
    nextMilestone: 'Seven-Day Momentum'
  },
  hydration: {
    targetOz: 64,
    actualOz: 42,
    fillFraction: 0.65,
    goalMet: false,
    currentStreak: 5
  },
  recentBadges: [
    {
      id: 'seven-day-momentum',
      name: 'Seven-Day Momentum',
      description: 'Log food seven days in a row.',
      icon: 'flame',
      earnedAt: null
    }
  ]
};

export function getTutorialGamificationData(
  data: GamificationDashboard | null,
  demoMode: boolean
): GamificationDashboard | null {
  if (!demoMode) return data;
  if (!data) return DEMO_DASHBOARD;

  return {
    ...data,
    currentLevel: data.currentLevel ?? DEMO_DASHBOARD.currentLevel,
    momentum: {
      ...data.momentum,
      foodLoggingStreak: Math.max(data.momentum.foodLoggingStreak, DEMO_DASHBOARD.momentum.foodLoggingStreak)
    },
    hydration: {
      ...data.hydration,
      currentStreak: Math.max(data.hydration.currentStreak, DEMO_DASHBOARD.hydration.currentStreak),
      fillFraction: data.hydration.fillFraction > 0 ? data.hydration.fillFraction : DEMO_DASHBOARD.hydration.fillFraction,
      actualOz: data.hydration.actualOz > 0 ? data.hydration.actualOz : DEMO_DASHBOARD.hydration.actualOz,
      targetOz: data.hydration.targetOz || DEMO_DASHBOARD.hydration.targetOz,
      goalMet: data.hydration.goalMet
    },
    recentBadges: data.recentBadges.length > 0 ? data.recentBadges : DEMO_DASHBOARD.recentBadges
  };
}
