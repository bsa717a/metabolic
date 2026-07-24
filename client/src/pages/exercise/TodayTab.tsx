import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play } from 'lucide-react';
import { isFuture, isToday } from '../../services/api';
import type { ScheduledExercise } from '../../types';
import { WeekDateStrip } from '../../components/nutrition/WeekDateStrip';
import { ExerciseChecklist } from '../../components/exercise/ExerciseChecklist';
import { AddExerciseDrawer } from '../../components/exercise/AddExerciseDrawer';
import { EditExerciseDrawer } from '../../components/exercise/EditExerciseDrawer';
import { Button } from '../../components/ui/Button';
import { hasStoredSessionForDate } from '../../utils/workoutSession';
import { primeAudio } from '../../utils/sessionCues';
import { useExerciseArea } from './exerciseAreaContext';

export function TodayTab() {
  const {
    selectedDate,
    selectDate,
    weekDays,
    exercisesForSelectedDate: exercises,
    reloadWeek,
    removeExercise,
    actionError,
    setActionError
  } = useExerciseArea();
  const navigate = useNavigate();

  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<ScheduledExercise>();
  const [editDayMode, setEditDayMode] = useState(false);

  // Re-checked when the day or its exercises change; localStorage read is cheap.
  const hasSession = useMemo(
    () => hasStoredSessionForDate(selectedDate),
    [selectedDate, weekDays]
  );

  useEffect(() => {
    setEditDayMode(false);
  }, [selectedDate]);

  const doneCount = exercises.filter((item) => item.status === 'DONE').length;
  const plannedCount = exercises.filter((item) => item.status === 'PLANNED').length;
  const progress = exercises.length ? Math.round((doneCount / exercises.length) * 100) : 0;
  const future = isFuture(selectedDate);
  const canStart = !future && plannedCount > 0;

  async function handleRemove(id: string) {
    await removeExercise(id);
    if (editItem?.id === id) setEditItem(undefined);
    if (exercises.length <= 1) setEditDayMode(false);
  }

  return (
    <div className="space-y-5">
      <WeekDateStrip selectedDate={selectedDate} onSelectDate={selectDate} exerciseDays={weekDays} />

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

      {canStart && (
        <Button
          type="button"
          className="flex w-full items-center justify-center gap-2 py-4 text-base"
          onClick={() => {
            primeAudio();
            navigate(`/exercise/session?date=${selectedDate}`);
          }}
        >
          <Play className="h-5 w-5" />
          {hasSession ? 'Resume workout' : 'Start workout'}
        </Button>
      )}

      {actionError && (
        <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{actionError}</div>
      )}

      <ExerciseChecklist
        exercises={exercises}
        selectedDate={selectedDate}
        editDayMode={editDayMode}
        onChange={reloadWeek}
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
            setActionError(null);
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
        onClose={() => setAddOpen(false)}
        onSaved={reloadWeek}
      />

      <EditExerciseDrawer
        open={Boolean(editItem)}
        item={editItem}
        onClose={() => setEditItem(undefined)}
        onSaved={reloadWeek}
        onRemove={handleRemove}
      />
    </div>
  );
}
