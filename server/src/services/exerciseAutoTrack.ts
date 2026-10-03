/**
 * Automatic exercise tracks built from existing exercise plans.
 * Six tracks = activity level × gym preference. Weeks inside a block reuse the
 * plan and step the rep scheme 10 → 15/12/10 → 20/17/15. Nothing here creates exercises.
 */

export const AUTO_LOCATIONS = ['HOME', 'GYM'] as const;
export const AUTO_LEVELS = ['BEGINNER', 'INTERMEDIATE', 'HARD'] as const;
export const AUTO_WEEK_SCHEMES = ['10', '15/12/10', '20/17/15'] as const;
export const WEEKS_PER_BLOCK = AUTO_WEEK_SCHEMES.length;

export type AutoLocation = (typeof AUTO_LOCATIONS)[number];
export type AutoLevel = (typeof AUTO_LEVELS)[number];
export type AutoCheckIn = 'NONE' | 'BLOCK_COMPLETE' | 'MISSED_WEEK';
export type AutoChoice = 'move_up' | 'repeat_block' | 'repeat_week' | 'keep_going';
export type WeekTileStatus = 'done' | 'current' | 'upcoming';

export type AutoPlanItem = {
  id: string;
  sortOrder: number;
  sets: number | null;
  reps: string | null;
  speed: string | null;
  durationSeconds: number | null;
  distance: number | null;
  weight: number | null;
  exerciseName: string;
  bodyPart: string | null;
  requiresGym: boolean;
};

export type AutoPlanDay = {
  id: string;
  name: string;
  dayIndex: number | null;
  items: AutoPlanItem[];
};

export type AutoPlanInput = {
  id: string;
  name: string;
  days: AutoPlanDay[];
};

export type AutoTrackBlock = {
  planId: string;
  label: string;
  days: AutoPlanDay[];
};

export type AutoTrack = {
  location: AutoLocation;
  level: AutoLevel;
  blocks: AutoTrackBlock[];
};

export type AutoProgress = {
  blockIndex: number;
  weekIndex: number;
  dayIndex: number;
  weekStartedOn: string | null;
  dayCompletedOn: string | null;
  pendingCheckIn: AutoCheckIn;
  appliedOn: string | null;
  appliedTemplateId: string | null;
};

export type AutoExerciseLine = {
  name: string;
  sets: number | null;
  reps: string | null;
  speed: string | null;
  durationSeconds: number | null;
  distance: number | null;
  weight: number | null;
  bodyPart: string | null;
};

export type AutoTrackView = {
  empty: boolean;
  blockLabel: string | null;
  nextBlockLabel: string | null;
  weekNumber: number;
  weekCount: number;
  scheme: string | null;
  pendingCheckIn: AutoCheckIn;
  checkIn: {
    kind: 'BLOCK_COMPLETE' | 'MISSED_WEEK';
    title: string;
    moveUpLabel: string | null;
    repeatBlockLabel: string | null;
    repeatWeekLabel: string | null;
    keepGoingLabel: string | null;
  } | null;
  today: {
    templateId: string;
    dayNumber: number;
    dayName: string;
    scheme: string;
    headline: string;
    summary: string;
    complete: boolean;
    inProgress: boolean;
    exercises: AutoExerciseLine[];
  } | null;
  weeks: Array<{ index: number; scheme: string; status: WeekTileStatus }>;
  days: Array<{ name: string; isCurrent: boolean; exercises: AutoExerciseLine[] }>;
  upNext: { label: string; dayNames: string[] } | null;
};

export function initialProgress(today: string): AutoProgress {
  return {
    blockIndex: 0,
    weekIndex: 0,
    dayIndex: 0,
    weekStartedOn: today,
    dayCompletedOn: null,
    pendingCheckIn: 'NONE',
    appliedOn: null,
    appliedTemplateId: null
  };
}

