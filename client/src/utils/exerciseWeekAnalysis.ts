import { addDays, formatDayAbbrev, isFuture, isToday, startOfWeek } from '../services/api';
import type { DayExercises } from './planExportData';
import { dayDoneCount } from '../components/exercise/weekly/exerciseWeeklyHelpers';

export type ExerciseDayAnalysisKind =
  | 'rest'
  | 'future'
  | 'today'
  | 'complete'
  | 'partial'
  | 'missed'
  | 'skipped_only';

export type ExerciseDayAnalysis = {
  date: string;
  kind: ExerciseDayAnalysisKind;
  done: number;
  planned: number;
  skipped: number;
  stillPlanned: number;
};

export type WeekComparison = {
  previousCompletionPct: number | null;
  completionDelta: number | null;
  trend: 'up' | 'down' | 'flat' | 'unknown';
  previousDone: number;
  previousScheduled: number;
  doneDelta: number;
};

export type DayPatternEntry = {
  date: string;
  label: string;
  completionPct: number | null;
  done: number;
  planned: number;
  kind: ExerciseDayAnalysisKind;
};

export type SkippedExerciseSummary = {
  name: string;
  count: number;
};

export type BodyPartSummary = {
  bodyPart: string;
  planned: number;
  done: number;
  skipped: number;
};

export type ExerciseWeekAnalysis = {
  scheduled: number;
  done: number;
  skipped: number;
  stillPlanned: number;
  restDays: number;
  workoutDays: number;
  pastScheduled: number;
  pastDone: number;
  completionPct: number | null;
  days: ExerciseDayAnalysis[];
  insights: string[];
  comparison: WeekComparison | null;
  dayPattern: DayPatternEntry[];
  topSkipped: SkippedExerciseSummary[];
  bodyPartMix: BodyPartSummary[];
};

function dayKind(date: string, exercises: DayExercises['exercises']): ExerciseDayAnalysisKind {
  if (!exercises.length) return 'rest';
  if (isFuture(date)) return 'future';

  const done = dayDoneCount(exercises);
  const skipped = exercises.filter((item) => item.status === 'SKIPPED').length;

  if (isToday(date)) {
    if (done === exercises.length) return 'complete';
    if (skipped === exercises.length) return 'skipped_only';
    if (done > 0) return 'partial';
    return 'today';
  }

  if (done === exercises.length) return 'complete';
  if (skipped === exercises.length) return 'skipped_only';
  if (done > 0) return 'partial';
  return 'missed';
}

function formatDayList(dates: string[]) {
  const labels = dates.map((date) => formatDayAbbrev(date));
  if (labels.length === 0) return '';
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}

function compareWeeks(current: Omit<ExerciseWeekAnalysis, 'insights' | 'comparison' | 'dayPattern' | 'topSkipped' | 'bodyPartMix'>, previous: Omit<ExerciseWeekAnalysis, 'insights' | 'comparison' | 'dayPattern' | 'topSkipped' | 'bodyPartMix'>): WeekComparison | null {
  if (current.completionPct == null && previous.completionPct == null) return null;

  const completionDelta =
    current.completionPct != null && previous.completionPct != null
      ? current.completionPct - previous.completionPct
      : null;

  let trend: WeekComparison['trend'] = 'unknown';
  if (completionDelta != null) {
    if (completionDelta > 0) trend = 'up';
    else if (completionDelta < 0) trend = 'down';
    else trend = 'flat';
  }

  return {
    previousCompletionPct: previous.completionPct,
    completionDelta,
    trend,
    previousDone: previous.done,
    previousScheduled: previous.scheduled,
    doneDelta: current.done - previous.done
  };
}

function buildDayPattern(dayAnalyses: ExerciseDayAnalysis[]): DayPatternEntry[] {
  return dayAnalyses.map((day) => ({
    date: day.date,
    label: formatDayAbbrev(day.date),
    completionPct: day.planned > 0 ? Math.round((day.done / day.planned) * 100) : null,
    done: day.done,
    planned: day.planned,
    kind: day.kind
  }));
}

