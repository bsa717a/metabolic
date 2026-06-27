import {
  BadgeStatus,
  DailyFoodLogStatus,
  GamificationMealLogStatus,
  LevelStatus,
  MealStatus,
  ProgramStatus,
  StreakEventType,
  StreakStatus,
  StreakType,
  type Prisma
} from '@prisma/client';
import { allPlannedMealsLogged, countMealsLogged, getTodayMealsForUser, mealIsLogged } from './mealActivity.js';
import { prisma } from '../db/prisma.js';
import { startOfUtcDay, addUtcDays } from '../utils/dates.js';
import {
  BADGE_DEFINITIONS,
  CORE_MEASUREMENT_METRIC_TYPES,
  LEVEL_DEFINITIONS,
  STREAK_GRACE_CONFIG,
  type LevelRequirement
} from './definitions.js';

export type ProgressionCelebration = {
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

export type UserProgressContext = {
  userId: string;
  programId: string | null;
};

async function getCompletedFoodLogDays(userId: string) {
  return prisma.dailyFoodLog.count({
    where: { userId, completionStatus: 'COMPLETE' }
  });
}

async function getWaterGoalMetDays(userId: string) {
  return prisma.dailyLog.count({
    where: { userId, waterGoalMet: true }
  });
}

async function reconcileCompletedFoodLogDays(userId: string) {
  const logs = await prisma.dailyLog.findMany({
    where: { userId },
    include: {
      dailyFoodLog: true,
      meals: { include: { items: true, gamificationLog: { select: { id: true } } } }
    }
  });

  for (const log of logs) {
    if (log.dailyFoodLog?.completionStatus === DailyFoodLogStatus.COMPLETE) continue;
    if (!allPlannedMealsLogged(log.meals)) continue;

    await prisma.dailyFoodLog.upsert({
      where: { dailyLogId: log.id },
      create: {
        userId,
        dailyLogId: log.id,
        date: log.date,
        completionStatus: DailyFoodLogStatus.COMPLETE,
        dailyWinEarned: log.meals.every(
          (meal) =>
            meal.status === MealStatus.EATEN_AS_PLANNED ||
            meal.status === MealStatus.MODIFIED ||
            meal.status === MealStatus.SKIPPED
        ),
        completedAt: new Date()
      },
      update: {
        completionStatus: DailyFoodLogStatus.COMPLETE,
        completedAt: new Date()
      }
    });
  }
}

async function getFoodLogDaysWithDifferentMeal(userId: string) {
  return prisma.dailyFoodLog.count({
    where: {
      userId,
      completionStatus: 'COMPLETE',
      mealLogs: { some: { status: GamificationMealLogStatus.ATE_SOMETHING_DIFFERENT } }
    }
  });
}

async function getActiveProgramId(userId: string) {
  const program = await prisma.program.findFirst({
    where: { userId, status: ProgramStatus.ACTIVE }
  });
  return program?.id ?? null;
}

function photoSetComplete(photoSet: { frontUrl: string | null; sideUrl: string | null; backUrl: string | null }) {
  return Boolean(photoSet.frontUrl && photoSet.sideUrl && photoSet.backUrl);
}

async function countCompleteProgramPhotoSets(programId: string) {
  const sets = await prisma.programProgressPhotoSet.findMany({ where: { programId } });
  return sets.filter(photoSetComplete).length;
}

async function getEarliestProgramPhotoSet(programId: string) {
  return prisma.programProgressPhotoSet.findFirst({
    where: { programId },
    orderBy: { date: 'asc' }
  });
}

async function getEarliestProgramMetricSnapshot(programId: string) {
  return prisma.programMetricSnapshot.findFirst({
    where: { programId },
    orderBy: { date: 'asc' },
    include: { values: true }
  });
}

function snapshotHasMetrics(
  snapshot: { values: Array<{ metricType: string }> } | null,
  types: readonly string[]
) {
  if (!snapshot) return false;
  const present = new Set(snapshot.values.map((v) => v.metricType));
  return types.every((t) => present.has(t));
}

async function getCompleteSnapshots(userId: string) {
  const programId = await getActiveProgramId(userId);
  const gamificationCount = await prisma.progressSnapshot.count({
    where: { userId, completionStatus: 'COMPLETE' }
  });
  if (!programId) return gamificationCount;
  const programCount = await countCompleteProgramPhotoSets(programId);
  return Math.max(gamificationCount, programCount);
}

async function hasProgramBaseline(userId: string) {
  const programId = await getActiveProgramId(userId);
  if (!programId) return false;
  const photoSet = await getEarliestProgramPhotoSet(programId);
  const metricSnapshot = await getEarliestProgramMetricSnapshot(programId);
  return (
    photoSet != null &&
    photoSetComplete(photoSet) &&
    snapshotHasMetrics(metricSnapshot, ['WEIGHT', ...CORE_MEASUREMENT_METRIC_TYPES])
  );
}

async function getWeeklySnapshotStreak(userId: string) {
  const snapshots = await prisma.progressSnapshot.findMany({
    where: { userId, completionStatus: 'COMPLETE' },
    orderBy: { snapshotDate: 'desc' },
    take: 12
  });
  if (!snapshots.length) return 0;

  let streak = 1;
  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapshots[i - 1]!.snapshotDate.getTime();
    const curr = snapshots[i]!.snapshotDate.getTime();
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    if (prev - curr <= weekMs * 1.5) streak++;
    else break;
  }
  return streak;
}