export function daysBetween(start: string, end: string) {
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** "3 Day Gym Split" → "3-day gym split". */
export function blockLabel(planName: string) {
  return planName
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/(\d+)\s*[- ]?\s*day\b/i, (_, count: string) => `${count}-day`)
    .toLowerCase();
}

/**
 * Home when the plan name says so. Otherwise gym when the name, equipment, or
 * a 3+ day split says so. Shorter unlabeled plans stay home.
 */
export function planLocation(plan: AutoPlanInput): AutoLocation {
  const name = plan.name.toLowerCase();
  if (/\bhome\b/.test(name)) return 'HOME';
  if (/\bgym\b/.test(name)) return 'GYM';
  const items = plan.days.flatMap((day) => day.items);
  const gymCount = items.filter((item) => item.requiresGym).length;
  if (items.length > 0 && gymCount / items.length >= 0.25) return 'GYM';
  if (plan.days.length >= 3) return 'GYM';
  return 'HOME';
}

function sortedDays(days: AutoPlanDay[]) {
  return [...days].sort((a, b) => (a.dayIndex ?? 999) - (b.dayIndex ?? 999) || a.name.localeCompare(b.name));
}

function usablePlan(plan: AutoPlanInput) {
  if (plan.days.length < 2) return false;
  return plan.days.some((day) => day.items.length > 0);
}

function levelWindows<T>(sorted: T[]): Record<AutoLevel, T[]> {
  if (!sorted.length) return { BEGINNER: [], INTERMEDIATE: [], HARD: [] };
  return {
    BEGINNER: sorted,
    INTERMEDIATE: sorted.length >= 2 ? sorted.slice(1) : [sorted[sorted.length - 1]],
    HARD: sorted.length >= 3 ? sorted.slice(2) : [sorted[sorted.length - 1]]
  };
}

export function buildTrackCatalog(plans: AutoPlanInput[]): AutoTrack[] {
  const grouped: Record<AutoLocation, AutoPlanInput[]> = { HOME: [], GYM: [] };
  for (const plan of plans) {
    if (!usablePlan(plan)) continue;
    grouped[planLocation(plan)].push(plan);
  }

  const tracks: AutoTrack[] = [];
  for (const location of AUTO_LOCATIONS) {
    const sorted = [...grouped[location]].sort(
      (a, b) => a.days.length - b.days.length || a.name.localeCompare(b.name)
    );
    const windows = levelWindows(sorted);
    for (const level of AUTO_LEVELS) {
      tracks.push({
        location,
        level,
        blocks: windows[level].map((plan) => ({
          planId: plan.id,
          label: blockLabel(plan.name),
          days: sortedDays(plan.days)
        }))
      });
    }
  }
  return tracks;
}

function weekScheme(weekIndex: number) {
  return AUTO_WEEK_SCHEMES[Math.min(Math.max(weekIndex, 0), WEEKS_PER_BLOCK - 1)];
}

function presentItem(item: AutoPlanItem, scheme: string): AutoExerciseLine {
  const hasReps = item.reps != null && item.reps.trim() !== '';
  return {
    name: item.exerciseName,
    sets: item.sets,
    reps: hasReps ? scheme : null,
    speed: item.speed,
    durationSeconds: item.durationSeconds,
    distance: item.distance,
    weight: item.weight,
    bodyPart: item.bodyPart
  };
}

function weekStatus(index: number, current: number, pending: AutoCheckIn): WeekTileStatus {
  if (pending === 'BLOCK_COMPLETE') return 'done';
  if (index < current) return 'done';
  if (index === current) return 'current';
  return 'upcoming';
}

function finishTrainingDay(progress: AutoProgress, dayCount: number, today: string): AutoProgress {
  const next: AutoProgress = {
    ...progress,
    dayCompletedOn: null,
    appliedOn: null,
    appliedTemplateId: null
  };
  if (dayCount < 1) return next;
  if (next.dayIndex + 1 < dayCount) {
    next.dayIndex += 1;
    return next;
  }
  if (next.weekIndex + 1 < WEEKS_PER_BLOCK) {
    next.dayIndex = 0;
    next.weekIndex += 1;
    next.weekStartedOn = today;
    return next;
  }
  next.pendingCheckIn = 'BLOCK_COMPLETE';
  return next;
}

