export type HydrationSource = 'MANUAL' | 'AI' | 'SMS';

export type HydrationSummary = {
  goalOz: number;
  targetOz: number;
  actualOz: number;
  fillFraction: number;
  goalMet: boolean;
  currentStreak: number;
  bestStreak: number;
  goalMetDays: number;
  last30DayHitPercent: number;
  recentEntries: Array<{
    id: string;
    amountOz: number;
    source: HydrationSource;
    createdAt: string;
  }>;
};

export type HydrationLogResponse = {
  amountOz: number;
  actualOz: number;
  targetOz: number;
  goalMet: boolean;
  fillFraction: number;
  summary: HydrationSummary;
};

export type CoachHydrationStats = {
  waterGoalOz: number;
  currentStreak: number;
  goalMetDays: number;
  last30DayHitPercent: number;
  todayActualOz: number;
  todayTargetOz: number;
  todayGoalMet: boolean;
};
