import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';
import { X } from 'lucide-react';
import {
  api,
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
  dayPlannedKcal,
  extraActualItemsOf,
  findMeal,
  formatItemLine,
  isPlannedItemLogged,
  plannedItemsOf,
  statusDotClass,
  statusLabel,
  type DayMeals
} from '../nutrition/weekly/weeklyHelpers';

const GRID_TEMPLATE = { gridTemplateColumns: 'repeat(7, minmax(120px, 1fr))' } as const;

function dayMacroTotals(meals: Meal[]) {
  return meals.reduce(
    (sum, meal) => ({
      plannedCalories: sum.plannedCalories + Number(meal.plannedCalories),
      actualCalories: sum.actualCalories + Number(meal.actualCalories)
    }),
    { plannedCalories: 0, actualCalories: 0 }
  );
}

function ReportMealCell({ mealName, meal }: { mealName: string; meal?: Meal }) {
  const planned = meal ? plannedItemsOf(meal) : [];
  const actuals = meal ? actualItemsOf(meal) : [];
  const extras = meal ? extraActualItemsOf(meal) : [];
  const isEmpty = planned.length === 0 && extras.length === 0;
  const plannedKcal = meal ? Math.round(Number(meal.plannedCalories)) : 0;
  const actualKcal = meal ? Math.round(Number(meal.actualCalories)) : 0;

  return (
    <div className="flex min-h-[5rem] flex-col rounded-2xl border border-app-border bg-app-surface p-2">
      <div className="flex items-center justify-between gap-1">
        <span className="truncate text-xs font-semibold text-app-text">{mealName}</span>
        {!isEmpty && (
          <span className="shrink-0 text-[0.7rem] tabular-nums text-app-text-muted">
            {actualKcal}/{plannedKcal}
          </span>
        )}
      </div>

      {isEmpty ? (
        <span className="mt-1 text-xs italic text-app-text-muted">No plan</span>
      ) : (
        <>
          <div className="mt-1 flex min-w-0 items-center gap-1">
            <span className={clsx('h-2 w-2 shrink-0 rounded-full', statusDotClass(meal!.status))} />
            <span className="truncate text-[0.7rem] font-medium text-app-text-muted">{statusLabel(meal!.status)}</span>
          </div>
          <div className="mt-1.5 flex flex-col gap-0.5">
            {planned.map((item) => {
              const logged = isPlannedItemLogged(item, actuals);
              return (
                <PlannedItemLine key={item.id} item={item} logged={logged} />
              );
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

export function CoachWeeklyFoodReportModal({
  open,
  clientId,
  anchorDate,
  onClose
}: {
  open: boolean;
  clientId: string;
  anchorDate: string;
  onClose: () => void;
}) {
  const [selectedDate, setSelectedDate] = useState(anchorDate);
  const [days, setDays] = useState<DayMeals[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const weekStart = startOfWeek(selectedDate);
  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart]);
  const rows = useMemo(() => buildGridRows(days), [days]);
  const weekTotals = useMemo(() => dayMacroTotals(days.flatMap((day) => day.meals)), [days]);

  useEffect(() => {
    if (open) setSelectedDate(anchorDate);
  }, [open, anchorDate]);

  const loadWeek = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.all(
        weekDates.map(async (date) => {
          try {
            const meals = await api<Meal[]>(`/api/coach/users/${clientId}/daily-logs/${date}/meals`);
            return { date, meals };
          } catch {
            return { date, meals: [] as Meal[] };
          }
        })
      );
      setDays(results);
    } catch (err) {
      setDays([]);
      setError(err instanceof Error ? err.message : 'Unable to load weekly report');
    } finally {
      setLoading(false);
    }
  }, [clientId, weekDates]);

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
        aria-labelledby="weekly-food-report-title"
        className="relative z-10 flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-app-border bg-app-bg shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-app-border px-5 py-4">
          <div>
            <h2 id="weekly-food-report-title" className="text-xl font-bold text-app-text">
              Weekly report
            </h2>
            <p className="text-sm text-app-text-muted">
              {formatWeekRange(weekStart)} · planned vs what they ate
            </p>
          </div>
          <button
            type="button"
            aria-label="Close weekly report"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-app-border text-app-text-muted transition hover:bg-app-muted hover:text-app-text"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-4">
            <WeekDateStrip selectedDate={selectedDate} onSelectDate={setSelectedDate} />

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-brand-gold/10 p-3 ring-1 ring-brand-gold/20">
                <p className="text-xs font-semibold uppercase tracking-wide text-app-text-muted">Week planned</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-app-text">
                  {Math.round(weekTotals.plannedCalories).toLocaleString()} kcal
                </p>
              </div>
              <div className="rounded-xl bg-brand-green/10 p-3 ring-1 ring-brand-green/20">
                <p className="text-xs font-semibold uppercase tracking-wide text-app-text-muted">Week ate</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-app-text">
                  {weekTotals.actualCalories ? Math.round(weekTotals.actualCalories).toLocaleString() : '—'} kcal
                </p>
              </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            {loading ? (
              <p className="text-sm text-app-text-muted">Loading week…</p>
            ) : rows.length === 0 ? (
              <p className="rounded-xl bg-app-muted p-4 text-sm text-app-text-muted">
                No meals planned for this week yet.
              </p>
            ) : (
              <div className="overflow-x-auto pb-2">
                <div className="min-w-[840px] space-y-2">
                  <div className="grid items-end gap-2" style={GRID_TEMPLATE}>
                    {weekDates.map((date) => {
                      const today = isToday(date);
                      const selected = date === selectedDate;
                      return (
                        <div
                          key={date}
                          className={clsx(
                            'flex flex-col items-center rounded-xl border px-2 py-1.5',
                            selected ? 'border-brand-green bg-brand-green/10' : 'border-transparent'
                          )}
                        >
                          <span className="text-xs font-medium text-app-text-muted">{formatDayAbbrev(date)}</span>
                          <span className={clsx('text-base font-bold', today ? 'text-brand-green' : 'text-app-text')}>
                            {formatDayNumber(date)}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {rows.map((row) => (
                    <div key={row.mealNumber} className="grid items-stretch gap-2" style={GRID_TEMPLATE}>
                      {weekDates.map((date) => {
                        const meal = findMeal(days, date, row.mealNumber);
                        return (
                          <ReportMealCell key={`${date}-${row.mealNumber}`} mealName={meal?.name ?? row.label} meal={meal} />
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
                      return (
                        <div key={date} className="flex flex-col items-center">
                          <span className="text-sm font-semibold tabular-nums text-app-text">
                            {planned ? planned.toLocaleString() : '—'}
                          </span>
                          <span className="text-[0.7rem] tabular-nums text-app-text-muted">
                            {actual ? `ate ${actual.toLocaleString()}` : '—'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
