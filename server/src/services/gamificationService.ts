import { LevelStatus, ProgramStatus } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { BADGE_DEFINITIONS, LEVEL_DEFINITIONS } from '../gamification/definitions.js';
import {
  evaluateLevelTasks,
  LEVEL_DEFINITIONS as LEVELS,
  runProgressionEvaluation,
  type ProgressionCelebration
} from '../gamification/progressionEngine.js';
import { ensureDailyLog } from './dailyLogService.js';
import { parseDateParam, userDayKey } from '../utils/dates.js';

export async function syncGamificationDefinitions() {
  for (const level of LEVEL_DEFINITIONS) {
    await prisma.levelDefinition.upsert({
      where: { id: level.id },
      create: {
        id: level.id,
        name: level.name,
        description: level.description,
        purpose: level.purpose,
        order: level.order,
        requirements: level.requirements,
        unlocks: level.unlocks,
        completionMessage: level.completionMessage
      },
      update: {
        name: level.name,
        description: level.description,
        purpose: level.purpose,
        order: level.order,
        requirements: level.requirements,
        unlocks: level.unlocks,
        completionMessage: level.completionMessage
      }
    });
  }

  for (const badge of BADGE_DEFINITIONS) {
    await prisma.badgeDefinition.upsert({
      where: { id: badge.id },
      create: {
        id: badge.id,
        name: badge.name,
        description: badge.description,
        icon: badge.icon,
        category: badge.category,
        requirementType: badge.requirementType,
        requirementThreshold: badge.requirementThreshold,
        tier: badge.tier ?? null
      },
      update: {
        name: badge.name,
        description: badge.description,
        icon: badge.icon,
        category: badge.category,
        requirementType: badge.requirementType,
        requirementThreshold: badge.requirementThreshold,
        tier: badge.tier ?? null
      }
    });
  }
}

export async function ensureGamificationUser(userId: string) {
  await syncGamificationDefinitions();

  const existing = await prisma.userLevelProgress.count({ where: { userId } });
  if (existing > 0) return;

  for (const level of LEVEL_DEFINITIONS) {
    let status: LevelStatus = LevelStatus.LOCKED;
    if (level.order === 1) status = LevelStatus.ACTIVE;
    else if (level.order === 2) status = LevelStatus.PREVIEW;

    await prisma.userLevelProgress.create({
      data: {
        userId,
        levelId: level.id,
        status,
        startedAt: level.order === 1 ? new Date() : null
      }
    });
  }

  const streakTypes = [
    'FOOD_LOGGING_DAILY',
    'DAILY_WIN',
    'WATER_GOAL_DAILY',
    'DAILY_CHECK_IN',
    'WEEKLY_SNAPSHOT',
    'WEEKLY_MEASUREMENTS',
    'WEEKLY_PHOTOS',
    'WEEKLY_REFLECTION',
    'WEEKLY_FOCUS_GOAL'
  ] as const;

  for (const streakType of streakTypes) {
    await prisma.userStreak.upsert({
      where: { userId_streakType: { userId, streakType } },
      create: { userId, streakType, graceDaysAvailable: streakType.includes('WEEKLY') ? 0 : 2 },
      update: {}
    });
  }

  for (const badge of BADGE_DEFINITIONS) {
    await prisma.userBadge.upsert({
      where: { userId_badgeId: { userId, badgeId: badge.id } },
      create: { userId, badgeId: badge.id },
      update: {}
    });
  }
}

