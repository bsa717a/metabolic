import { clsx } from 'clsx';
import { addDays, formatDayAbbrev, formatDayNumber, formatWeekRange, getWeekDates, isToday, startOfWeek } from '../../services/api';
import type { DayExercises } from '../../utils/planExportData';
import {
  dayExerciseCompletionStatus,
  exerciseCompletionHighlightClass,
  exercisesForDay,
  isPastDate as isExercisePastDate
} from '../exercise/weekly/exerciseWeeklyHelpers';
import {
  dayKcalTargetStatusForMeals,
  isPastDate,
  kcalTargetHighlightClass,
  type DayMeals
} from './weekly/weeklyHelpers';

export function WeekDateStrip({
  selectedDate,
  onSelectDate,
  endAction,
  hideHeader = false,
  days,
  exerciseDays
}: {
  selectedDate: string;
  onSelectDate: (date: string) => void;
  endAction?: React.ReactNode;
  hideHeader?: boolean;
  /** When set, past days tint green/red by planned vs actual kcal. */
  days?: DayMeals[];
  /** When set, past days tint green/red by exercise completion. */
  exerciseDays?: DayExercises[];
}) {
  const weekStart = startOfWeek(selectedDate);
  const weekDates = getWeekDates(weekStart);

  function shiftWeek(delta: number) {
    onSelectDate(addDays(weekStart, delta * 7));
  }

  return (
    <div className="space-y-3">
      {!hideHeader && (
        <div className="flex items-center gap-3">
          <p className="text-sm font-semibold text-slate-700">{formatWeekRange(weekStart)}</p>
          <div className="flex gap-1">
            <button type="button" onClick={() => shiftWeek(-1)} className="rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-600 hover:bg-slate-50" aria-label="Previous week">◀</button>
            <button type="button" onClick={() => shiftWeek(1)} className="rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-600 hover:bg-slate-50" aria-label="Next week">▶</button>
          </div>
        </div>
      )}
      <div className={clsx(endAction ? 'space-y-2 sm:flex sm:items-center sm:gap-2 sm:space-y-0' : 'flex items-center gap-2')}>
        <div className="grid min-w-0 flex-1 grid-cols-7 gap-1 sm:flex sm:gap-2 sm:overflow-x-auto sm:pb-1 sm:snap-x sm:snap-mandatory">
        {weekDates.map((date) => {
          const selected = date === selectedDate;
          const today = isToday(date);
          const meals = days?.find((day) => day.date === date)?.meals ?? [];
          const targetStatus = days ? dayKcalTargetStatusForMeals(date, meals) : 'none';
          const showMealTint = Boolean(days) && isPastDate(date) && targetStatus !== 'none';
          const exercises = exerciseDays ? exercisesForDay(exerciseDays, date) : [];
          const exerciseStatus = exerciseDays ? dayExerciseCompletionStatus(exercises, date) : 'none';
          const showExerciseTint = Boolean(exerciseDays) && isExercisePastDate(date) && exerciseStatus !== 'none';
          const themed = Boolean(days) || Boolean(exerciseDays);
          const showTint = showMealTint || showExerciseTint;
          const tintClass = showMealTint
            ? kcalTargetHighlightClass(targetStatus)
            : showExerciseTint
              ? exerciseCompletionHighlightClass(exerciseStatus)
              : undefined;
          return (
            <button
              key={date}
              type="button"
              onClick={() => onSelectDate(date)}
              className={clsx(
                'flex min-w-0 flex-col items-center rounded-2xl border px-1 py-1.5 transition sm:min-w-[3.5rem] sm:snap-start sm:px-3 sm:py-2',
                themed
                  ? clsx(
                      showTint
                        ? tintClass
                        : selected
                          ? 'border-brand-green bg-brand-green/10 text-app-text'
                          : 'border-app-border bg-app-surface text-app-text',
                      selected && 'ring-2 ring-brand-green/40',
                      !selected && !showTint && 'hover:bg-app-muted'
                    )
                  : clsx(
                      selected
                        ? 'border-slate-950 bg-slate-950 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300',
                      today && !selected && 'ring-2 ring-blue-400 ring-offset-1'
                    )
              )}
            >
              <span
                className={clsx(
                  'text-[10px] sm:text-xs',
                  selected ? 'font-bold' : 'font-medium opacity-80'
                )}
              >
                {formatDayAbbrev(date)}
              </span>
              <span
                className={clsx(
                  'text-sm sm:text-lg',
                  selected ? 'text-base font-extrabold sm:text-xl' : 'font-bold',
                  showMealTint &&
                    targetStatus === 'over' &&
                    'text-red-700 dark:text-red-300',
                  showMealTint &&
                    targetStatus === 'at_or_under' &&
                    'text-brand-green',
                  showExerciseTint &&
                    exerciseStatus === 'incomplete' &&
                    'text-red-700 dark:text-red-300',
                  showExerciseTint &&
                    exerciseStatus === 'complete' &&
                    'text-brand-green',
                  themed && today && !showTint && 'text-brand-green'
                )}
              >
                {formatDayNumber(date)}
              </span>
              {today && (
                <span
                  className={clsx(
                    'mt-0.5 h-1.5 w-1.5 rounded-full',
                    themed ? 'bg-brand-green' : selected ? 'bg-white' : 'bg-blue-500'
                  )}
                />
              )}
            </button>
          );
        })}
        </div>
        {endAction && <div className="shrink-0 sm:pb-1">{endAction}</div>}
      </div>
    </div>
  );
}
