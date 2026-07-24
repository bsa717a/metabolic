import { clsx } from 'clsx';
import { Check, ChevronRight } from 'lucide-react';
import { formatDayAbbrev, formatDayNumber, isToday } from '../../../services/api';
import type { DayExercises } from '../../../utils/planExportData';
import {
  dayDoneCount,
  dayExerciseCompletionStatus,
  exerciseCompletionHighlightClass,
  exercisesForDay,
  isPastDate
} from './exerciseWeeklyHelpers';

/**
 * Week overview: one card per day listing that day's exercises. Tapping a card
 * opens the full day for editing (Today tab). Used on every screen size — it
 * replaces the desktop grid + single-exercise side panel that confused users.
 */
export function WeekAgendaList({
  weekDates,
  days,
  selectedDate,
  routineRestDates = new Set<string>(),
  onSelectDay
}: {
  weekDates: string[];
  days: DayExercises[];
  selectedDate: string;
  routineRestDates?: Set<string>;
  onSelectDay: (date: string) => void;
}) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {weekDates.map((date) => {
        const exercises = exercisesForDay(days, date);
        const total = exercises.length;
        const done = dayDoneCount(exercises);
        const completionStatus = dayExerciseCompletionStatus(exercises, date);
        const showTint = isPastDate(date) && completionStatus !== 'none';
        const isRest = total === 0;
        const fromRoutine = routineRestDates.has(date);
        const selected = date === selectedDate;

        return (
          <li key={date}>
            <button
              type="button"
              onClick={() => onSelectDay(date)}
              className={clsx(
                'flex h-full w-full flex-col gap-3 rounded-2xl border p-4 text-left transition',
                showTint
                  ? exerciseCompletionHighlightClass(completionStatus)
                  : selected
                    ? 'border-brand-green bg-brand-green/10'
                    : 'border-app-border bg-app-surface hover:bg-app-muted',
                selected && 'ring-2 ring-brand-green/40'
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-semibold uppercase text-app-text-muted">
                    {formatDayAbbrev(date)}
                  </span>
                  <span
                    className={clsx(
                      'text-lg font-bold',
                      isToday(date) ? 'text-brand-green' : 'text-app-text'
                    )}
                  >
                    {formatDayNumber(date)}
                  </span>
                  {isToday(date) && (
                    <span className="rounded-full bg-brand-green/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-brand-green">
                      Today
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 text-app-text-muted">
                  {!isRest && (
                    <span className="text-xs font-semibold tabular-nums">
                      {done}/{total}
                    </span>
                  )}
                  <ChevronRight className="h-4 w-4" />
                </div>
              </div>

              {isRest ? (
                <p className="text-sm font-medium text-app-text-muted">
                  {fromRoutine ? 'Rest day' : 'No exercises planned'}
                </p>
              ) : (
                <ul className="space-y-1">
                  {exercises.map((item) => {
                    const isDone = item.status === 'DONE';
                    const isSkipped = item.status === 'SKIPPED';
                    return (
                      <li key={item.id} className="flex items-center gap-2 text-sm">
                        <span
                          className={clsx(
                            'grid h-4 w-4 shrink-0 place-items-center rounded-full border',
                            isDone
                              ? 'border-emerald-500 bg-emerald-500 text-white'
                              : isSkipped
                                ? 'border-app-border text-app-text-muted'
                                : 'border-app-border'
                          )}
                        >
                          {isDone && <Check className="h-3 w-3" />}
                          {isSkipped && <span className="text-[10px] leading-none">/</span>}
                        </span>
                        <span
                          className={clsx(
                            'truncate',
                            isDone
                              ? 'text-app-text-muted line-through'
                              : isSkipped
                                ? 'text-app-text-muted line-through decoration-app-text-muted'
                                : 'text-app-text'
                          )}
                        >
                          {item.exercise.name}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