async function getFoodLoggingStreak(userId: string) {
  const streak = await prisma.userStreak.findUnique({
    where: { userId_streakType: { userId, streakType: StreakType.FOOD_LOGGING_DAILY } }
  });
  return streak?.currentCount ?? 0;
}

async function evaluateRequirement(
  userId: string,
  programId: string | null,
  req: LevelRequirement,
  metadata: Record<string, unknown>
): Promise<boolean> {
  switch (req.type) {
    case 'review_meal_plan': {
      const today = startOfUtcDay();
      const log = await prisma.dailyLog.findFirst({
        where: { userId, date: today },
        include: { meals: { include: { items: true } } }
      });
      return Boolean(log?.meals.some((m) => m.items.some((i) => i.type === 'PLANNED')));
    }
    case 'log_all_planned_meals': {
      const meals = await getTodayMealsForUser(userId);
      return allPlannedMealsLogged(meals);
    }
    case 'complete_daily_food_log':
      return (await getCompletedFoodLogDays(userId)) >= 1;
    case 'enter_starting_weight': {
      const pid = programId ?? (await getActiveProgramId(userId));
      if (pid) {
        const metricSnapshot = await getEarliestProgramMetricSnapshot(pid);
        if (snapshotHasMetrics(metricSnapshot, ['WEIGHT'])) return true;
      }
      const snap = await prisma.progressSnapshot.findFirst({
        where: { userId },
        orderBy: { snapshotDate: 'asc' }
      });
      return snap?.weight != null;
    }
    case 'enter_core_measurements': {
      const pid = programId ?? (await getActiveProgramId(userId));
      if (pid) {
        const metricSnapshot = await getEarliestProgramMetricSnapshot(pid);
        if (snapshotHasMetrics(metricSnapshot, [...CORE_MEASUREMENT_METRIC_TYPES])) return true;
      }
      const snap = await prisma.progressSnapshot.findFirst({
        where: { userId, completionStatus: 'COMPLETE' },
        orderBy: { snapshotDate: 'asc' }
      });
      const m = (snap?.measurements ?? {}) as Record<string, unknown>;
      return CORE_MEASUREMENT_METRIC_TYPES.every((k) => {
        const key = k.toLowerCase();
        return m[key] != null && m[key] !== '';
      });
    }
    case 'upload_progress_photo': {
      const pid = programId ?? (await getActiveProgramId(userId));
      if (pid) {
        const photoSet = await getEarliestProgramPhotoSet(pid);
        if (photoSet) {
          if (req.pose === 'front') return Boolean(photoSet.frontUrl);
          if (req.pose === 'side') return Boolean(photoSet.sideUrl);
          return Boolean(photoSet.backUrl);
        }
      }
      const snap = await prisma.progressSnapshot.findFirst({
        where: { userId },
        orderBy: { snapshotDate: 'asc' }
      });
      if (!snap) return false;
      if (req.pose === 'front') return Boolean(snap.frontPhotoUrl);
      if (req.pose === 'side') return Boolean(snap.sidePhotoUrl);
      return Boolean(snap.backPhotoUrl);
    }
    case 'save_baseline_snapshot':
      if (await hasProgramBaseline(userId)) return true;
      return (await prisma.progressSnapshot.count({ where: { userId, completionStatus: 'COMPLETE' } })) >= 1;
    case 'food_log_days':
      return (await getCompletedFoodLogDays(userId)) >= req.count;
    case 'log_different_meal':
      return (await prisma.gamificationMealLog.count({
        where: {
          dailyFoodLog: { userId },
          status: GamificationMealLogStatus.ATE_SOMETHING_DIFFERENT
        }
      })) >= 1;
    case 'daily_check_in':
      return (await getCompletedFoodLogDays(userId)) >= 1;
    case 'second_snapshot_complete':
      return (await getCompleteSnapshots(userId)) >= 2;
    case 'view_comparison':
      return Boolean(metadata.viewedComparison);
    case 'weekly_snapshot_weeks':
      return (await getWeeklySnapshotStreak(userId)) >= req.count;
    case 'food_log_days_in_week': {
      const weekStart = startOfUtcDay();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const count = await prisma.dailyFoodLog.count({
        where: {
          userId,
          completionStatus: 'COMPLETE',
          date: { gte: weekStart }
        }
      });
      return count >= req.count;
    }
    case 'weekly_reflection': {
      const reflection = await prisma.weeklyReflection.findFirst({
        where: { userId, completedAt: { not: null } },
        orderBy: { weekStartDate: 'desc' }
      });
      return Boolean(reflection);
    }
    case 'review_two_week_comparison':
      return Boolean(metadata.reviewedTwoWeekComparison);
    case 'review_meal_consistency':
      return Boolean(metadata.reviewedMealConsistency);
    case 'select_focus_goal': {
      const reflection = await prisma.weeklyReflection.findFirst({
        where: { userId, selectedFocusGoal: { not: null } }
      });
      return Boolean(reflection?.selectedFocusGoal);
    }
    case 'food_log_days_in_14': {
      const since = addUtcDays(startOfUtcDay(), -14);
      const count = await prisma.dailyFoodLog.count({
        where: { userId, completionStatus: 'COMPLETE', date: { gte: since } }
      });
      return count >= req.count;
    }
    case 'weekly_snapshots_count':
      return (await getCompleteSnapshots(userId)) >= req.count;
    case 'complete_focus_goal':
      return Boolean(metadata.focusGoalCompleted);
    case 'review_progress_timeline':
      return Boolean(metadata.reviewedProgressTimeline);
    default:
      return false;
  }
}

