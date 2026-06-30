import type { Meal, MealItem, MealStatus } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { addUtcDays, parseDateParam, toDateKey, userDayKey } from '../utils/dates.js';
import { n } from '../utils/numbers.js';

type MealWithItems = Meal & { items: MealItem[] };

type DayMeals = {
  date: string;
  meals: MealWithItems[];
};

export type WeeklyReviewDayKind = 'no_plan' | 'future' | 'today' | 'on_plan' | 'partial' | 'over' | 'missed';

export type WeeklyReviewDay = {
  date: string;
  label: string;
  plannedMeals: number;
  onPlanMeals: number;
  modifiedMeals: number;
  missedMeals: number;
  plannedKcal: number;
  actualKcal: number;
  adherencePct: number | null;
  kind: WeeklyReviewDayKind;
};

export type WeeklyReview = {
  weekStart: string;
  weekEnd: string;
  adherencePct: number | null;
  pastPlannedMeals: number;
  pastOnPlanMeals: number;
  modifiedMeals: number;
  missedMeals: number;
  topMissedMeals: { name: string; count: number }[];
  offPlanFoods: { name: string; count: number }[];
  weakestDay: { date: string; label: string; adherencePct: number } | null;
  strongestDay: { date: string; label: string; adherencePct: number } | null;
  proteinGapGrams: number | null;
  proteinActual: number;
  proteinPlanned: number;
  carbsActual: number;
  carbsPlanned: number;
  fatActual: number;
  fatPlanned: number;
  plannedKcal: number;
  actualKcal: number;
  days: WeeklyReviewDay[];
  weightTrend: { date: string; weight: number }[];
  highlights: string[];
};

function startOfWeekMonday(dateKey: string) {
  const date = parseDateParam(dateKey);
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return toDateKey(date);
}

function weekDatesFromStart(weekStart: string) {
  const dates: string[] = [];
  const start = parseDateParam(weekStart);
  for (let i = 0; i < 7; i += 1) {
    dates.push(toDateKey(addUtcDays(start, i)));
  }
  return dates;
}

function formatDayAbbrev(dateKey: string) {
  const date = parseDateParam(dateKey);
  return date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
}

function isFuture(dateKey: string, todayKey: string) {
  return dateKey > todayKey;
}

function isToday(dateKey: string, todayKey: string) {
  return dateKey === todayKey;
}

function plannedItemsOf(meal: MealWithItems) {
  return meal.items.filter((item) => item.type === 'PLANNED');
}

function extraActualItemsOf(meal: MealWithItems) {
  return meal.items.filter((item) => item.type === 'ACTUAL' && !item.linkedPlannedItemId);
}

function mealHasPlan(meal: MealWithItems) {
  return n(meal.plannedCalories) > 0 || plannedItemsOf(meal).length > 0;
}

function classifyMeal(
  meal: MealWithItems,
  dateKey: string,
  todayKey: string
): 'on_plan' | 'modified' | 'missed' | 'unplanned' | 'pending' {
  const status = meal.status as MealStatus;
  if (status === 'EATEN_AS_PLANNED') return 'on_plan';
  if (status === 'MODIFIED') return 'modified';
  if (status === 'UNPLANNED') return 'unplanned';
  if (status === 'MISSED' || status === 'SKIPPED') return 'missed';
  if (isFuture(dateKey, todayKey) || isToday(dateKey, todayKey)) return 'pending';
  if (n(meal.actualCalories) > 0) return 'modified';
  return 'missed';
}

