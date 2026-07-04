import { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { formatDayAbbrev, formatDayNumber, isFuture, isToday } from '../../../services/api';
import type { ScheduledExercise } from '../../../types';
import type { DayExercises } from '../../../utils/planExportData';
import { ExerciseCell } from './ExerciseCell';
import { PlannedRestDayCard } from '../PlannedRestDayCard';
import { SelectedExercisePanel } from './SelectedExercisePanel';
import {
  dayDoneCount,
  dayExerciseCompletionStatus,
  exerciseCompletionHighlightClass,
  exercisesForDay,
  isPastDate
} from './exerciseWeeklyHelpers';

const GRID_TEMPLATE = { gridTemplateColumns: 'repeat(7, minmax(148px, 1fr))' } as const;

export function WeeklyExercisePlanner({
  weekDates,
  days,
  selectedDate,
  editDayMode = false,
  removingId = null,
  onSelectDay,
  onChange,
  onEdit,
  onRemove,
  routineRestDates = new Set<string>()
}: {
  weekDates: string[];
  days: DayExercises[];
  selectedDate: string;
  editDayMode?: boolean;
  removingId?: string | null;
  onSelectDay: (date: string) => void;
  onChange: () => void | Promise<void>;
  onEdit: (item: ScheduledExercise) => void;
  onRemove: (id: string) => void | Promise<void>;
  routineRestDates?: Set<string>;
}) {
  const [selected, setSelected] = useState<{ date: string; exerciseId: string } | null>(null);

  useEffect(() => {
    const exercises = exercisesForDay(days, selectedDate);
    setSelected(exercises[0] ? { date: selectedDate, exerciseId: exercises[0].id } : null);
  }, [selectedDate, days]);

  const selectedExercise = useMemo(() => {
    if (!selected) return undefined;
    return exercisesForDay(days, selected.date).find((item) => item.id === selected.exerciseId);
  }, [selected, days]);

  const activeDate = selected?.date ?? (weekDates.includes(selectedDate) ? selectedDate : weekDates[0]);
  const selectedDayLabel = `${formatDayAbbrev(activeDate)} ${formatDayNumber(activeDate)}`;
  const activeDayExercises = exercisesForDay(days, activeDate);
  const isActiveRestDay = activeDayExercises.length === 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 overflow-x-auto pb-2">
        <div className="min-w-[900px] space-y-2">
          <div className="grid items-end gap-2" style={GRID_TEMPLATE}>
            {weekDates.map((date) => {
              const active = activeDate === date;
              const today = isToday(date);
              const exercises = exercisesForDay(days, date);
              const completionStatus = dayExerciseCompletionStatus(exercises, date);
              const showCompletionTint = isPastDate(date) && completionStatus !== 'none';
              return (
                <button
                  key={date}
                  type="button"
                  onClick={() => {
                    onSelectDay(date);
                    const first = exercisesForDay(days, date)[0];
                    setSelected(first ? { date, exerciseId: first.id } : null);
                  }}
                  className={clsx(
                    'flex w-full flex-col items-center rounded-xl border px-2 py-1.5 transition',
                    showCompletionTint
                      ? exerciseCompletionHighlightClass(completionStatus)
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
                      today && !showCompletionTint && 'text-brand-green',
                      !today && !showCompletionTint && 'text-app-text',
                      showCompletionTint && completionStatus === 'incomplete' && 'text-red-700 dark:text-red-300',
                      showCompletionTint && completionStatus === 'complete' && 'text-brand-green'
                    )}
                  >
                    {formatDayNumber(date)}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="grid items-start gap-2" style={GRID_TEMPLATE}>
            {weekDates.map((date) => {
              const dayExercises = exercisesForDay(days, date);
              const isRestDay = dayExercises.length === 0;
              return (
                <div key={date} className="flex min-w-0 flex-col gap-2">
                  {isRestDay ? (
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        onSelectDay(date);
                        setSelected(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onSelectDay(date);
                          setSelected(null);
                        }
                      }}
                      className={clsx(
                        'cursor-pointer',
                        activeDate === date && isActiveRestDay && 'rounded-2xl ring-2 ring-brand-green/30'
                      )}
                    >
                      <PlannedRestDayCard compact fromRoutine={routineRestDates.has(date)} />
                    </div>
                  ) : (
                    dayExercises.map((exercise, index) => (
                      <ExerciseCell
                        key={exercise.id}
                        exercise={exercise}
                        exerciseName={`Exercise ${index + 1}`}
                        future={isFuture(date)}
                        selected={selected?.exerciseId === exercise.id}
                        editDayMode={editDayMode && date === selectedDate}
                        removing={removingId === exercise.id}
                        onSelect={() => {
                          onSelectDay(date);
                          setSelected({ date, exerciseId: exercise.id });
                        }}
                        onChange={onChange}
                        onRemove={onRemove}
                      />
                    ))
                  )}
                </div>
              );
            })}
          </div>

          <p className="border-t border-app-border pt-2 text-xs text-app-text-muted">Done per day</p>
          <div className="grid items-center gap-2" style={GRID_TEMPLATE}>
            {weekDates.map((date) => {
              const exercises = exercisesForDay(days, date);
              const done = dayDoneCount(exercises);
              const total = exercises.length;
              const completionStatus = dayExerciseCompletionStatus(exercises, date);
              const showCompletionTint = isPastDate(date) && completionStatus !== 'none';
              return (
                <div
                  key={date}
                  className={clsx(
                    'flex flex-col items-center rounded-xl border px-2 py-1.5',
                    showCompletionTint ? exerciseCompletionHighlightClass(completionStatus) : 'border-transparent'
                  )}
                >
                  <span className="text-sm font-semibold tabular-nums text-app-text">
                    {total ? `${done}/${total}` : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div>
        <SelectedExercisePanel
          exercise={selectedExercise}
          dayLabel={selectedDayLabel}
          selectedDate={activeDate}
          isRestDay={isActiveRestDay}
          routineRestDay={routineRestDates.has(activeDate)}
          editDayMode={editDayMode && activeDate === selectedDate}
          removing={Boolean(selectedExercise && removingId === selectedExercise.id)}
          onChange={onChange}
          onEdit={() => selectedExercise && onEdit(selectedExercise)}
          onRemove={onRemove}
        />
      </div>
    </div>
  );
}
