import type { ScheduledExercise } from '../../../types';
import { ExerciseCard } from '../ExerciseCard';
import { ExerciseQuickRemoveButton } from '../ExerciseQuickRemoveButton';
import { PlannedRestDayCard } from '../PlannedRestDayCard';

export function SelectedExercisePanel({
  exercise,
  dayLabel,
  selectedDate,
  editDayMode = false,
  removing = false,
  onChange,
  onEdit,
  onRemove,
  isRestDay = false
}: {
  exercise?: ScheduledExercise;
  dayLabel: string;
  selectedDate: string;
  editDayMode?: boolean;
  removing?: boolean;
  onChange: () => void | Promise<void>;
  onEdit: () => void;
  onRemove?: (id: string) => void | Promise<void>;
  isRestDay?: boolean;
}) {
  if (!exercise) {
    if (isRestDay) {
      return (
        <div className="rounded-2xl border border-app-border bg-app-surface p-4 shadow-sm">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-app-text-muted">Selected day</h3>
          <p className="mt-1 text-sm text-app-text-muted">{dayLabel}</p>
          <div className="mt-3">
            <PlannedRestDayCard compact />
          </div>
        </div>
      );
    }

    return (
      <div className="rounded-2xl border border-app-border bg-app-surface p-4 shadow-sm">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-app-text-muted">Selected exercise</h3>
        <p className="mt-2 text-sm text-app-text-muted">
          Pick an exercise in the grid to review details and mark it done or skipped.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-app-border bg-app-surface p-4 shadow-sm">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-app-text-muted">Selected exercise</h3>
      <p className="mt-1 text-sm text-app-text-muted">{dayLabel}</p>
      <div className="mt-3 flex items-start gap-1 rounded-2xl border border-app-border bg-white p-3">
        {editDayMode && onRemove && (
          <ExerciseQuickRemoveButton
            name={exercise.exercise.name}
            disabled={removing}
            onClick={() => void onRemove(exercise.id)}
          />
        )}
        <div className="min-w-0 flex-1">
          <ExerciseCard
            item={exercise}
            selectedDate={selectedDate}
            onChange={onChange}
            onEdit={onEdit}
          />
        </div>
      </div>
    </div>
  );
}
