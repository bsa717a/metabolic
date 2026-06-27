import { formatDayAbbrev, isFuture, isToday } from '../services/api';
import type { Meal } from '../types';
import {
  dayActualKcal,
  dayKcalTargetStatus,
  dayPlannedKcal,
  extraActualItemsOf,
  plannedItemsOf,
  type DayMeals
} from '../components/nutrition/weekly/weeklyHelpers';
import type { WeekComparison } from './exerciseWeekAnalysis';
import { previousWeekDates } from './exerciseWeekAnalysis';

export type NutritionDayAnalysisKind =
  | 'no_plan'
  | 'future'
  | 'today'
  | 'on_plan'
  | 'partial'
  | 'over'
  | 'missed';

export type NutritionDayAnalysis = {
  date: string;
  kind: NutritionDayAnalysisKind;
  plannedMeals: number;
  onPlanMeals: number;
  modifiedMeals: number;
  missedMeals: number;
  plannedKcal: number;
  actualKcal: number;
};

export type NutritionDayPatternEntry = {
  date: string;
  label: string;
  completionPct: number | null;
  done: number;
  planned: number;
  kind: NutritionDayAnalysisKind;
  adherencePct: number | null;
};

export type MissedMealSummary = {
  name: string;
  count: number;
};

export type OffPlanFoodSummary = {
  name: string;
  count: number;
};

export type MacroSummary = {
  label: string;
  planned: number;
  actual: number;
  unit: string;
};

export type NutritionWeekAnalysis = {
  plannedMeals: number;
  onPlanMeals: number;
  modifiedMeals: number;
  missedMeals: number;
  unplannedMeals: number;
  noPlanDays: number;
  plannedDays: number;
  pastPlannedMeals: number;
  pastOnPlanMeals: number;
  adherencePct: number | null;
  plannedKcal: number;
  actualKcal: number;
  plannedProtein: number;
  actualProtein: number;
  plannedCarbs: number;
  actualCarbs: number;
  plannedFat: number;
  actualFat: number;
  days: NutritionDayAnalysis[];
  insights: string[];
  comparison: WeekComparison | null;
  dayPattern: NutritionDayPatternEntry[];
  topMissed: MissedMealSummary[];
  offPlanFoods: OffPlanFoodSummary[];
  macroMix: MacroSummary[];
};

function mealHasPlan(meal: Meal): boolean {
  return Number(meal.plannedCalories) > 0 || plannedItemsOf(meal).length > 0;
}

function classifyMeal(meal: Meal, date: string): 'on_plan' | 'modified' | 'missed' | 'unplanned' | 'pending' {
  if (meal.status === 'EATEN_AS_PLANNED') return 'on_plan';
  if (meal.status === 'MODIFIED') return 'modified';
  if (meal.status === 'UNPLANNED') return 'unplanned';
  if (meal.status === 'MISSED' || meal.status === 'SKIPPED') return 'missed';

  if (isFuture(date)) return 'pending';
  if (isToday(date)) return 'pending';

  const actual = Number(meal.actualCalories);
  if (actual > 0) return 'modified';
  return 'missed';
}

function dayKind(date: string, meals: Meal[]): NutritionDayAnalysisKind {
  const withPlan = meals.filter(mealHasPlan);
  if (!withPlan.length) return 'no_plan';
  if (isFuture(date)) return 'future';

  const plannedKcal = Math.round(dayPlannedKcal(meals));
  const actualKcal = Math.round(dayActualKcal(meals));
  const kcalStatus = dayKcalTargetStatus(actualKcal, plannedKcal, date);

  const classified = withPlan.map((meal) => classifyMeal(meal, date));
  const onPlan = classified.filter((status) => status === 'on_plan').length;
  const modified = classified.filter((status) => status === 'modified').length;
  const missed = classified.filter((status) => status === 'missed').length;
  const pending = classified.filter((status) => status === 'pending').length;

  if (kcalStatus === 'over') return 'over';
  if (isToday(date) && pending > 0 && onPlan + modified === 0) return 'today';
  if (missed === withPlan.length) return 'missed';
  if (onPlan === withPlan.length) return 'on_plan';
  if (onPlan > 0 || modified > 0) return 'partial';
  if (isToday(date)) return 'today';
  return 'missed';
}

