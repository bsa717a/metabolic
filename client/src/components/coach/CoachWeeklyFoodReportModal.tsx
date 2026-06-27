import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';
import { X } from 'lucide-react';
import {
  formatDayAbbrev,
  formatDayNumber,
  formatWeekRange,
  getWeekDates,
  isToday,
  startOfWeek
} from '../../services/api';
import type { Meal, MealItem } from '../../types';
import { WeekDateStrip } from '../nutrition/WeekDateStrip';
import {
  actualItemsOf,
  buildGridRows,
  dayActualKcal,
  dayKcalTargetStatus,
  dayPlannedKcal,
  extraActualItemsOf,
  findMeal,
  formatItemLine,
  isPlannedItemLogged,
  kcalTargetHighlightClass,
  mealKcalTargetStatus,
  plannedItemsOf,
  statusDotClass,
  statusLabel,
  type DayMeals
} from '../nutrition/weekly/weeklyHelpers';
import { fetchCoachMealsForDates } from '../../utils/planExportData';
import {
  analyzeNutritionWeek,
  nutritionAdherenceTrendLabel,
  nutritionDayProgressLabel,
  previousWeekDates,
  type NutritionDayAnalysis,
  type NutritionDayPatternEntry
} from '../../utils/nutritionWeekAnalysis';
import { printCoachNutritionWeekReport } from '../../utils/printCoachNutritionWeekReport';
import { Button } from '../ui/Button';

const GRID_TEMPLATE = { gridTemplateColumns: 'repeat(7, minmax(120px, 1fr))' } as const;

