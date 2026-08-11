import { useEffect, useState, type ReactNode } from 'react';
import { isToday } from '../../services/api';
import type { ScheduledExercise } from '../../types';
import type { DayExercises } from '../../utils/planExportData';
import { WeekDateStrip } from '../nutrition/WeekDateStrip';
import { ExerciseChecklist } from './ExerciseChecklist';
import { AddExerciseDrawer } from './AddExerciseDrawer';
import { EditExerciseDrawer } from './EditExerciseDrawer';
import { Button } from '../ui/Button';

export function DayExerciseEditor({
  selectedDate,
  onSelectDate,
  weekDays,
  exercises,
  onReload,
  onRemoveExercise,
  coachClientId,
  actionError,
  onClearActionError,
  beforeChecklist,
  afterProgress
}: {
  selectedDate: string;
  onSelectDate: (date: string) => void;
  weekDays: DayExercises[];
  exercises: ScheduledExercise[];
  onReload: () => void | Promise<void>;
  onRemoveExercise: (id: string) => void | Promise<void>;
  coachClientId?: string;
  actionError?: string | null;
  onClearActionError?: () => void;
  beforeChecklist?: ReactNode;
  afterProgress?: ReactNode;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<ScheduledExercise>();
  const [editDayMode, setEditDayMode] = useState(false);

  useEffect(() => {
    setEditDayMode(false);
  }, [selectedDate]);

  const doneCount = exercises.filter((item) => item.status === 'DONE').length;
  const progress = exercises.length ? Math.round((doneCount / exercises.length) * 100) : 0;

  async function handleRemove(id: string) {
    await onRemoveExercise(id);
    if (editItem?.id === id) setEditItem(undefined);
    if (exercises.length <= 1) setEditDayMode(false);
  }

  return (
    <div className="space-y-5">
      <WeekDateStrip selectedDate={selectedDate} onSelectDate={onSelectDate} exerciseDays={weekDays} />

      {beforeChecklist}

      {exercises.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p className="font-semibold text-app-text">
              {doneCount} of {exercises.length} done
            </p>
            {!isToday(selectedDate) && <p className="text-app-text-muted">{selectedDate}</p>}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-app-muted">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {afterProgress}

      {actionError && (
        <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{actionError}</div>
      )}

      <ExerciseChecklist
        exercises={exercises}
        selectedDate={selectedDate}
        coachClientId={coachClientId}
        editDayMode={editDayMode}
        onChange={onReload}
        onEdit={setEditItem}
        onRemove={handleRemove}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setAddOpen(true)}>Add exercise</Button>
        <Button
          type="button"
          variant="secondary"
          disabled={!exercises.length}
          onClick={() => {
            onClearActionError?.();
            setEditDayMode((value) => !value);
          }}
        >
          {editDayMode ? 'Done editing' : 'Edit day'}
        </Button>
      </div>

      {editDayMode && (
        <p className="text-sm text-red-700">Tap the red × next to an exercise to remove it from this day.</p>
      )}

      <AddExerciseDrawer
        open={addOpen}
        date={selectedDate}
        coachClientId={coachClientId}
        onClose={() => setAddOpen(false)}
        onSaved={onReload}
      />

      <EditExerciseDrawer
        open={Boolean(editItem)}
        item={editItem}
        onClose={() => setEditItem(undefined)}
        onSaved={onReload}
        onRemove={handleRemove}
      />
    </div>
  );
}
