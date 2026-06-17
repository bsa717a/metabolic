export type LevelTask = { key: string; label: string; complete: boolean };

export type GamificationDashboard = {
  currentLevel: {
    id: string;
    number: number;
    name: string;
    description: string;
    purpose: string;
    progressPercent: number;
    tasks: LevelTask[];
    nextAction: string;
    nextUnlock: string | null;
    ctaLabel: string;
    ctaPath: string;
  } | null;
  momentum: {
    foodLoggingStreak: number;
    foodLoggingBest: number;
    snapshotStreak: number;
    waterGoalStreak: number;
    dailyWinsThisWeek: number;
    graceDaysAvailable: number;
    graceDaysUsed: number;
    nextMilestone: string | null;
  };
  hydration: {
    targetOz: number;
    actualOz: number;
    fillFraction: number;
    goalMet: boolean;
    currentStreak: number;
  };
  recentBadges: Array<{
    id: string;
    name: string;
    description: string;
    icon: string;
    earnedAt: string | null;
  }>;
};

export type JourneyLevel = {
  id: string;
  number: number;
  name: string;
  description: string;
  purpose: string;
  status: 'LOCKED' | 'PREVIEW' | 'ACTIVE' | 'COMPLETED';
  progressPercent: number;
  completedAt: string | null;
  unlocks: string[];
  badgeIds: string[];
  previewOnly: boolean;
};

export type UserBadgeView = {
  id: string;
  name: string;
  description: string;
  icon: string;
  status: string;
  progress: number;
  threshold: number;
  tier: string | null;
  earnedAt: string | null;
};

export type GamificationCelebration = {
  type: 'level_complete' | 'badge_earned';
  levelId?: string;
  levelName?: string;
  completionMessage?: string;
  nextLevelId?: string;
  nextLevelName?: string;
  badgeId?: string;
  badgeName?: string;
  badgeDescription?: string;
};