function ReportMealCell({ mealName, meal, date }: { mealName: string; meal?: Meal; date: string }) {
  const planned = meal ? plannedItemsOf(meal) : [];
  const actuals = meal ? actualItemsOf(meal) : [];
  const extras = meal ? extraActualItemsOf(meal) : [];
  const isEmpty = planned.length === 0 && extras.length === 0;
  const plannedKcal = meal ? Math.round(Number(meal.plannedCalories)) : 0;
  const actualKcal = meal ? Math.round(Number(meal.actualCalories)) : 0;
  const hasPlan = plannedKcal > 0 || !isEmpty;
  const targetStatus = mealKcalTargetStatus(actualKcal, plannedKcal, date, meal?.status);

  return (
    <div
      className={clsx(
        'flex min-h-[5rem] flex-col rounded-2xl border p-2',
        kcalTargetHighlightClass(targetStatus)
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="truncate text-xs font-semibold text-app-text">{mealName}</span>
        {hasPlan && (
          <span className="shrink-0 text-[0.7rem] tabular-nums text-app-text-muted">
            {actualKcal}/{plannedKcal}
          </span>
        )}
      </div>

      {!hasPlan ? (
        <span className="mt-1 text-xs italic text-app-text-muted">No plan</span>
      ) : (
        <>
          {meal && (
            <div className="mt-1 flex min-w-0 items-center gap-1">
              <span className={clsx('h-2 w-2 shrink-0 rounded-full', statusDotClass(meal.status))} />
              <span className="truncate text-[0.7rem] font-medium text-app-text-muted">{statusLabel(meal.status)}</span>
            </div>
          )}
          {!isEmpty && (
            <div className="mt-1.5 flex flex-col gap-0.5">
              {planned.map((item) => {
                const logged = isPlannedItemLogged(item, actuals);
                return <PlannedItemLine key={item.id} item={item} logged={logged} />;
              })}
              {extras.map((item) => (
                <div
                  key={item.id}
                  className="truncate rounded bg-brand-gold/15 px-1 py-0.5 text-[0.7rem] ring-1 ring-brand-gold/20"
                >
                  {formatItemLine(item)}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PlannedItemLine({ item, logged }: { item: MealItem; logged: boolean }) {
  return (
    <span
      className={clsx(
        'truncate text-[0.7rem] text-app-text',
        logged && 'text-app-text-muted line-through'
      )}
    >
      {formatItemLine(item)}
    </span>
  );
}

function DayPatternRow({ entry }: { entry: NutritionDayPatternEntry }) {
  const isEmpty = entry.planned === 0;
  const isFuture = entry.kind === 'future';
  const pct = entry.completionPct ?? 0;
  const isOver = entry.kind === 'over';

  return (
    <div className="flex items-center gap-3">
      <span className="w-9 text-xs font-semibold text-app-text-muted">{entry.label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-app-muted">
        {!isEmpty && !isFuture && (
          <div
            className={clsx(
              'h-full rounded-full transition-all',
              isOver ? 'bg-red-400' : pct >= 90 ? 'bg-brand-green' : pct > 0 ? 'bg-brand-gold' : 'bg-red-400'
            )}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        )}
      </div>
      <span className="w-24 text-right text-xs tabular-nums text-app-text-muted">
        {isEmpty
          ? 'No plan'
          : isFuture
            ? `${entry.planned} planned`
            : `${entry.done}/${entry.planned} on plan`}
      </span>
    </div>
  );
}

function AnalysisDayHeader({
  date,
  dayAnalysis,
  selected
}: {
  date: string;
  dayAnalysis: NutritionDayAnalysis;
  selected: boolean;
}) {
  const today = isToday(date);
  const meals = { plannedKcal: dayAnalysis.plannedKcal, actualKcal: dayAnalysis.actualKcal };
  const dayTargetStatus = dayKcalTargetStatus(meals.actualKcal, meals.plannedKcal, date);

  return (
    <div
      className={clsx(
        'flex flex-col items-center rounded-xl border px-2 py-1.5',
        kcalTargetHighlightClass(dayTargetStatus),
        selected && 'ring-2 ring-brand-green/40'
      )}
    >
      <span className="text-xs font-medium text-app-text-muted">{formatDayAbbrev(date)}</span>
      <span
        className={clsx(
          'text-base font-bold',
          today ? 'text-brand-green' : 'text-app-text',
          dayTargetStatus === 'over' && 'text-red-700 dark:text-red-300',
          dayTargetStatus === 'at_or_under' && 'text-brand-green'
        )}
      >
        {formatDayNumber(date)}
      </span>
      <span className="text-[0.65rem] text-app-text-muted">{nutritionDayProgressLabel(dayAnalysis)}</span>
    </div>
  );
}

export function CoachWeeklyFoodReportModal({
  open,
  clientId,
  clientName,
  anchorDate,
  onClose
}: {
  open: boolean;
  clientId: string;
  clientName?: string;
  anchorDate: string;
  onClose: () => void;
}) {
  const [selectedDate, setSelectedDate] = useState(anchorDate);
  const [days, setDays] = useState<DayMeals[]>([]);
  const [previousDays, setPreviousDays] = useState<DayMeals[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const weekStart = startOfWeek(selectedDate);
  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart]);
  const prevWeekDates = useMemo(() => previousWeekDates(selectedDate), [selectedDate]);
  const rows = useMemo(() => buildGridRows(days), [days]);

  const analysis = useMemo(
    () =>
      analyzeNutritionWeek(days, weekDates, {
        previousDays,
        previousWeekDates: prevWeekDates
      }),
    [days, weekDates, previousDays, prevWeekDates]
  );

  const trendLabel = analysis.comparison
    ? nutritionAdherenceTrendLabel(analysis.comparison, analysis.adherencePct)
    : null;

  useEffect(() => {
    if (open) setSelectedDate(anchorDate);
  }, [open, anchorDate]);

  const loadWeek = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [results, prevResults] = await Promise.all([
        fetchCoachMealsForDates(clientId, weekDates),
        fetchCoachMealsForDates(clientId, prevWeekDates)
      ]);
      setDays(results);
      setPreviousDays(prevResults);
    } catch (err) {
      setDays([]);
      setPreviousDays([]);
      setError(err instanceof Error ? err.message : 'Unable to load week analysis');
    } finally {
      setLoading(false);
    }
  }, [clientId, weekDates, prevWeekDates]);

  useEffect(() => {
    if (!open) return;
    void loadWeek();
  }, [open, loadWeek]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="weekly-food-analysis-title"
        className="relative z-10 flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-app-border bg-app-bg shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="shrink-0 border-b border-app-border px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="weekly-food-analysis-title" className="text-xl font-bold text-app-text">
                Week analysis
              </h2>
              <p className="text-sm text-app-text-muted">
                {formatWeekRange(weekStart)}
                {clientName ? ` · ${clientName}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={loading}
                onClick={() =>
                  printCoachNutritionWeekReport(days, weekDates, formatWeekRange(weekStart), {
                    clientName
                  })
                }
              >
                Print
              </Button>
              <button
                type="button"
                aria-label="Close week analysis"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-app-border text-app-text-muted transition hover:bg-app-muted hover:text-app-text"
                onClick={onClose}
              >
                <X size={18} />
              </button>
            </div>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-4">
            <WeekDateStrip selectedDate={selectedDate} onSelectDate={setSelectedDate} days={days} />

            {error && <p className="text-sm text-red-600">{error}</p>}
            {loading ? (
              <p className="text-sm text-app-text-muted">Loading week…</p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl bg-brand-green/10 p-3 ring-1 ring-brand-green/20">
                    <p className="text-xs font-semibold uppercase tracking-wide text-app-text-muted">On plan</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-app-text">
                      {analysis.adherencePct != null ? `${analysis.adherencePct}%` : '—'}
                    </p>
                    {trendLabel && (
                      <p
                        className={clsx(
                          'text-xs font-semibold',
                          analysis.comparison?.trend === 'up' && 'text-brand-green',
                          analysis.comparison?.trend === 'down' && 'text-red-600 dark:text-red-400',
                          analysis.comparison?.trend === 'flat' && 'text-app-text-muted'
                        )}
                      >
                        {trendLabel}
                      </p>
                    )}
                    {!trendLabel && <p className="text-xs text-app-text-muted">meals through today</p>}
                  </div>
                  <div className="rounded-xl bg-brand-gold/10 p-3 ring-1 ring-brand-gold/20">
                    <p className="text-xs font-semibold uppercase tracking-wide text-app-text-muted">Week planned</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-app-text">
                      {analysis.plannedKcal.toLocaleString()} kcal
                    </p>
                    <p className="text-xs text-app-text-muted">
                      {analysis.plannedMeals} meal{analysis.plannedMeals === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="rounded-xl bg-app-surface p-3 ring-1 ring-app-border">
                    <p className="text-xs font-semibold uppercase tracking-wide text-app-text-muted">Week ate</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-app-text">
                      {analysis.actualKcal ? analysis.actualKcal.toLocaleString() : '—'} kcal
                    </p>
                    <p className="text-xs text-app-text-muted">
                      {analysis.onPlanMeals} on plan · {analysis.modifiedMeals} modified
                    </p>
                  </div>
                  <div className="rounded-xl bg-app-surface p-3 ring-1 ring-app-border">
                    <p className="text-xs font-semibold uppercase tracking-wide text-app-text-muted">Missed</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-app-text">
                      {analysis.missedMeals || '—'}
                    </p>
                    <p className="text-xs text-app-text-muted">
                      {analysis.noPlanDays} day{analysis.noPlanDays === 1 ? '' : 's'} without a plan
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-app-border bg-app-surface p-4">
                    <p className="text-sm font-semibold text-app-text">Day-by-day pattern</p>
                    <p className="mt-0.5 text-xs text-app-text-muted">
                      Meals on plan and kcal vs plan — past and today only.
                    </p>
                    <div className="mt-3 space-y-2">
                      {analysis.dayPattern.map((entry) => (
                        <DayPatternRow key={entry.date} entry={entry} />
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    {analysis.topMissed.length > 0 && (
                      <div className="rounded-2xl border border-app-border bg-app-surface p-4">
                        <p className="text-sm font-semibold text-app-text">Often missed</p>
                        <p className="mt-0.5 text-xs text-app-text-muted">
                          Meal slots to simplify, remind, or reschedule.
                        </p>
                        <ul className="mt-3 space-y-2">
                          {analysis.topMissed.map((item) => (
                            <li
                              key={item.name}
                              className="flex items-center justify-between gap-2 text-sm text-app-text"
                            >
                              <span className="truncate">{item.name}</span>
                              <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-red-700 dark:bg-red-900/30 dark:text-red-300">
                                {item.count}× missed
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {analysis.offPlanFoods.length > 0 && (
                      <div className="rounded-2xl border border-app-border bg-app-surface p-4">
                        <p className="text-sm font-semibold text-app-text">Off-plan extras</p>
                        <p className="mt-0.5 text-xs text-app-text-muted">Foods logged outside the plan.</p>
                        <ul className="mt-3 space-y-2">
                          {analysis.offPlanFoods.map((item) => (
                            <li key={item.name} className="flex items-center justify-between gap-2 text-sm">
                              <span className="truncate text-app-text">{item.name}</span>
                              <span className="shrink-0 text-xs tabular-nums text-app-text-muted">
                                {item.count}× logged
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {analysis.macroMix.length > 0 && (
                      <div className="rounded-2xl border border-app-border bg-app-surface p-4">
                        <p className="text-sm font-semibold text-app-text">Macro mix</p>
                        <p className="mt-0.5 text-xs text-app-text-muted">Planned vs actual for the week.</p>
                        <ul className="mt-3 space-y-2">
                          {analysis.macroMix.map((macro) => (
                            <li key={macro.label} className="flex items-center justify-between gap-2 text-sm">
                              <span className="text-app-text">{macro.label}</span>
                              <span className="shrink-0 text-xs tabular-nums text-app-text-muted">
                                {macro.actual}/{macro.planned} {macro.unit}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-app-border bg-app-surface p-4">
                  <p className="text-sm font-semibold text-app-text">Coach takeaways</p>
                  <p className="mt-0.5 text-xs text-app-text-muted">
                    Use these notes to guide your next conversation with your client.
                  </p>
                  <ul className="mt-3 space-y-2">
                    {analysis.insights.map((insight) => (
                      <li key={insight} className="flex gap-2 text-sm text-app-text">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-green" />
                        <span>{insight}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {rows.length > 0 && (
                  <div className="rounded-2xl border border-app-border bg-white p-4 shadow-sm dark:bg-app-surface">
                    <div className="mb-3 flex flex-wrap items-end justify-between gap-2 border-b border-app-border pb-3">
                      <div>
                        <p className="text-sm font-semibold text-app-text">Week at a glance</p>
                        <p className="text-xs text-app-text-muted">
                          Planned meals, what they ate, and off-plan extras — same layout as print.
                        </p>
                      </div>
                    </div>

                    <div className="overflow-x-auto pb-2">
                      <div className="min-w-[840px] space-y-2">
                        <div className="grid items-end gap-2" style={GRID_TEMPLATE}>
                          {weekDates.map((date) => {
                            const dayAnalysis = analysis.days.find((day) => day.date === date);
                            if (!dayAnalysis) return null;
                            return (
                              <AnalysisDayHeader
                                key={date}
                                date={date}
                                dayAnalysis={dayAnalysis}
                                selected={date === selectedDate}
                              />
                            );
                          })}
                        </div>

                        {rows.map((row) => (
                          <div key={row.mealNumber} className="grid items-stretch gap-2" style={GRID_TEMPLATE}>
                            {weekDates.map((date) => {
                              const meal = findMeal(days, date, row.mealNumber);
                              return (
                                <ReportMealCell
                                  key={`${date}-${row.mealNumber}`}
                                  mealName={meal?.name ?? row.label}
                                  meal={meal}
                                  date={date}
                                />
                              );
                            })}
                          </div>
                        ))}

                        <p className="border-t border-app-border pt-2 text-xs text-app-text-muted">
                          Day kcal (planned, with ate below)
                        </p>
                        <div className="grid items-center gap-2" style={GRID_TEMPLATE}>
                          {weekDates.map((date) => {
                            const meals = days.find((day) => day.date === date)?.meals ?? [];
                            const planned = Math.round(dayPlannedKcal(meals));
                            const actual = Math.round(dayActualKcal(meals));
                            const dayTargetStatus = dayKcalTargetStatus(actual, planned, date);
                            return (
                              <div
                                key={date}
                                className={clsx(
                                  'flex flex-col items-center rounded-xl border px-2 py-1.5',
                                  kcalTargetHighlightClass(dayTargetStatus)
                                )}
                              >
                                <span className="text-sm font-semibold tabular-nums text-app-text">
                                  {planned ? planned.toLocaleString() : '—'}
                                </span>
                                <span
                                  className={clsx(
                                    'text-[0.7rem] tabular-nums',
                                    dayTargetStatus === 'over'
                                      ? 'text-red-700 dark:text-red-300'
                                      : dayTargetStatus === 'at_or_under'
                                        ? 'text-brand-green'
                                        : 'text-app-text-muted'
                                  )}
                                >
                                  {actual ? `ate ${actual.toLocaleString()}` : '—'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {rows.length === 0 && analysis.plannedMeals === 0 && (
                  <p className="rounded-xl bg-app-muted p-4 text-sm text-app-text-muted">
                    No meals planned for this week yet.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