export async function getGamificationDashboard(userId: string, dateKey?: string, timeZone?: string | null) {
  await ensureGamificationUser(userId);
  await runProgressionEvaluation(userId);

  const activeProgress = await prisma.userLevelProgress.findFirst({
    where: { userId, status: LevelStatus.ACTIVE },
    include: { level: true },
    orderBy: { level: { order: 'asc' } }
  });

  const levelDef = activeProgress
    ? LEVELS.find((l) => l.id === activeProgress.levelId)
    : null;

  const tasks = activeProgress ? await evaluateLevelTasks(userId, activeProgress.levelId) : [];
  const nextTask = tasks.find((t) => !t.complete);
  const nextLevel = levelDef
    ? LEVELS.find((l) => l.order === levelDef.order + 1)
    : null;

  const streaks = await prisma.userStreak.findMany({
    where: { userId },
    orderBy: { streakType: 'asc' }
  });

  const recentBadges = await prisma.userBadge.findMany({
    where: { userId, status: 'EARNED' },
    include: { badge: true },
    orderBy: { earnedAt: 'desc' },
    take: 4
  });

  const dailyWinsThisWeek = await prisma.dailyFoodLog.count({
    where: {
      userId,
      dailyWinEarned: true,
      date: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    }
  });

  const foodStreak = streaks.find((s) => s.streakType === 'FOOD_LOGGING_DAILY');
  const snapshotStreak = streaks.find((s) => s.streakType === 'WEEKLY_SNAPSHOT');
  const waterStreak = streaks.find((s) => s.streakType === 'WATER_GOAL_DAILY');

  const sevenDayBadge = BADGE_DEFINITIONS.find((b) => b.id === 'seven-day-momentum');
  const foodStreakCount = foodStreak?.currentCount ?? 0;

  const program = await prisma.program.findFirst({
    where: { userId, status: ProgramStatus.ACTIVE },
    include: { metrics: true }
  });
  let hydration = {
    targetOz: 64,
    actualOz: 0,
    fillFraction: 1,
    goalMet: false,
    currentStreak: waterStreak?.currentCount ?? 0
  };
  if (program) {
    const resolvedDateKey =
      dateKey && /^\d{4}-\d{2}-\d{2}$/.test(dateKey)
        ? dateKey
        : userDayKey(
            timeZone ??
              (await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } }))?.timezone ??
              null
          );
    const dailyLog = await ensureDailyLog(userId, program, parseDateParam(resolvedDateKey));
    const targetOz = dailyLog.waterTargetOz;
    const actualOz = dailyLog.waterActualOz;
    hydration = {
      targetOz,
      actualOz,
      fillFraction: targetOz > 0 ? Math.max(0, Math.min(1, (targetOz - actualOz) / targetOz)) : 0,
      goalMet: dailyLog.waterGoalMet,
      currentStreak: waterStreak?.currentCount ?? 0
    };
  }

  return {
    currentLevel: activeProgress
      ? {
          id: activeProgress.levelId,
          number: activeProgress.level.order,
          name: activeProgress.level.name,
          description: activeProgress.level.description,
          purpose: activeProgress.level.purpose,
          progressPercent: activeProgress.progressPercent,
          tasks,
          nextAction: nextTask?.label ?? 'Continue your journey',
          nextUnlock: nextLevel?.unlocks[0] ?? null,
          ctaLabel: nextTask ? `Continue ${activeProgress.level.name.split(':').pop()?.trim() ?? 'Level'}` : 'View journey',
          ctaPath:
            nextTask?.key.includes('meal') || nextTask?.key.includes('log')
              ? '/nutrition'
              : nextTask?.key.includes('snapshot') ||
                  nextTask?.key.includes('photo') ||
                  nextTask?.key.includes('weight') ||
                  nextTask?.key.includes('measurement')
                ? '/level-up/baseline'
                : '/program'
        }
      : null,
    momentum: {
      foodLoggingStreak: foodStreakCount,
      foodLoggingBest: foodStreak?.bestCount ?? 0,
      snapshotStreak: snapshotStreak?.currentCount ?? 0,
      waterGoalStreak: waterStreak?.currentCount ?? 0,
      dailyWinsThisWeek,
      graceDaysAvailable: foodStreak?.graceDaysAvailable ?? 0,
      graceDaysUsed: foodStreak?.graceDaysUsed ?? 0,
      nextMilestone:
        sevenDayBadge && foodStreakCount < 7
          ? `Log tomorrow to earn the ${sevenDayBadge.name} badge.`
          : null
    },
    hydration,
    recentBadges: recentBadges.map((ub) => ({
      id: ub.badgeId,
      name: ub.badge.name,
      description: ub.badge.description,
      icon: ub.badge.icon,
      earnedAt: ub.earnedAt?.toISOString() ?? null
    }))
  };
}

export async function getJourney(userId: string) {
  await ensureGamificationUser(userId);

  const progress = await prisma.userLevelProgress.findMany({
    where: { userId },
    include: { level: true },
    orderBy: { level: { order: 'asc' } }
  });

  return progress.map((p) => {
    const def = LEVELS.find((l) => l.id === p.levelId);
    return {
      id: p.levelId,
      number: p.level.order,
      name: p.level.name,
      description: p.level.description,
      purpose: p.level.purpose,
      status: p.status,
      progressPercent: p.progressPercent,
      completedAt: p.completedAt?.toISOString() ?? null,
      unlocks: def?.unlocks ?? [],
      badgeIds: def?.badgeIds ?? [],
      previewOnly: p.status === LevelStatus.LOCKED || p.status === LevelStatus.PREVIEW
    };
  });
}