/**
 * Records a finished training day and asks before changing week or block.
 * Never advances a block or repeats a week on its own.
 */
export function reconcileProgress(
  progress: AutoProgress,
  today: string,
  dayCount: number,
  todayWorkoutComplete: boolean
): AutoProgress {
  const next: AutoProgress = {
    ...progress,
    weekStartedOn: progress.weekStartedOn ?? today
  };
  if (dayCount > 0 && next.dayIndex >= dayCount && next.pendingCheckIn === 'NONE') {
    next.dayIndex = dayCount - 1;
  }
  if (next.pendingCheckIn !== 'NONE') return next;

  if (todayWorkoutComplete) next.dayCompletedOn = today;

  const weekAge = next.weekStartedOn ? daysBetween(next.weekStartedOn, today) : 0;
  const finishedLastDay = next.dayCompletedOn != null && dayCount > 0 && next.dayIndex + 1 >= dayCount;
  if (weekAge >= 7 && dayCount > 0 && next.dayCompletedOn !== today && !finishedLastDay) {
    next.pendingCheckIn = 'MISSED_WEEK';
    return next;
  }

  if (next.dayCompletedOn && next.dayCompletedOn < today) {
    return finishTrainingDay(next, dayCount, today);
  }
  return next;
}

export function applyCheckIn(
  progress: AutoProgress,
  choice: AutoChoice,
  today: string,
  blockCount: number
): AutoProgress {
  if (choice === 'move_up' || choice === 'repeat_block') {
    if (progress.pendingCheckIn !== 'BLOCK_COMPLETE') {
      throw new Error('No block check-in is waiting');
    }
  } else if (progress.pendingCheckIn !== 'MISSED_WEEK') {
    throw new Error('No missed-week check-in is waiting');
  }

  const cleared: AutoProgress = {
    ...progress,
    dayIndex: 0,
    weekStartedOn: today,
    dayCompletedOn: null,
    pendingCheckIn: 'NONE',
    appliedOn: null,
    appliedTemplateId: null
  };

  if (choice === 'repeat_block' || choice === 'repeat_week') {
    if (choice === 'repeat_block') cleared.weekIndex = 0;
    return cleared;
  }

  if (choice === 'move_up') {
    const nextBlock = progress.blockIndex + 1;
    cleared.blockIndex = nextBlock < blockCount ? nextBlock : progress.blockIndex;
    cleared.weekIndex = 0;
    return cleared;
  }

  const nextWeek = progress.weekIndex + 1;
  if (nextWeek >= WEEKS_PER_BLOCK) {
    return {
      ...progress,
      dayCompletedOn: null,
      appliedOn: null,
      appliedTemplateId: null,
      pendingCheckIn: 'BLOCK_COMPLETE'
    };
  }
  cleared.weekIndex = nextWeek;
  return cleared;
}

function checkInCopy(pending: AutoCheckIn, block: string | null, nextBlock: string | null): AutoTrackView['checkIn'] {
  if (pending === 'BLOCK_COMPLETE' && block) {
    return {
      kind: 'BLOCK_COMPLETE',
      title: `You finished the ${block}!`,
      moveUpLabel: nextBlock ? `Move up to ${nextBlock}` : 'Move up',
      repeatBlockLabel: 'Repeat this block',
      repeatWeekLabel: null,
      keepGoingLabel: null
    };
  }
  if (pending === 'MISSED_WEEK') {
    return {
      kind: 'MISSED_WEEK',
      title: 'Looks like you missed last week.',
      moveUpLabel: null,
      repeatBlockLabel: null,
      repeatWeekLabel: 'Repeat last week',
      keepGoingLabel: 'Keep going'
    };
  }
  return null;
}

