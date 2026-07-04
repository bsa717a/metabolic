import { useState } from 'react';
import { clsx } from 'clsx';
import type { ScheduledExercise } from '../../../types';
import { api } from '../../../services/api';
import {
  exerciseStatusDotClass,
  exerciseStatusLabel,
  formatPlanShort
} from './exerciseWeeklyHelpers';
import { ExerciseQuickRemoveButton } from '../ExerciseQuickRemoveButton';

export function ExerciseCell({
  exercise,
  exerciseName,
  future,
  selected,
  editDayMode = false,
  removing = false,
  onSelect,
  onChange,
  onRemove
}: {
  exercise: ScheduledExercise;
  exerciseName: string;
  future: boolean;
  selected: boolean;
  editDayMode?: boolean;
  removing?: boolean;
  onSelect: () => void;
  onChange: () => void | Promise<void>;
  onRemove?: (id: string) => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isPlanned = exercise.status === 'PLANNED';
  const canComplete = !future && isPlanned;

  async function markDone() {
    setError(null);
    setBusy(true);
    try {
      await api(`/api/scheduled-exercises/${exercise.id}/mark-done`, { method: 'POST' });
      await onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not mark done.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={clsx(
        'relative flex min-h-[5.5rem] w-full flex-col rounded-2xl border border-solid bg-app-surface p-2 text-left transition',
        editDayMode ? 'cursor-default' : 'cursor-pointer',
        selected
          ? 'border-brand-green ring-2 ring-brand-green/30'
          : 'border-app-border hover:border-app-text-muted/40'
      )}
      onClick={editDayMode ? undefined : onSelect}
      onKeyDown={
        editDayMode
          ? undefined
          : (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelect();
              }
            }
      }
      role={editDayMode ? undefined : 'button'}
      tabIndex={editDayMode ? undefined : 0}
    >
      {editDayMode && onRemove && (
        <div className="absolute right-1 top-1 z-10">
          <ExerciseQuickRemoveButton
            name={exercise.exercise.name}
            size="sm"
            disabled={removing}
            onClick={() => void onRemove(exercise.id)}
          />
        </div>
      )}
      <div className="flex items-center justify-between gap-1">
        <span className="truncate text-xs font-semibold text-app-text">{exerciseName}</span>
        <span className="shrink-0 text-[0.7rem] tabular-nums text-app-text-muted">{formatPlanShort(exercise)}</span>
      </div>

      {error && <p className="mt-1 text-[0.65rem] text-red-600">{error}</p>}
      <div className="mt-1 flex min-w-0 items-center gap-1.5">
        {canComplete && !editDayMode && (
          <input
            type="checkbox"
            className="h-3.5 w-3.5 shrink-0 cursor-pointer rounded border-app-border"
            checked={false}
            disabled={busy}
            onClick={(event) => event.stopPropagation()}
            onChange={() => void markDone()}
            aria-label={`Mark ${exercise.exercise.name} done`}
          />
        )}
        <span className={clsx('h-2 w-2 shrink-0 rounded-full', exerciseStatusDotClass(exercise.status))} />
        <span className="truncate text-[0.7rem] font-medium text-app-text-muted">
          {exerciseStatusLabel(exercise.status)}
        </span>
      </div>
      <p className="mt-1.5 truncate text-xs text-app-text">{exercise.exercise.name}</p>
      {exercise.exercise.bodyPart && (
        <p className="truncate text-[0.65rem] uppercase tracking-wide text-app-text-muted">
          {exercise.exercise.bodyPart}
        </p>
      )}
    </div>
  );
}