function formatDayList(dates: string[]) {
  const labels = dates.map((date) => formatDayAbbrev(date));
  if (labels.length === 0) return '';
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}

function compareWeeks(
  current: Pick<NutritionWeekAnalysis, 'adherencePct' | 'onPlanMeals' | 'plannedMeals'>,
  previous: Pick<NutritionWeekAnalysis, 'adherencePct' | 'onPlanMeals' | 'plannedMeals'>
): WeekComparison | null {
  if (current.adherencePct == null && previous.adherencePct == null) return null;

  const completionDelta =
    current.adherencePct != null && previous.adherencePct != null
      ? current.adherencePct - previous.adherencePct
      : null;

  let trend: WeekComparison['trend'] = 'unknown';
  if (completionDelta != null) {
    if (completionDelta > 0) trend = 'up';
    else if (completionDelta < 0) trend = 'down';
    else trend = 'flat';
  }

  return {
    previousCompletionPct: previous.adherencePct,
    completionDelta,
    trend,
    previousDone: previous.onPlanMeals,
    previousScheduled: previous.plannedMeals,
    doneDelta: current.onPlanMeals - previous.onPlanMeals
  };
}

function buildDayPattern(dayAnalyses: NutritionDayAnalysis[]): NutritionDayPatternEntry[] {
  return dayAnalyses.map((day) => {
    const adherencePct =
      day.plannedMeals > 0 ? Math.round((day.onPlanMeals / day.plannedMeals) * 100) : null;
    const kcalPct =
      day.plannedKcal > 0 ? Math.min(100, Math.round((day.actualKcal / day.plannedKcal) * 100)) : null;

    return {
      date: day.date,
      label: formatDayAbbrev(day.date),
      completionPct: kcalPct,
      done: day.onPlanMeals,
      planned: day.plannedMeals,
      kind: day.kind,
      adherencePct
    };
  });
}

