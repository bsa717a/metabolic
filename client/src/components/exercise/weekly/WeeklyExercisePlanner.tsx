import { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { formatDayAbbrev, formatDayNumber, isFuture, isToday } from '../../../services/api';
import type { ScheduledExercise } from '../../../types';
import type { DayExercises } from '../../../utils/planExportData';
import { ExerciseCell } from './ExerciseCell';
import { PlannedRestDayCard } from '../PlannedRestDayCard';
import { SelectedExercisePanel } from './SelectedExercisePanel';
import {
  buildExerciseGridRows,
  dayDoneCount,
  dayExerciseCompletionStatus,
  exerciseCompletionHighlightClass,
  exercisesForDay,
  findExerciseAtSlot,
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
  onRemove
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
}) {
  const rows = useMemo(() => buildExerciseGridRows(days), [days]);
  const [selectedSlotIndex, setSelectedSlotIndex] = useState(rows[0]?.slotIndex ?? 0);

  useEffect(() => {
    setSelectedSlotIndex(rows[0]?.slotIndex ?? 0);
  }, [selectedDate, rows[0]?.slotIndex]);

  const activeDate = weekDates.includes(selectedDate) ? selectedDate : weekDates[0];
  const selected = rows.length ? { date: activeDate, slotIndex: selectedSlotIndex } : null;

  const selectedExercise = selected ? findExerciseAtSlot(days, selected.date, selected.slotIndex) : undefined;
  const selectedDayLabel = selected
    ? `${formatDayAbbrev(selected.date)} ${formatDayNumber(selected.date)}`
    : '';

  if (!rows.length) {
    return (
      <div className="min-w-0 overflow-x-auto pb-2">
        <div className="min-w-[900px] space-y-2">
          <div className="grid items-end gap-2" style={GRID_TEMPLATE}>
            {weekDates.map((date) => {
              const active = selectedDate === date;
              const today = isToday(date);
              return (
                <button
                  key={date}
                  type="button"
                  onClick={() => onSelectDay(date)}
                  className={clsx(
                    'flex w-full flex-col items-center rounded-xl border px-2 py-1.5 transition',
                    active
                      ? 'border-brand-green bg-brand-green/10 ring-2 ring-brand-green/40'
                      : 'border-transparent hover:bg-app-muted'
                  )}
                >
                  <span className="text-xs font-medium text-app-text-muted">{formatDayAbbrev(date)}</span>
                  <span
                    className={clsx(
                      'text-base font-bold',
                      today ? 'text-brand-green' : 'text-app-text'
                    )}
                  >
                    {formatDayNumber(date)}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="grid items-stretch gap-2" style={GRID_TEMPLATE}>
            {weekDates.map((date) => (
              <PlannedRestDayCard key={date} compact />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 overflow-x-auto pb-2">
        <div className="min-w-[900px] space-y-2">
          <div className="grid items-end gap-2" style={GRID_TEMPLATE}>
            {weekDates.map((date) => {
              const active = selected?.date === date;
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
                    setSelectedSlotIndex((prev) => prev ?? rows[0]?.slotIndex ?? 0);
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

          {rows.map((row) => (
            <div key={row.slotIndex} className="grid items-stretch gap-2" style={GRID_TEMPLATE}>
              {weekDates.map((date) => {
                const dayExercises = exercisesForDay(days, date);
                const isRestDay = dayExercises.length === 0;
                const exercise = findExerciseAtSlot(days, date, row.slotIndex);
                return (
                  <ExerciseCell
                    key={`${date}-${row.slotIndex}`}
                    exercise={exercise}
                    exerciseName={row.label}
                    future={isFuture(date)}
                    selected={selected?.date === date && selected?.slotIndex === row.slotIndex}
                    isRestDay={isRestDay}
                    showRestLabel={isRestDay && row.slotIndex === 0}
                    editDayMode={editDayMode && date === selectedDate}
                    removing={Boolean(exercise && removingId === exercise.id)}
                    onSelect={() => {
                      onSelectDay(date);
                      setSelectedSlotIndex(row.slotIndex);
                    }}
                    onChange={onChange}
                    onRemove={onRemove}
                  />
                );
              })}
            </div>
          ))}

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
          selectedDate={selected?.date ?? selectedDate}
          isRestDay={selected ? exercisesForDay(days, selected.date).length === 0 : false}
          editDayMode={editDayMode && selected?.date === selectedDate}
          removing={Boolean(selectedExercise && removingId === selectedExercise.id)}
          onChange={onChange}
          onEdit={() => selectedExercise && onEdit(selectedExercise)}
          onRemove={onRemove}
        />
      </div>
    </div>
  );
}