export async function getBadges(userId: string) {
  await ensureGamificationUser(userId);

  const userBadges = await prisma.userBadge.findMany({
    where: { userId },
    include: { badge: true }
  });

  const byCategory = new Map<string, typeof userBadges>();
  for (const ub of userBadges) {
    const cat = ub.badge.category;
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(ub);
  }

  return {
    recent: userBadges
      .filter((b) => b.status === 'EARNED')
      .sort((a, b) => (b.earnedAt?.getTime() ?? 0) - (a.earnedAt?.getTime() ?? 0))
      .slice(0, 6)
      .map(formatUserBadge),
    categories: [...byCategory.entries()].map(([category, badges]) => ({
      category,
      badges: badges.map(formatUserBadge)
    }))
  };
}

function formatUserBadge(ub: {
  badgeId: string;
  status: string;
  progress: number;
  earnedAt: Date | null;
  badge: { name: string; description: string; icon: string; requirementThreshold: number; tier: string | null };
}) {
  return {
    id: ub.badgeId,
    name: ub.badge.name,
    description: ub.badge.description,
    icon: ub.badge.icon,
    status: ub.status,
    progress: ub.progress,
    threshold: ub.badge.requirementThreshold,
    tier: ub.badge.tier,
    earnedAt: ub.earnedAt?.toISOString() ?? null
  };
}

export async function patchLevelMetadata(
  userId: string,
  patch: Record<string, unknown>
): Promise<ProgressionCelebration[]> {
  await ensureGamificationUser(userId);
  return runProgressionEvaluation(userId, { metadataPatch: patch });
}

export async function saveProgressSnapshot(
  userId: string,
  data: {
    snapshotDate?: string;
    weight?: number;
    measurements?: Record<string, number | string>;
    extendedMeasurements?: Record<string, number | string>;
    frontPhotoUrl?: string;
    sidePhotoUrl?: string;
    backPhotoUrl?: string;
    notes?: string;
    complete?: boolean;
  }
) {
  const program = await prisma.program.findFirst({
    where: { userId, status: ProgramStatus.ACTIVE }
  });

  const date = data.snapshotDate
    ? new Date(data.snapshotDate)
    : new Date();

  const existing = await prisma.progressSnapshot.findFirst({
    where: { userId, snapshotDate: date }
  });

  const payload = {
    userId,
    programId: program?.id ?? null,
    snapshotDate: date,
    weight: data.weight ?? undefined,
    measurements: data.measurements ?? undefined,
    extendedMeasurements: data.extendedMeasurements ?? undefined,
    frontPhotoUrl: data.frontPhotoUrl,
    sidePhotoUrl: data.sidePhotoUrl,
    backPhotoUrl: data.backPhotoUrl,
    notes: data.notes,
    completionStatus: data.complete ? ('COMPLETE' as const) : ('DRAFT' as const),
    completedAt: data.complete ? new Date() : undefined
  };

  const snapshot = existing
    ? await prisma.progressSnapshot.update({ where: { id: existing.id }, data: payload })
    : await prisma.progressSnapshot.create({ data: payload });

  if (data.complete) {
    return runProgressionEvaluation(userId);
  }
  return [];
}

export async function saveWeeklyReflection(
  userId: string,
  data: {
    weekStartDate: string;
    difficultyRating?: string;
    frictionPoints?: string[];
    selectedFocusGoal?: string;
    notes?: string;
  }
) {
  const weekStart = new Date(data.weekStartDate);
  const reflection = await prisma.weeklyReflection.upsert({
    where: { userId_weekStartDate: { userId, weekStartDate: weekStart } },
    create: {
      userId,
      weekStartDate: weekStart,
      difficultyRating: data.difficultyRating,
      frictionPoints: data.frictionPoints ?? [],
      selectedFocusGoal: data.selectedFocusGoal,
      notes: data.notes,
      completedAt: new Date()
    },
    update: {
      difficultyRating: data.difficultyRating,
      frictionPoints: data.frictionPoints ?? [],
      selectedFocusGoal: data.selectedFocusGoal,
      notes: data.notes,
      completedAt: new Date()
    }
  });

  return runProgressionEvaluation(userId, {
    metadataPatch: data.selectedFocusGoal ? { focusGoalSelected: true } : {}
  });
}

export async function ensureDailyFoodLog(userId: string, dateStr: string) {
  const program = await prisma.program.findFirst({
    where: { userId, status: ProgramStatus.ACTIVE },
    include: { metrics: true }
  });
  if (!program) throw new Error('No active program');

  const day = parseDateParam(dateStr);
  const dailyLog = await ensureDailyLog(userId, program, day);

  return prisma.dailyFoodLog.upsert({
    where: { dailyLogId: dailyLog.id },
    create: { userId, dailyLogId: dailyLog.id, date: day },
    update: {}
  });
}