function requirementLabel(req: LevelRequirement): string {
  const labels: Record<string, string> = {
    review_meal_plan: 'Review the daily meal plan',
    log_all_planned_meals: 'Mark each planned meal',
    complete_daily_food_log: 'Complete one full day of food logging',
    enter_starting_weight: 'Enter starting weight',
    enter_core_measurements: 'Add core body measurements',
    save_baseline_snapshot: 'Review and save the snapshot',
    food_log_days: 'Complete food logging on separate days',
    log_different_meal: 'Log at least one meal different from the plan',
    daily_check_in: 'Log all planned meals in one day',
    second_snapshot_complete: 'Save your second progress snapshot',
    view_comparison: 'View the side-by-side comparison',
    weekly_snapshot_weeks: 'Complete weekly snapshots',
    food_log_days_in_week: 'Log meals during the current week',
    weekly_reflection: 'Complete a weekly reflection',
    review_two_week_comparison: 'Review the 2-week comparison',
    review_meal_consistency: 'Review meal consistency data',
    select_focus_goal: 'Choose a focus goal for next week',
    food_log_days_in_14: 'Log meals across two weeks',
    weekly_snapshots_count: 'Complete weekly snapshots',
    complete_focus_goal: 'Complete your weekly focus goal',
    review_progress_timeline: 'Review the progress timeline'
  };
  if (req.type === 'upload_progress_photo') {
    return `Upload ${req.pose} progress photo`;
  }
  if (req.type === 'food_log_days') return `Complete food logging on ${req.count} separate days`;
  if (req.type === 'food_log_days_in_week') return `Log meals on at least ${req.count} days this week`;
  if (req.type === 'weekly_snapshot_weeks') return `Complete snapshots for ${req.count} weeks in a row`;
  if (req.type === 'food_log_days_in_14') return `Log meals on ${req.count} of the last 14 days`;
  if (req.type === 'weekly_snapshots_count') return `Complete ${req.count} weekly snapshots`;
  return labels[req.type] ?? req.type;
}