function buildTopSkipped(days: DayExercises[], limit = 5): SkippedExerciseSummary[] {
  const counts = new Map<string, number>();
  for (const day of days) {
    for (const exercise of day.exercises) {
      if (exercise.status !== 'SKIPPED') continue;
      const name = exercise.exercise.name;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

function buildBodyPartMix(days: DayExercises[]): BodyPartSummary[] {
  const map = new Map<string, BodyPartSummary>();
  for (const day of days) {
    for (const exercise of day.exercises) {
      const bodyPart = exercise.exercise.bodyPart?.trim() || 'Other';
      const entry = map.get(bodyPart) ?? { bodyPart, planned: 0, done: 0, skipped: 0 };
      entry.planned += 1;
      if (exercise.status === 'DONE') entry.done += 1;
      if (exercise.status === 'SKIPPED') entry.skipped += 1;
      map.set(bodyPart, entry);
    }
  }
  return [...map.values()].sort((a, b) => b.planned - a.planned || a.bodyPart.localeCompare(b.bodyPart));
}

function buildInsights(
  summary: Omit<ExerciseWeekAnalysis, 'insights'>,
  comparison: WeekComparison | null
): string[] {
  const insights: string[] = [];

  if (summary.scheduled === 0) {
    insights.push('No workouts were scheduled this week. Apply a template or build a plan together.');
    if (summary.restDays > 0) {
      insights.push(`${summary.restDays} rest day(s) on the calendar with nothing scheduled.`);
    }
    return insights;
  }

  if (comparison?.completionDelta != null && comparison.previousCompletionPct != null && summary.completionPct != null) {
    const delta = comparison.completionDelta;
    const abs = Math.abs(delta);
    if (delta > 0) {
      insights.push(
        `Completion improved ${abs}% vs last week (${comparison.previousCompletionPct}% → ${summary.completionPct}%). Acknowledge the progress.`
      );
    } else if (delta < 0) {
      insights.push(
        `Completion dropped ${abs}% vs last week (${comparison.previousCompletionPct}% → ${summary.completionPct}%). Ask what got harder this week.`
      );
    } else {
      insights.push(`Completion matched last week (${summary.completionPct}%). Steady — discuss whether the plan still fits their goals.`);
    }
  }

  if (summary.pastScheduled > 0 && summary.completionPct != null) {
    insights.push(
      `Completed ${summary.pastDone} of ${summary.pastScheduled} scheduled exercises (${summary.completionPct}%) through today.`
    );
  } else if (summary.days.every((day) => isFuture(day.date) || day.planned === 0)) {
    insights.push('This week is still ahead — workouts are scheduled but none are in the past yet.');
  }

  const pastWorkoutDays = summary.dayPattern.filter((day) => day.planned > 0 && !isFuture(day.date));
  if (pastWorkoutDays.length >= 2) {
    const ranked = [...pastWorkoutDays].sort((a, b) => (a.completionPct ?? 0) - (b.completionPct ?? 0));
    const weakest = ranked[0];
    const strongest = ranked[ranked.length - 1];
    if (weakest.completionPct != null && strongest.completionPct != null && weakest.date !== strongest.date) {
      if (weakest.completionPct < 100) {
        insights.push(
          `Weakest day so far: ${weakest.label} (${weakest.done}/${weakest.planned}). Strongest: ${strongest.label} (${strongest.done}/${strongest.planned}).`
        );
      }
    }
  }

  const missed = summary.days.filter((day) => day.kind === 'missed');
  if (missed.length) {
    insights.push(`Workouts not finished on ${formatDayList(missed.map((day) => day.date))}. Worth a direct check-in.`);
  }

  const inProgress = summary.days.filter((day) => day.kind === 'partial' || day.kind === 'today');
  if (inProgress.length) {
    insights.push(`In progress on ${formatDayList(inProgress.map((day) => day.date))}.`);
  }

  const complete = summary.days.filter((day) => day.kind === 'complete');
  if (complete.length) {
    insights.push(`Fully completed: ${formatDayList(complete.map((day) => day.date))}.`);
  }

  if (summary.topSkipped.length > 0) {
    const top = summary.topSkipped[0];
    if (top.count > 1) {
      insights.push(
        `${top.name} was skipped ${top.count} time(s) — consider swapping, scaling down, or coaching confidence on that movement.`
      );
    } else if (summary.skipped > 0) {
      insights.push(
        `Skipped: ${summary.topSkipped.map((item) => item.name).join(', ')}. Ask if those felt too hard, unfamiliar, or poorly timed.`
      );
    }
  } else if (summary.skipped > 0) {
    insights.push(
      `${summary.skipped} exercise(s) skipped — the plan may be too aggressive, unfamiliar, or not the right fit.`
    );
  }

  const dominant = summary.bodyPartMix[0];
  if (dominant && summary.bodyPartMix.length > 1) {
    const underworked = summary.bodyPartMix.filter(
      (part) => part.planned >= 2 && part.done === 0 && part.skipped === 0
    );
    if (underworked.length) {
      insights.push(
        `No completions yet for ${underworked.map((part) => part.bodyPart).join(', ')} — check balance or barriers on those days.`
      );
    }
  }

  const upcomingPlanned = summary.days
    .filter((day) => isFuture(day.date))
    .reduce((sum, day) => sum + day.stillPlanned, 0);
  if (upcomingPlanned > 0) {
    insights.push(`${upcomingPlanned} exercise(s) still planned on upcoming days.`);
  }

  if (summary.restDays > 0) {
    insights.push(`${summary.restDays} rest day(s) with no exercises scheduled.`);
  }

  return insights;
}

function computeWeekCore(days: DayExercises[], weekDates: string[]) {
  const dayMap = new Map(days.map((day) => [day.date, day.exercises]));

  let scheduled = 0;
  let done = 0;
  let skipped = 0;
  let stillPlanned = 0;
  let restDays = 0;
  let workoutDays = 0;
  let pastScheduled = 0;
  let pastDone = 0;

  const dayAnalyses: ExerciseDayAnalysis[] = weekDates.map((date) => {
    const exercises = dayMap.get(date) ?? [];
    const dayDone = dayDoneCount(exercises);
    const daySkipped = exercises.filter((item) => item.status === 'SKIPPED').length;
    const dayStillPlanned = exercises.filter((item) => item.status === 'PLANNED').length;

    scheduled += exercises.length;
    done += dayDone;
    skipped += daySkipped;
    stillPlanned += dayStillPlanned;

    if (exercises.length === 0) {
      restDays += 1;
    } else {
      workoutDays += 1;
    }

    if (!isFuture(date) && exercises.length > 0) {
      pastScheduled += exercises.length;
      pastDone += dayDone;
    }

    return {
      date,
      kind: dayKind(date, exercises),
      done: dayDone,
      planned: exercises.length,
      skipped: daySkipped,
      stillPlanned: dayStillPlanned
    };
  });

  const completionPct = pastScheduled > 0 ? Math.round((pastDone / pastScheduled) * 100) : null;

  return {
    scheduled,
    done,
    skipped,
    stillPlanned,
    restDays,
    workoutDays,
    pastScheduled,
    pastDone,
    completionPct,
    days: dayAnalyses
  };
}

export function analyzeExerciseWeek(
  days: DayExercises[],
  weekDates: string[],
  options?: { previousDays?: DayExercises[]; previousWeekDates?: string[] }
): ExerciseWeekAnalysis {
  const core = computeWeekCore(days, weekDates);
  const dayPattern = buildDayPattern(core.days);
  const topSkipped = buildTopSkipped(days);
  const bodyPartMix = buildBodyPartMix(days);

  let comparison: WeekComparison | null = null;
  if (options?.previousDays && options?.previousWeekDates) {
    const previousCore = computeWeekCore(options.previousDays, options.previousWeekDates);
    comparison = compareWeeks(core, previousCore);
  }

  const partial: Omit<ExerciseWeekAnalysis, 'insights'> = {
    ...core,
    comparison,
    dayPattern,
    topSkipped,
    bodyPartMix
  };

  return {
    ...partial,
    insights: buildInsights(partial, comparison)
  };
}

export function previousWeekDates(anchorDate: string): string[] {
  const weekStart = startOfWeek(anchorDate);
  const previousStart = addDays(weekStart, -7);
  return Array.from({ length: 7 }, (_, index) => addDays(previousStart, index));
}

export function dayAnalysisProgressLabel(day: ExerciseDayAnalysis): string {
  if (day.planned === 0) return 'Rest day';
  if (day.kind === 'future') return `${day.planned} scheduled`;
  if (day.kind === 'complete') return `${day.done} of ${day.planned} done`;
  if (day.kind === 'missed') return `0 of ${day.planned} done`;
  if (day.kind === 'skipped_only') return `${day.skipped} skipped`;
  if (day.kind === 'today') return `${day.done} of ${day.planned} so far`;
  return `${day.done} of ${day.planned} done`;
}

export function comparisonTrendLabel(comparison: WeekComparison, currentPct: number | null): string | null {
  if (comparison.completionDelta == null || comparison.previousCompletionPct == null || currentPct == null) {
    return null;
  }
  const sign = comparison.completionDelta > 0 ? '+' : '';
  return `${sign}${comparison.completionDelta}% vs last week (${comparison.previousCompletionPct}% → ${currentPct}%)`;
}
