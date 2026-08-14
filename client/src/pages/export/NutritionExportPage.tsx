import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { todayKey } from '../../services/api';
import type { Meal, MealItem } from '../../types';
import {
  formatExportDate,
  formatItemQuantityLine,
  formatMacroLine,
  formatPlannedTime,
  formatShortDayLabel
} from '../../utils/exportFormat';
import {
  fetchMealsForDates,
  formatWeekExportLabel,
  getWeekRange,
  parseExportRange,
  weekHasMeals,
  type DayMeals
} from '../../utils/planExportData';
import { PrintExportLayout } from '../../components/export/PrintExportLayout';
import { printNutritionPlan, printNutritionWeekPlan } from '../../utils/printNutritionPlan';

function dateFromParams(params: URLSearchParams) {
  const date = params.get('date');
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayKey();
}

function MealExportSection({ meal }: { meal: Meal }) {
  const plannedItems = (meal.items ?? []).filter((item) => item.type === 'PLANNED');
  const plannedTime = formatPlannedTime(meal.plannedTime);
  const heading = plannedTime ? `${meal.name} · ${plannedTime}` : meal.name;

  return (
    <section className="export-section break-inside-avoid">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Meal {meal.mealNumber}</p>
          <h2 className="text-lg font-semibold text-slate-900">{heading}</h2>
        </div>
      </div>

      {plannedItems.length > 0 ? (
        <ul className="overflow-hidden rounded-xl border border-slate-200">
          {plannedItems.map((item: MealItem) => (
            <li key={item.id} className="flex gap-3 border-t border-slate-200 px-4 py-3 first:border-t-0">
              <span className="mt-0.5 h-4 w-4 shrink-0 rounded border border-slate-400" aria-hidden="true" />
              <p className="min-w-0 flex-1 text-sm font-medium text-slate-900">
                {formatItemQuantityLine(item.quantity, item.unit, item.nameSnapshot)}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">No foods planned</p>
      )}

      <p className="mt-3 text-sm font-medium text-slate-700">
        {formatMacroLine(meal.plannedCalories, meal.plannedProtein, meal.plannedCarbs, meal.plannedFat)}
      </p>
    </section>
  );
}

function WeekDayPreview({ day }: { day: DayMeals }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 p-3">
      <p className="border-b border-slate-200 pb-2 text-xs font-bold uppercase tracking-wide text-slate-700">
        {formatShortDayLabel(day.date)}
      </p>
      {day.meals.length === 0 ? (
        <p className="mt-3 text-xs italic text-slate-400">No meals planned</p>
      ) : (
        <div className="mt-3 space-y-3">
          {day.meals.map((meal) => {
            const plannedItems = (meal.items ?? []).filter((item) => item.type === 'PLANNED');
            const plannedTime = formatPlannedTime(meal.plannedTime);
            const title = plannedTime ? `${meal.name} · ${plannedTime}` : meal.name;

            return (
              <div key={meal.id}>
                <p className="text-[10px] font-bold uppercase tracking-wide text-black underline underline-offset-2">{title}</p>
                <ul className="mt-1 space-y-1">
                  {plannedItems.length > 0 ? (
                    plannedItems.map((item) => (
                      <li key={item.id} className="text-xs leading-snug text-black">
                        {formatItemQuantityLine(item.quantity, item.unit, item.nameSnapshot)}
                      </li>
                    ))
                  ) : (
                    <li className="text-xs italic text-slate-400">No foods planned</li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function NutritionExportPage() {
  const [searchParams] = useSearchParams();
  const range = parseExportRange(searchParams);
  const date = dateFromParams(searchParams);
  const week = useMemo(() => getWeekRange(date), [date]);
  const weekLabel = formatWeekExportLabel(week.startDate);

  const [meals, setMeals] = useState<Meal[]>([]);
  const [weekDays, setWeekDays] = useState<DayMeals[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const load = range === 'week'
      ? fetchMealsForDates(week.dates, controller.signal).then((days) => {
          if (controller.signal.aborted) return;
          setWeekDays(days);
          setMeals([]);
        })
      : fetchMealsForDates([date], controller.signal).then((days) => {
          if (controller.signal.aborted) return;
          setMeals(days[0]?.meals ?? []);
          setWeekDays([]);
        });

    load
      .catch((err) => {
        if (controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) return;
        setMeals([]);
        setWeekDays([]);
        setError(err instanceof Error ? err.message : 'Could not load nutrition plan.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [range, date, week.dates]);

  const backParams = new URLSearchParams();
  if (date !== todayKey()) backParams.set('date', date);
  const backTo = backParams.size ? `/nutrition/plan?${backParams.toString()}` : '/nutrition/plan';

  const hasContent = range === 'week' ? weekHasMeals(weekDays) : meals.length > 0;
  const title = range === 'week' ? 'Weekly nutrition plan' : 'Nutrition plan';
  const subtitle = range === 'week' ? `${weekLabel} · landscape print` : formatExportDate(date);

  const dayTotals = meals.reduce(
    (sum, meal) => ({
      calories: sum.calories + Number(meal.plannedCalories),
      protein: sum.protein + Number(meal.plannedProtein),
      carbs: sum.carbs + Number(meal.plannedCarbs),
      fat: sum.fat + Number(meal.plannedFat)
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  return (
    <PrintExportLayout
      title={title}
      subtitle={subtitle}
      backTo={backTo}
      backLabel="Back to nutrition"
      wide={range === 'week'}
      printDisabled={loading || Boolean(error) || !hasContent}
      onPrint={() => {
        if (range === 'week') {
          printNutritionWeekPlan(weekDays, weekLabel);
          return;
        }
        printNutritionPlan(meals, date);
      }}
    >
      {loading && <p className="text-sm text-slate-500">Loading plan…</p>}
      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {!loading && !error && !hasContent && (
        <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
          {range === 'week' ? 'No meals planned for this week yet.' : 'No meals planned for this day.'}
        </p>
      )}

      {!loading && !error && range === 'day' && meals.length > 0 && (
        <div className="space-y-8">
          {meals.map((meal) => (
            <MealExportSection key={meal.id} meal={meal} />
          ))}

          <section className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Day total</p>
            <p className="mt-2 text-base font-semibold text-slate-900">
              {formatMacroLine(dayTotals.calories, dayTotals.protein, dayTotals.carbs, dayTotals.fat)}
            </p>
          </section>
        </div>
      )}

      {!loading && !error && range === 'week' && hasContent && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          {weekDays.map((day) => (
            <WeekDayPreview key={day.date} day={day} />
          ))}
        </div>
      )}
    </PrintExportLayout>
  );
}