function buildTopMissed(days: DayMeals[], limit = 5): MissedMealSummary[] {
  const counts = new Map<string, number>();
  for (const day of days) {
    if (isFuture(day.date)) continue;
    for (const meal of day.meals) {
      if (!mealHasPlan(meal)) continue;
      const status = classifyMeal(meal, day.date);
      if (status !== 'missed') continue;
      counts.set(meal.name, (counts.get(meal.name) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

function buildOffPlanFoods(days: DayMeals[], limit = 5): OffPlanFoodSummary[] {
  const counts = new Map<string, number>();
  for (const day of days) {
    for (const meal of day.meals) {
      for (const item of extraActualItemsOf(meal)) {
        const name = item.nameSnapshot.trim();
        if (!name) continue;
        counts.set(name, (counts.get(name) ?? 0) + 1);
      }
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

function sumMealMacros(meals: Meal[]) {
  return meals.reduce(
    (sum, meal) => ({
      plannedKcal: sum.plannedKcal + Number(meal.plannedCalories),
      actualKcal: sum.actualKcal + Number(meal.actualCalories),
      plannedProtein: sum.plannedProtein + Number(meal.plannedProtein),
      actualProtein: sum.actualProtein + Number(meal.actualProtein),
      plannedCarbs: sum.plannedCarbs + Number(meal.plannedCarbs),
      actualCarbs: sum.actualCarbs + Number(meal.actualCarbs),
      plannedFat: sum.plannedFat + Number(meal.plannedFat),
      actualFat: sum.actualFat + Number(meal.actualFat)
    }),
    {
      plannedKcal: 0,
      actualKcal: 0,
      plannedProtein: 0,
      actualProtein: 0,
      plannedCarbs: 0,
      actualCarbs: 0,
      plannedFat: 0,
      actualFat: 0
    }
  );
}

function buildMacroMix(macroTotals: ReturnType<typeof sumMealMacros>): MacroSummary[] {
  return [
    {
      label: 'Protein',
      planned: Math.round(macroTotals.plannedProtein),
      actual: Math.round(macroTotals.actualProtein),
      unit: 'g'
    },
    {
      label: 'Carbs',
      planned: Math.round(macroTotals.plannedCarbs),
      actual: Math.round(macroTotals.actualCarbs),
      unit: 'g'
    },
    {
      label: 'Fat',
      planned: Math.round(macroTotals.plannedFat),
      actual: Math.round(macroTotals.actualFat),
      unit: 'g'
    }
  ];
}

function buildInsights(
  summary: Omit<NutritionWeekAnalysis, 'insights'>,
  comparison: WeekComparison | null
): string[] {
  const insights: string[] = [];

  if (summary.plannedMeals === 0) {
    insights.push('No meals were planned this week. Build a plan together or apply a template.');
    if (summary.noPlanDays > 0) {
      insights.push(`${summary.noPlanDays} day(s) with nothing on the food plan.`);
    }
    return insights;
  }

  if (
    comparison?.completionDelta != null &&
    comparison.previousCompletionPct != null &&
    summary.adherencePct != null
  ) {
    const delta = comparison.completionDelta;
    const abs = Math.abs(delta);
    if (delta > 0) {
      insights.push(
        `On-plan adherence improved ${abs}% vs last week (${comparison.previousCompletionPct}% → ${summary.adherencePct}%). Celebrate consistency.`
      );
    } else if (delta < 0) {
      insights.push(
        `On-plan adherence dropped ${abs}% vs last week (${comparison.previousCompletionPct}% → ${summary.adherencePct}%). Ask what made eating on plan harder.`
      );
    } else {
      insights.push(
        `On-plan adherence matched last week (${summary.adherencePct}%). Steady — check if macros and meal timing still fit their life.`
      );
    }
  }

  if (summary.pastPlannedMeals > 0 && summary.adherencePct != null) {
    insights.push(
      `${summary.pastOnPlanMeals} of ${summary.pastPlannedMeals} planned meals eaten on plan (${summary.adherencePct}%) through today.`
    );
  } else if (summary.days.every((day) => isFuture(day.date) || day.plannedMeals === 0)) {
    insights.push('This week is still ahead — meals are planned but none are in the past yet.');
  }

  const pastDays = summary.dayPattern.filter((day) => day.planned > 0 && !isFuture(day.date));
  if (pastDays.length >= 2) {
    const ranked = [...pastDays].sort((a, b) => (a.adherencePct ?? 0) - (b.adherencePct ?? 0));
    const weakest = ranked[0];
    const strongest = ranked[ranked.length - 1];
    if (weakest.adherencePct != null && strongest.adherencePct != null && weakest.date !== strongest.date) {
      if (weakest.adherencePct < 100) {
        insights.push(
          `Weakest day so far: ${weakest.label} (${weakest.done}/${weakest.planned} meals on plan). Strongest: ${strongest.label} (${strongest.done}/${strongest.planned}).`
        );
      }
    }
  }

  const missedDays = summary.days.filter((day) => day.kind === 'missed');
  if (missedDays.length) {
    insights.push(`No on-plan eating on ${formatDayList(missedDays.map((day) => day.date))}. Worth a direct check-in.`);
  }

  const overDays = summary.days.filter((day) => day.kind === 'over');
  if (overDays.length) {
    insights.push(`Calories over plan on ${formatDayList(overDays.map((day) => day.date))}. Review portions or off-plan extras.`);
  }

  const inProgress = summary.days.filter((day) => day.kind === 'partial' || day.kind === 'today');
  if (inProgress.length) {
    insights.push(`Still in progress on ${formatDayList(inProgress.map((day) => day.date))}.`);
  }

  const onPlanDays = summary.days.filter((day) => day.kind === 'on_plan');
  if (onPlanDays.length) {
    insights.push(`Fully on plan: ${formatDayList(onPlanDays.map((day) => day.date))}.`);
  }

  if (summary.modifiedMeals > 0) {
    insights.push(
      `${summary.modifiedMeals} meal(s) logged with changes — swaps are fine; note what they substituted and whether portions shifted.`
    );
  }

  if (summary.topMissed.length > 0) {
    const top = summary.topMissed[0];
    if (top.count > 1) {
      insights.push(
        `${top.name} was missed ${top.count} time(s) — consider simpler options, reminders, or adjusting that slot.`
      );
    } else if (summary.missedMeals > 0) {
      insights.push(`Missed: ${summary.topMissed.map((item) => item.name).join(', ')}. Ask if timing, prep, or appetite was the blocker.`);
    }
  } else if (summary.missedMeals > 0) {
    insights.push(`${summary.missedMeals} planned meal(s) missed — the schedule may be too tight or meals too complex.`);
  }

  if (summary.offPlanFoods.length > 0) {
    const frequent = summary.offPlanFoods.filter((item) => item.count > 1);
    if (frequent.length) {
      insights.push(
        `Recurring off-plan foods: ${frequent.map((item) => item.name).join(', ')}. Build those into the plan or coach around triggers.`
      );
    } else if (summary.unplannedMeals > 0) {
      insights.push(`Off-plan extras logged — ${summary.offPlanFoods.map((item) => item.name).join(', ')}.`);
    }
  }

  const protein = summary.macroMix.find((macro) => macro.label === 'Protein');
  if (protein && protein.planned > 0) {
    const proteinGap = protein.planned - protein.actual;
    if (proteinGap >= 30 && summary.actualKcal > 0) {
      insights.push(
        `Protein is ${proteinGap}g below plan (${protein.actual}g vs ${protein.planned}g planned). Prioritize protein at the next meals you coach on.`
      );
    }
  }

  const upcoming = summary.days
    .filter((day) => isFuture(day.date))
    .reduce((sum, day) => sum + day.plannedMeals, 0);
  if (upcoming > 0) {
    insights.push(`${upcoming} meal(s) still planned on upcoming days.`);
  }

  if (summary.noPlanDays > 0) {
    insights.push(`${summary.noPlanDays} day(s) with no food plan scheduled.`);
  }

  return insights;
}

function computeWeekCore(days: DayMeals[], weekDates: string[]) {
  const dayMap = new Map(days.map((day) => [day.date, day.meals]));

  let plannedMeals = 0;
  let onPlanMeals = 0;
  let modifiedMeals = 0;
  let missedMeals = 0;
  let unplannedMeals = 0;
  let noPlanDays = 0;
  let plannedDays = 0;
  let pastPlannedMeals = 0;
  let pastOnPlanMeals = 0;

  const allMeals = days.flatMap((day) => day.meals);
  const macroTotals = sumMealMacros(allMeals);

  const dayAnalyses: NutritionDayAnalysis[] = weekDates.map((date) => {
    const meals = dayMap.get(date) ?? [];
    const withPlan = meals.filter(mealHasPlan);
    let dayOnPlan = 0;
    let dayModified = 0;
    let dayMissed = 0;

    for (const meal of withPlan) {
      const status = classifyMeal(meal, date);
      if (status === 'on_plan') dayOnPlan += 1;
      else if (status === 'modified') dayModified += 1;
      else if (status === 'missed') dayMissed += 1;
      else if (status === 'unplanned') unplannedMeals += 1;
    }

    for (const meal of meals) {
      if (meal.status === 'UNPLANNED') unplannedMeals += 1;
    }

    plannedMeals += withPlan.length;
    onPlanMeals += dayOnPlan;
    modifiedMeals += dayModified;
    missedMeals += dayMissed;

    if (withPlan.length === 0) {
      noPlanDays += 1;
    } else {
      plannedDays += 1;
    }

    if (!isFuture(date) && withPlan.length > 0) {
      pastPlannedMeals += withPlan.length;
      pastOnPlanMeals += dayOnPlan;
    }

    return {
      date,
      kind: dayKind(date, meals),
      plannedMeals: withPlan.length,
      onPlanMeals: dayOnPlan,
      modifiedMeals: dayModified,
      missedMeals: dayMissed,
      plannedKcal: Math.round(dayPlannedKcal(meals)),
      actualKcal: Math.round(dayActualKcal(meals))
    };
  });

  const adherencePct =
    pastPlannedMeals > 0 ? Math.round((pastOnPlanMeals / pastPlannedMeals) * 100) : null;

  return {
    plannedMeals,
    onPlanMeals,
    modifiedMeals,
    missedMeals,
    unplannedMeals,
    noPlanDays,
    plannedDays,
    pastPlannedMeals,
    pastOnPlanMeals,
    adherencePct,
    plannedKcal: Math.round(macroTotals.plannedKcal),
    actualKcal: Math.round(macroTotals.actualKcal),
    plannedProtein: Math.round(macroTotals.plannedProtein),
    actualProtein: Math.round(macroTotals.actualProtein),
    plannedCarbs: Math.round(macroTotals.plannedCarbs),
    actualCarbs: Math.round(macroTotals.actualCarbs),
    plannedFat: Math.round(macroTotals.plannedFat),
    actualFat: Math.round(macroTotals.actualFat),
    days: dayAnalyses
  };
}

export function analyzeNutritionWeek(
  days: DayMeals[],
  weekDates: string[],
  options?: { previousDays?: DayMeals[]; previousWeekDates?: string[] }
): NutritionWeekAnalysis {
  const core = computeWeekCore(days, weekDates);
  const dayPattern = buildDayPattern(core.days);
  const topMissed = buildTopMissed(days);
  const offPlanFoods = buildOffPlanFoods(days);
  const macroMix = buildMacroMix(
    sumMealMacros(days.flatMap((day) => day.meals))
  );

  let comparison: WeekComparison | null = null;
  if (options?.previousDays && options?.previousWeekDates) {
    const previousCore = computeWeekCore(options.previousDays, options.previousWeekDates);
    comparison = compareWeeks(core, previousCore);
  }

  const partial: Omit<NutritionWeekAnalysis, 'insights'> = {
    ...core,
    comparison,
    dayPattern,
    topMissed,
    offPlanFoods,
    macroMix
  };

  return {
    ...partial,
    insights: buildInsights(partial, comparison)
  };
}

export { previousWeekDates };

export function nutritionDayProgressLabel(day: NutritionDayAnalysis): string {
  if (day.plannedMeals === 0) return 'No plan';
  if (day.kind === 'future') return `${day.plannedMeals} planned`;
  if (day.kind === 'on_plan') return `${day.onPlanMeals} of ${day.plannedMeals} on plan`;
  if (day.kind === 'missed') return `0 of ${day.plannedMeals} on plan`;
  if (day.kind === 'over') return `${day.actualKcal}/${day.plannedKcal} kcal`;
  if (day.kind === 'today') return `${day.onPlanMeals} of ${day.plannedMeals} so far`;
  return `${day.onPlanMeals} of ${day.plannedMeals} on plan`;
}

export function nutritionAdherenceTrendLabel(
  comparison: WeekComparison,
  currentPct: number | null
): string | null {
  if (comparison.completionDelta == null || comparison.previousCompletionPct == null || currentPct == null) {
    return null;
  }
  const sign = comparison.completionDelta > 0 ? '+' : '';
  return `${sign}${comparison.completionDelta}% vs last week (${comparison.previousCompletionPct}% → ${currentPct}%)`;
}