export function buildAutoView(args: {
  blocks: AutoTrackBlock[];
  progress: AutoProgress;
  today: string;
  todayWorkoutComplete: boolean;
}): { progress: AutoProgress; track: AutoTrackView } {
  const blocks = args.blocks;
  let progress = { ...args.progress };
  if (blocks.length > 0 && progress.blockIndex >= blocks.length) {
    progress = {
      ...progress,
      blockIndex: blocks.length - 1,
      weekIndex: 0,
      dayIndex: 0,
      pendingCheckIn: 'NONE',
      dayCompletedOn: null,
      appliedOn: null,
      appliedTemplateId: null
    };
  } else if (blocks.length > 0 && progress.blockIndex < 0) {
    progress.blockIndex = 0;
  }

  const block = blocks[progress.blockIndex];
  const dayCount = block?.days.length ?? 0;
  progress = reconcileProgress(progress, args.today, dayCount, args.todayWorkoutComplete);

  if (!block) {
    return {
      progress,
      track: {
        empty: true,
        blockLabel: null,
        nextBlockLabel: null,
        weekNumber: 1,
        weekCount: WEEKS_PER_BLOCK,
        scheme: null,
        pendingCheckIn: progress.pendingCheckIn,
        checkIn: null,
        today: null,
        weeks: [],
        days: [],
        upNext: null
      }
    };
  }

  const scheme = weekScheme(progress.weekIndex);
  const next = blocks[progress.blockIndex + 1] ?? null;
  const day = block.days[Math.min(progress.dayIndex, block.days.length - 1)];
  const complete =
    progress.pendingCheckIn === 'BLOCK_COMPLETE' || progress.dayCompletedOn === args.today;

  return {
    progress,
    track: {
      empty: false,
      blockLabel: block.label,
      nextBlockLabel: next?.label ?? null,
      weekNumber: progress.weekIndex + 1,
      weekCount: WEEKS_PER_BLOCK,
      scheme,
      pendingCheckIn: progress.pendingCheckIn,
      checkIn: checkInCopy(progress.pendingCheckIn, block.label, next?.label ?? null),
      today: day
        ? {
            templateId: day.id,
            dayNumber: progress.dayIndex + 1,
            dayName: day.name,
            scheme,
            headline: `Day ${progress.dayIndex + 1} · ${day.name} · ${scheme}`,
            summary: `Week ${progress.weekIndex + 1} of ${WEEKS_PER_BLOCK} · ${block.label}`,
            complete,
            inProgress: progress.appliedOn === args.today && !complete,
            exercises: [...day.items]
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((item) => presentItem(item, scheme))
          }
        : null,
      weeks: AUTO_WEEK_SCHEMES.map((weekSchemeValue, index) => ({
        index,
        scheme: weekSchemeValue,
        status: weekStatus(index, progress.weekIndex, progress.pendingCheckIn)
      })),
      days: block.days.map((entry, index) => ({
        name: entry.name,
        isCurrent: index === progress.dayIndex && progress.pendingCheckIn !== 'BLOCK_COMPLETE',
        exercises: [...entry.items]
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((item) => presentItem(item, scheme))
      })),
      upNext: {
        label: next?.label ?? `Repeat ${block.label}`,
        dayNames: (next ?? block).days.map((entry) => entry.name)
      }
    }
  };
}

export function progressEquals(a: AutoProgress, b: AutoProgress) {
  return (
    a.blockIndex === b.blockIndex &&
    a.weekIndex === b.weekIndex &&
    a.dayIndex === b.dayIndex &&
    a.weekStartedOn === b.weekStartedOn &&
    a.dayCompletedOn === b.dayCompletedOn &&
    a.pendingCheckIn === b.pendingCheckIn &&
    a.appliedOn === b.appliedOn &&
    a.appliedTemplateId === b.appliedTemplateId
  );
}