function buildTopMissed(days: DayMeals[], todayKey: string, limit = 3) {
  const counts = new Map<string, number>();
  for (const day of days) {
    if (isFuture(day.date, todayKey)) continue;
    for (const meal of day.meals) {
      if (!mealHasPlan(meal)) continue;
      if (classifyMeal(meal, day.date, todayKey) !== 'missed') continue;
      counts.set(meal.name, (counts.get(meal.name) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

function buildOffPlanFoods(days: DayMeals[], limit = 3) {
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

function computeDayKind(
  date: string,
  todayKey: string,
  planned: number,
  onPlan: number,
  modified: number,
  missed: number,
  plannedKcal: number,
  actualKcal: number
): WeeklyReviewDayKind {
  if (planned === 0) return 'no_plan';
  if (isFuture(date, todayKey)) return 'future';
  if (plannedKcal > 0 && actualKcal > plannedKcal * 1.1) return 'over';
  if (missed === planned) return 'missed';
  if (onPlan === planned) return 'on_plan';
  if (onPlan > 0 || modified > 0) return 'partial';
  if (isToday(date, todayKey)) return 'today';
  return 'missed';
}

function computeWeekReview(days: DayMeals[], weekDates: string[], todayKey: string) {
  const dayMap = new Map(days.map((day) => [day.date, day.meals]));
  let pastPlannedMeals = 0;
  let pastOnPlanMeals = 0;
  let modifiedMeals = 0;
  let missedMeals = 0;
  let proteinActual = 0;
  let proteinPlanned = 0;
  let carbsActual = 0;
  let carbsPlanned = 0;
  let fatActual = 0;
  let fatPlanned = 0;
  let plannedKcal = 0;
  let actualKcal = 0;

  const dayEntries: WeeklyReviewDay[] = [];
  const dayScores: { date: string; label: string; adherencePct: number }[] = [];

  for (const date of weekDates) {
    const meals = dayMap.get(date) ?? [];
    const withPlan = meals.filter(mealHasPlan);
    let onPlan = 0;
    let modified = 0;
    let missed = 0;

    for (const meal of withPlan) {
      const status = classifyMeal(meal, date, todayKey);
      if (status === 'on_plan') onPlan += 1;
      else if (status === 'modified') modified += 1;
      else if (status === 'missed') missed += 1;
    }

    let dayPlannedKcal = 0;
    let dayActualKcal = 0;
    for (const meal of meals) {
      proteinActual += n(meal.actualProtein);
      proteinPlanned += n(meal.plannedProtein);
      carbsActual += n(meal.actualCarbs);
      carbsPlanned += n(meal.plannedCarbs);
      fatActual += n(meal.actualFat);
      fatPlanned += n(meal.plannedFat);
      dayPlannedKcal += n(meal.plannedCalories);
      dayActualKcal += n(meal.actualCalories);
    }
    plannedKcal += dayPlannedKcal;
    actualKcal += dayActualKcal;

    modifiedMeals += modified;
    missedMeals += missed;

    const dayAdherencePct = withPlan.length > 0 ? Math.round((onPlan / withPlan.length) * 100) : null;

    if (!isFuture(date, todayKey) && withPlan.length > 0) {
      pastPlannedMeals += withPlan.length;
      pastOnPlanMeals += onPlan;
      dayScores.push({
        date,
        label: formatDayAbbrev(date),
        adherencePct: dayAdherencePct ?? 0
      });
    }

    dayEntries.push({
      date,
      label: formatDayAbbrev(date),
      plannedMeals: withPlan.length,
      onPlanMeals: onPlan,
      modifiedMeals: modified,
      missedMeals: missed,
      plannedKcal: Math.round(dayPlannedKcal),
      actualKcal: Math.round(dayActualKcal),
      adherencePct: dayAdherencePct,
      kind: computeDayKind(date, todayKey, withPlan.length, onPlan, modified, missed, dayPlannedKcal, dayActualKcal)
    });
  }

  const adherencePct =
    pastPlannedMeals > 0 ? Math.round((pastOnPlanMeals / pastPlannedMeals) * 100) : null;

  const ranked = [...dayScores].sort((a, b) => a.adherencePct - b.adherencePct);
  const weakestDay = ranked.find((day) => day.adherencePct < 100) ?? ranked[0] ?? null;
  const strongestDay = ranked.length ? ranked[ranked.length - 1] : null;

  return {
    adherencePct,
    pastPlannedMeals,
    pastOnPlanMeals,
    modifiedMeals,
    missedMeals,
    proteinActual: Math.round(proteinActual),
    proteinPlanned: Math.round(proteinPlanned),
    carbsActual: Math.round(carbsActual),
    carbsPlanned: Math.round(carbsPlanned),
    fatActual: Math.round(fatActual),
    fatPlanned: Math.round(fatPlanned),
    plannedKcal: Math.round(plannedKcal),
    actualKcal: Math.round(actualKcal),
    days: dayEntries,
    proteinGapGrams:
      proteinPlanned > 0 && proteinPlanned - proteinActual >= 15
        ? Math.round(proteinPlanned - proteinActual)
        : null,
    weakestDay: weakestDay
      ? { date: weakestDay.date, label: weakestDay.label, adherencePct: weakestDay.adherencePct }
      : null,
    strongestDay:
      strongestDay && weakestDay && strongestDay.date !== weakestDay.date
        ? { date: strongestDay.date, label: strongestDay.label, adherencePct: strongestDay.adherencePct }
        : strongestDay
          ? { date: strongestDay.date, label: strongestDay.label, adherencePct: strongestDay.adherencePct }
          : null
  };
}

function buildHighlights(review: Omit<WeeklyReview, 'highlights' | 'weekStart' | 'weekEnd'>) {
  const highlights: string[] = [];
  if (review.adherencePct != null && review.pastPlannedMeals > 0) {
    highlights.push(
      `${review.pastOnPlanMeals} of ${review.pastPlannedMeals} planned meals eaten on plan (${review.adherencePct}%).`
    );
  }
  if (review.topMissedMeals[0]) {
    const top = review.topMissedMeals[0];
    highlights.push(
      top.count > 1 ? `${top.name} was missed ${top.count} times.` : `Missed meal slot: ${top.name}.`
    );
  }
  if (review.offPlanFoods.length) {
    highlights.push(`Off-plan extras included ${review.offPlanFoods.map((f) => f.name).join(', ')}.`);
  }
  if (review.weakestDay && review.strongestDay && review.weakestDay.date !== review.strongestDay.date) {
    highlights.push(
      `Strongest day: ${review.strongestDay.label}. Tougher day: ${review.weakestDay.label}.`
    );
  }
  if (review.proteinGapGrams != null) {
    highlights.push(`Protein ran about ${review.proteinGapGrams}g below plan for the week.`);
  }
  if (review.weightTrend.length >= 2) {
    const first = review.weightTrend[0];
    const last = review.weightTrend[review.weightTrend.length - 1];
    const delta = Math.round((last.weight - first.weight) * 10) / 10;
    if (delta !== 0) {
      highlights.push(`Weight ${delta > 0 ? 'up' : 'down'} ${Math.abs(delta)} over logged days.`);
    }
  }
  if (!highlights.length) {
    highlights.push('Limited meal data this week — focus the conversation on how they felt and what they want next.');
  }
  return highlights;
}

export async function getWeeklyReview(userId: string, timeZone?: string | null): Promise<WeeklyReview> {
  const todayKey = userDayKey(timeZone);
  const weekStart = startOfWeekMonday(todayKey);
  const weekDates = weekDatesFromStart(weekStart);
  const weekEnd = weekDates[6];

  const logs = await prisma.dailyLog.findMany({
    where: {
      userId,
      date: { gte: parseDateParam(weekStart), lte: parseDateParam(weekEnd) }
    },
    include: {
      meals: { include: { items: true }, orderBy: { mealNumber: 'asc' } }
    },
    orderBy: { date: 'asc' }
  });

  const days: DayMeals[] = logs.map((log) => ({
    date: toDateKey(log.date),
    meals: log.meals
  }));

  const core = computeWeekReview(days, weekDates, todayKey);
  const topMissedMeals = buildTopMissed(days, todayKey);
  const offPlanFoods = buildOffPlanFoods(days);

  const weightLogs = await prisma.dailyLog.findMany({
    where: { userId, weight: { not: null }, date: { gte: parseDateParam(weekStart), lte: parseDateParam(weekEnd) } },
    orderBy: { date: 'asc' },
    select: { date: true, weight: true }
  });

  const weightTrend = weightLogs.map((log) => ({
    date: toDateKey(log.date),
    weight: n(log.weight)
  }));

  const partial = {
    ...core,
    topMissedMeals,
    offPlanFoods,
    weightTrend
  };

  return {
    weekStart,
    weekEnd,
    ...partial,
    highlights: buildHighlights(partial)
  };
}

export { startOfWeekMonday, weekDatesFromStart };
