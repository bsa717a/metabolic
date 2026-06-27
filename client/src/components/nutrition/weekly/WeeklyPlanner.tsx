import { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { formatDayAbbrev, formatDayNumber, isFuture, isToday } from '../../../services/api';
import { MealCell } from './MealCell';
import { AddFoodsPanel } from './AddFoodsPanel';
import { SelectedMealPanel } from './SelectedMealPanel';
import { CopyDayForward } from './CopyDayForward';
import {
  buildGridRows,
  dayActualKcal,
  dayKcalTargetStatusForMeals,
  dayPlannedKcal,
  findMeal,
  isPastDate,
  kcalTargetHighlightClass,
  type DayMeals
} from './weeklyHelpers';

const GRID_TEMPLATE = { gridTemplateColumns: 'repeat(7, minmax(148px, 1fr))' } as const;

export function WeeklyPlanner({
  weekDates,
  days,
  selectedDate,
  onSelectDay,
  onChange,
  onLogActual,
  onAskAi
}: {
  weekDates: string[];
  days: DayMeals[];
  selectedDate: string;
  onSelectDay: (date: string) => void;
  onChange: () => void | Promise<void>;
  onLogActual: (mealId: string) => void;
  onAskAi: (mealId: string) => void;
}) {
  const rows = useMemo(() => buildGridRows(days), [days]);
  const [selectedMealNumber, setSelectedMealNumber] = useState(rows[0]?.mealNumber ?? 1);

  useEffect(() => {
    setSelectedMealNumber(rows[0]?.mealNumber ?? 1);
  }, [weekDates.join(','), rows[0]?.mealNumber]);

  const activeDate = weekDates.includes(selectedDate) ? selectedDate : weekDates[0];
  const selected = rows.length ? { date: activeDate, mealNumber: selectedMealNumber } : null;

  const selectedMeal = selected ? findMeal(days, selected.date, selected.mealNumber) : undefined;
  const selectedDayLabel = selected
    ? `${formatDayAbbrev(selected.date)} ${formatDayNumber(selected.date)}`
    : '';
  const selectedLabel = selectedMeal ? `${selectedDayLabel} · ${selectedMeal.name}` : undefined;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Week grid */}
        <div className="min-w-0 overflow-x-auto pb-2">
          <div className="min-w-[900px] space-y-2">
            {/* Day headers */}
            <div className="grid items-end gap-2" style={GRID_TEMPLATE}>
              {weekDates.map((date) => {
                const active = selected?.date === date;
                const today = isToday(date);
                const meals = days.find((day) => day.date === date)?.meals ?? [];
                const targetStatus = dayKcalTargetStatusForMeals(date, meals);
                const showTargetTint = isPastDate(date) && targetStatus !== 'none';
                return (
                  <div key={date} className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        onSelectDay(date);
                        setSelectedMealNumber((prev) => prev ?? rows[0]?.mealNumber ?? 1);
                      }}
                      className={clsx(
                        'flex w-full flex-col items-center rounded-xl border px-2 py-1.5 transition',
                        showTargetTint
                          ? kcalTargetHighlightClass(targetStatus)
                          : active
                            ? 'border-brand-green bg-brand-green/10'
                            : 'border-transparent hover:bg-app-muted',
                        active && 'ring-2 ring-brand-green/40'
                      )}
                    >
                      <span className="text-xs font-medium text-app-text-muted">{formatDayAbbrev(date)}</span>
                      <span
                        className={clsx(
                          'text-base font-bold',
                          today && !showTargetTint && 'text-brand-green',
                          !today && !showTargetTint && 'text-app-text',
                          showTargetTint && targetStatus === 'over' && 'text-red-700 dark:text-red-300',
                          showTargetTint && targetStatus === 'at_or_under' && 'text-brand-green'
                        )}
                      >
                        {formatDayNumber(date)}
                      </span>
                    </button>
                    {active && (
                      <CopyDayForward
                        date={date}
                        dayLabel={`${formatDayAbbrev(date)} ${formatDayNumber(date)}`}
                        onCopied={onChange}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Meal rows */}
            {rows.map((row) => (
              <div key={row.mealNumber} className="grid items-stretch gap-2" style={GRID_TEMPLATE}>
                {weekDates.map((date) => {
                  const meal = findMeal(days, date, row.mealNumber);
                  return (
                    <MealCell
                      key={`${date}-${row.mealNumber}`}
                      mealName={meal?.name ?? row.label}
                      meal={meal}
                      future={isFuture(date)}
                      selected={selected?.date === date && selected?.mealNumber === row.mealNumber}
                      onSelect={() => {
                        onSelectDay(date);
                        setSelectedMealNumber(row.mealNumber);
                      }}
                      onChange={onChange}
                    />
                  );
                })}
              </div>
            ))}

            {/* Per-day calorie totals */}
            <p className="border-t border-app-border pt-2 text-xs text-app-text-muted">Day kcal (planned, with eaten below)</p>
            <div className="grid items-center gap-2" style={GRID_TEMPLATE}>
              {weekDates.map((date) => {
                const meals = days.find((day) => day.date === date)?.meals ?? [];
                const planned = Math.round(dayPlannedKcal(meals));
                const actual = Math.round(dayActualKcal(meals));
                const targetStatus = dayKcalTargetStatusForMeals(date, meals);
                const showTargetTint = isPastDate(date) && targetStatus !== 'none';
                return (
                  <div
                    key={date}
                    className={clsx(
                      'flex flex-col items-center rounded-xl border px-2 py-1.5',
                      showTargetTint ? kcalTargetHighlightClass(targetStatus) : 'border-transparent'
                    )}
                  >
                    <span className="text-sm font-semibold tabular-nums text-app-text">
                      {planned ? planned.toLocaleString() : '—'}
                    </span>
                    <span
                      className={clsx(
                        'text-[0.7rem] tabular-nums',
                        showTargetTint && targetStatus === 'over'
                          ? 'text-red-700 dark:text-red-300'
                          : showTargetTint && targetStatus === 'at_or_under'
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

        {/* Right column: selection detail + add foods */}
        <div className="space-y-4">
          <SelectedMealPanel
            meal={selectedMeal}
            dayLabel={selectedDayLabel}
            future={selected ? isFuture(selected.date) : false}
            onChange={onChange}
            onLogActual={onLogActual}
            onAskAi={onAskAi}
          />
          <AddFoodsPanel selectedMeal={selectedMeal} selectedLabel={selectedLabel} onChange={onChange} />
        </div>
      </div>
  );
}