export async function evaluateLevelTasks(userId: string, levelId: string) {
  const def = LEVEL_DEFINITIONS.find((l) => l.id === levelId);
  if (!def) return [];

  const progress = await prisma.userLevelProgress.findUnique({
    where: { userId_levelId: { userId, levelId } }
  });
  const metadata = (progress?.metadata ?? {}) as Record<string, unknown>;
  const program = await prisma.program.findFirst({
    where: { userId, status: ProgramStatus.ACTIVE }
  });

  await reconcileCompletedFoodLogDays(userId);

  const results = await Promise.all(
    def.requirements.map(async (req) => ({
      key: JSON.stringify(req),
      label: requirementLabel(req),
      complete: await evaluateRequirement(userId, program?.id ?? null, req, metadata)
    }))
  );
  return results;
}

async function updateStreak(
  userId: string,
  streakType: StreakType,
  completedToday: boolean,
  eventDate?: Date
): Promise<void> {
  const today = startOfUtcDay(eventDate);
  const config = STREAK_GRACE_CONFIG[streakType];
  let streak = await prisma.userStreak.findUnique({
    where: { userId_streakType: { userId, streakType } }
  });

  if (!streak) {
    streak = await prisma.userStreak.create({
      data: {
        userId,
        streakType,
        graceDaysAvailable: config?.graceDaysAvailable ?? 1
      }
    });
  }

  const lastDate = streak.lastCompletedDate ? startOfUtcDay(streak.lastCompletedDate) : null;
  const yesterday = addUtcDays(today, -1);

  if (completedToday) {
    if (!lastDate || lastDate.getTime() < yesterday.getTime()) {
      const missed = lastDate && lastDate.getTime() < yesterday.getTime();
      let newCount = lastDate?.getTime() === yesterday.getTime() ? streak.currentCount + 1 : 1;
      if (missed && config?.allowGrace && streak.graceDaysUsed < streak.graceDaysAvailable) {
        await prisma.userStreak.update({
          where: { id: streak.id },
          data: {
            graceDaysUsed: streak.graceDaysUsed + 1,
            status: StreakStatus.PRESERVED_BY_GRACE_DAY,
            lastCompletedDate: today
          }
        });
        await prisma.streakEvent.create({
          data: { userId, streakType, eventDate: today, eventType: StreakEventType.GRACE_DAY_USED }
        });
        newCount = streak.currentCount;
      } else {
        await prisma.userStreak.update({
          where: { id: streak.id },
          data: {
            currentCount: newCount,
            bestCount: Math.max(streak.bestCount, newCount),
            lastCompletedDate: today,
            status: StreakStatus.ACTIVE
          }
        });
        await prisma.streakEvent.create({
          data: { userId, streakType, eventDate: today, eventType: StreakEventType.COMPLETED }
        });
      }
    } else if (lastDate.getTime() !== today.getTime()) {
      await prisma.userStreak.update({
        where: { id: streak.id },
        data: {
          currentCount: streak.currentCount + 1,
          bestCount: Math.max(streak.bestCount, streak.currentCount + 1),
          lastCompletedDate: today,
          status: StreakStatus.ACTIVE
        }
      });
      await prisma.streakEvent.create({
        data: { userId, streakType, eventDate: today, eventType: StreakEventType.COMPLETED }
      });
    }
  }
}

async function evaluateBadges(userId: string): Promise<ProgressionCelebration[]> {
  const celebrations: ProgressionCelebration[] = [];
  const foodLogDays = await getCompletedFoodLogDays(userId);
  const differentMeals = await prisma.gamificationMealLog.count({
    where: { status: GamificationMealLogStatus.ATE_SOMETHING_DIFFERENT, dailyFoodLog: { userId } }
  });
  const snapshots = await getCompleteSnapshots(userId);
  const foodStreak = await getFoodLoggingStreak(userId);
  const weeklyStreak = await getWeeklySnapshotStreak(userId);
  const mealsLogged = await countMealsLogged(userId);

  const metrics: Record<string, number> = {
    meals_logged: mealsLogged,
    daily_food_logs_complete: foodLogDays,
    baseline_snapshot: snapshots >= 1 ? 1 : 0,
    snapshots_complete: snapshots,
    food_logging_streak: foodStreak,
    food_log_days: foodLogDays,
    food_log_days_in_week: await prisma.dailyFoodLog.count({
      where: {
        userId,
        completionStatus: 'COMPLETE',
        date: { gte: addUtcDays(startOfUtcDay(), -7) }
      }
    }),
    weekly_snapshot_streak: weeklyStreak,
    honest_log_days: foodLogDays,
    different_meals_logged: differentMeals,
    weekly_measurement_streak: weeklyStreak,
    focus_goal_selected: await prisma.weeklyReflection.count({
      where: { userId, selectedFocusGoal: { not: null } }
    }),
    level_completed: await prisma.userLevelProgress.count({
      where: { userId, status: LevelStatus.COMPLETED }
    }),
    water_goal_days: await getWaterGoalMetDays(userId),
    daily_check_in_streak: 0,
    recovery_daily_win: 0
  };

  for (const badge of BADGE_DEFINITIONS) {
    const value = metrics[badge.requirementType] ?? 0;
    const earned = value >= badge.requirementThreshold;
    const existing = await prisma.userBadge.findUnique({
      where: { userId_badgeId: { userId, badgeId: badge.id } }
    });

    if (earned) {
      if (!existing || existing.status !== BadgeStatus.EARNED) {
        await prisma.userBadge.upsert({
          where: { userId_badgeId: { userId, badgeId: badge.id } },
          create: {
            userId,
            badgeId: badge.id,
            status: BadgeStatus.EARNED,
            progress: badge.requirementThreshold,
            earnedAt: new Date()
          },
          update: {
            status: BadgeStatus.EARNED,
            progress: badge.requirementThreshold,
            earnedAt: existing?.earnedAt ?? new Date()
          }
        });
        celebrations.push({
          type: 'badge_earned',
          badgeId: badge.id,
          badgeName: badge.name,
          badgeDescription: badge.description
        });
      }
    } else {
      const progress = Math.min(value, badge.requirementThreshold);
      const status = progress > 0 ? BadgeStatus.IN_PROGRESS : BadgeStatus.LOCKED;
      await prisma.userBadge.upsert({
        where: { userId_badgeId: { userId, badgeId: badge.id } },
        create: { userId, badgeId: badge.id, status, progress },
        update: { status, progress }
      });
    }
  }

  return celebrations;
}

export async function runProgressionEvaluation(
  userId: string,
  options?: { metadataPatch?: Record<string, unknown> }
): Promise<ProgressionCelebration[]> {
  const celebrations: ProgressionCelebration[] = [];

  const active = await prisma.userLevelProgress.findFirst({
    where: { userId, status: LevelStatus.ACTIVE },
    include: { level: true }
  });

  if (active) {
    if (options?.metadataPatch) {
      const meta = (active.metadata ?? {}) as Record<string, unknown>;
      await prisma.userLevelProgress.update({
        where: { id: active.id },
        data: { metadata: { ...meta, ...options.metadataPatch } as Prisma.InputJsonValue }
      });
    }

    const tasks = await evaluateLevelTasks(userId, active.levelId);
    const completedCount = tasks.filter((t) => t.complete).length;
    const total = tasks.length || 1;
    const progressPercent = Math.round((completedCount / total) * 100);

    await prisma.userLevelProgress.update({
      where: { id: active.id },
      data: { progressPercent, currentStep: completedCount }
    });

    if (completedCount >= total) {
      await prisma.userLevelProgress.update({
        where: { id: active.id },
        data: { status: LevelStatus.COMPLETED, completedAt: new Date(), progressPercent: 100 }
      });

      for (const badgeId of LEVEL_DEFINITIONS.find((l) => l.id === active.levelId)?.badgeIds ?? []) {
        await prisma.userBadge.upsert({
          where: { userId_badgeId: { userId, badgeId } },
          create: {
            userId,
            badgeId,
            status: BadgeStatus.EARNED,
            progress: 1,
            earnedAt: new Date()
          },
          update: { status: BadgeStatus.EARNED, earnedAt: new Date() }
        });
      }

      const nextDef = LEVEL_DEFINITIONS.find((l) => l.order === active.level.order + 1);
      if (nextDef) {
        await prisma.userLevelProgress.update({
          where: { userId_levelId: { userId, levelId: nextDef.id } },
          data: { status: LevelStatus.ACTIVE, startedAt: new Date() }
        });
        const nextNext = LEVEL_DEFINITIONS.find((l) => l.order === nextDef.order + 1);
        if (nextNext) {
          await prisma.userLevelProgress.updateMany({
            where: { userId, levelId: nextNext.id, status: LevelStatus.LOCKED },
            data: { status: LevelStatus.PREVIEW }
          });
        }
      }

      celebrations.push({
        type: 'level_complete',
        levelId: active.levelId,
        levelName: active.level.name,
        completionMessage: active.level.completionMessage,
        nextLevelId: nextDef?.id,
        nextLevelName: nextDef?.name
      });
    }
  }

  const badgeCelebrations = await evaluateBadges(userId);
  celebrations.push(...badgeCelebrations);

  return celebrations;
}

export async function recordFoodLogDay(userId: string, dailyLogId: string, date: Date) {
  const foodLog = await prisma.dailyFoodLog.upsert({
    where: { dailyLogId },
    create: { userId, dailyLogId, date },
    update: {},
    include: { mealLogs: true }
  });

  const meals = await prisma.meal.findMany({
    where: { dailyLogId },
    include: { items: true, gamificationLog: { select: { id: true } } }
  });
  const allMealsLogged = allPlannedMealsLogged(meals);

  const dailyWin =
    allMealsLogged &&
    foodLog.mealLogs.every(
      (m) =>
        m.status === GamificationMealLogStatus.ATE_AS_PLANNED ||
        m.status === GamificationMealLogStatus.ATE_SOMETHING_DIFFERENT ||
        m.status === GamificationMealLogStatus.SKIPPED_MEAL
    );

  if (allMealsLogged) {
    await prisma.dailyFoodLog.update({
      where: { id: foodLog.id },
      data: {
        completionStatus: 'COMPLETE',
        dailyWinEarned: dailyWin,
        completedAt: new Date()
      }
    });
    await updateStreak(userId, StreakType.FOOD_LOGGING_DAILY, true);
    if (dailyWin) await updateStreak(userId, StreakType.DAILY_WIN, true);
  }

  return runProgressionEvaluation(userId);
}

export async function recordWaterGoalDay(userId: string, dailyLogId: string) {
  const log = await prisma.dailyLog.findUnique({
    where: { id: dailyLogId },
    select: { waterActualOz: true, waterTargetOz: true, waterGoalMet: true, date: true }
  });
  if (!log || !log.waterGoalMet || log.waterActualOz < log.waterTargetOz) return runProgressionEvaluation(userId);

  await updateStreak(userId, StreakType.WATER_GOAL_DAILY, true, log.date);
  return runProgressionEvaluation(userId);
}

/**
 * Reverses a WATER_GOAL_DAILY credit for today (e.g. after the user undoes a hydration entry
 * and the daily goal is no longer met). Only acts if the streak was credited today.
 */
export async function revertWaterGoalDay(userId: string, eventDate: Date) {
  const today = startOfUtcDay(eventDate);
  const streak = await prisma.userStreak.findUnique({
    where: { userId_streakType: { userId, streakType: StreakType.WATER_GOAL_DAILY } }
  });
  if (!streak?.lastCompletedDate) return;
  if (startOfUtcDay(streak.lastCompletedDate).getTime() !== today.getTime()) return;

  const todayEvent = await prisma.streakEvent.findFirst({
    where: { userId, streakType: StreakType.WATER_GOAL_DAILY, eventDate: today },
    orderBy: { createdAt: 'desc' }
  });

  const priorEvent = await prisma.streakEvent.findFirst({
    where: {
      userId,
      streakType: StreakType.WATER_GOAL_DAILY,
      eventDate: { lt: today },
      eventType: { in: [StreakEventType.COMPLETED, StreakEventType.GRACE_DAY_USED, StreakEventType.RECOVERED] }
    },
    orderBy: { eventDate: 'desc' }
  });
  const priorCompletedDate = priorEvent?.eventDate ?? null;

  if (todayEvent?.eventType === StreakEventType.GRACE_DAY_USED) {
    await prisma.userStreak.update({
      where: { id: streak.id },
      data: {
        graceDaysUsed: Math.max(0, streak.graceDaysUsed - 1),
        lastCompletedDate: priorCompletedDate,
        status: StreakStatus.ACTIVE
      }
    });
  } else {
    const newCount = Math.max(0, streak.currentCount - 1);
    await prisma.userStreak.update({
      where: { id: streak.id },
      data: {
        currentCount: newCount,
        lastCompletedDate: priorCompletedDate,
        status: newCount > 0 ? StreakStatus.ACTIVE : StreakStatus.RESET
      }
    });
  }

  if (todayEvent) {
    await prisma.streakEvent.delete({ where: { id: todayEvent.id } });
  }
}

export { requirementLabel, LEVEL_DEFINITIONS, BADGE_DEFINITIONS };
