import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { api } from '../../services/api';
import type { ExercisePlanTemplateSummary, ExerciseRoutine } from '../../types';
import type { ExercisePlanUndoSnapshot } from '../../types/exercisePlanUndo';
import { WEEKDAY_LABELS, type WeekdayIndex } from '../../utils/weekdayPattern';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import { EditWorkoutDrawer } from './EditWorkoutDrawer';

const REST_VALUE = '';

type DayAssignment = {
  weekday: WeekdayIndex;
  templateId: string | null;
};

function defaultAssignments(): DayAssignment[] {
  return WEEKDAY_LABELS.map((_, weekday) => ({
    weekday: weekday as WeekdayIndex,
    templateId: null
  }));
}

function assignmentsFromRoutine(routine: ExerciseRoutine | null): DayAssignment[] {
  if (!routine?.days.length) return defaultAssignments();
  const byWeekday = new Map(routine.days.map((day) => [day.weekday, day.templateId]));
  return WEEKDAY_LABELS.map((_, weekday) => ({
    weekday: weekday as WeekdayIndex,
    templateId: byWeekday.get(weekday) ?? null
  }));
}

function routineSummary(days: DayAssignment[], workouts: ExercisePlanTemplateSummary[]) {
  const workoutName = (id: string | null) =>
    id ? workouts.find((w) => w.id === id)?.name ?? 'Workout' : 'Rest';
  const counts = new Map<string, number>();
  for (const day of days) {
    const key = day.templateId ?? REST_VALUE;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const parts: string[] = [];
  for (const [key, count] of counts) {
    if (key === REST_VALUE) {
      parts.push(`${count} rest day${count > 1 ? 's' : ''}`);
    } else {
      parts.push(`${count}× ${workoutName(key)}`);
    }
  }
  return parts.join(' · ');
}

export function RoutineEditor({
  open,
  selectedDate,
  onClose,
  onSaved,
  registerUndo
}: {
  open: boolean;
  selectedDate: string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  registerUndo?: (message: string, snapshot: ExercisePlanUndoSnapshot | undefined) => void;
}) {
  const [workouts, setWorkouts] = useState<ExercisePlanTemplateSummary[]>([]);
  const [assignments, setAssignments] = useState<DayAssignment[]>(defaultAssignments);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [newWorkoutName, setNewWorkoutName] = useState('');
  const [creatingWorkout, setCreatingWorkout] = useState(false);
  const [saveFromDayName, setSaveFromDayName] = useState('');
  const [editingWorkoutId, setEditingWorkoutId] = useState<string | null>(null);

  const summary = useMemo(() => routineSummary(assignments, workouts), [assignments, workouts]);

  const myWorkouts = useMemo(
    () => workouts.filter((workout) => workout.visibility === 'USER'),
    [workouts]
  );

  async function reloadWorkouts() {
    const templates = await api<ExercisePlanTemplateSummary[]>('/api/exercise-templates');
    setWorkouts(templates);
  }

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError('');
    Promise.all([
      api<ExerciseRoutine | null>('/api/exercise-routine'),
      api<ExercisePlanTemplateSummary[]>('/api/exercise-templates')
    ])
      .then(([routine, templates]) => {
        setWorkouts(templates);
        setAssignments(assignmentsFromRoutine(routine));
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Unable to load routine');
      })
      .finally(() => setLoading(false));
  }, [open]);

  function setDayTemplate(weekday: WeekdayIndex, value: string) {
    setAssignments((current) =>
      current.map((day) =>
        day.weekday === weekday ? { ...day, templateId: value === REST_VALUE ? null : value } : day
      )
    );
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const result = await api<{ routine: ExerciseRoutine; undoSnapshot?: ExercisePlanUndoSnapshot }>(
        '/api/exercise-routine',
        {
          method: 'PUT',
          body: JSON.stringify({
            days: assignments.map((day) => ({
              weekday: day.weekday,
              templateId: day.templateId
            })),
            applyForward: true
          })
        }
      );
      registerUndo?.('Weekly routine updated', result.undoSnapshot);
      setAssignments(assignmentsFromRoutine(result.routine));
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save routine');
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateWorkout() {
    const name = newWorkoutName.trim();
    if (!name) return;
    setCreatingWorkout(true);
    setError('');
    try {
      const created = await api<{ id: string; name: string; items: unknown[] }>('/api/exercise-templates', {
        method: 'POST',
        body: JSON.stringify({ name })
      });
      await reloadWorkouts();
      setNewWorkoutName('');
      setEditingWorkoutId(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create workout');
    } finally {
      setCreatingWorkout(false);
    }
  }

  async function handleSaveFromDay() {
    const name = saveFromDayName.trim();
    if (!name) return;
    setCreatingWorkout(true);
    setError('');
    try {
      const created = await api<{ id: string; name: string }>('/api/exercise-templates/from-day', {
        method: 'POST',
        body: JSON.stringify({ name, date: selectedDate })
      });
      await reloadWorkouts();
      setSaveFromDayName('');
      setEditingWorkoutId(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save workout from this day');
    } finally {
      setCreatingWorkout(false);
    }
  }

  return (
    <>
      <Drawer open={open} title="Weekly routine" onClose={onClose} panelClassName="max-w-lg">
        <div className="space-y-6">
        <p className="text-sm text-app-text-muted">
          Assign a workout or rest day to each weekday. Your routine repeats every week and fills in
          upcoming days automatically.
        </p>

        {loading ? (
          <p className="text-sm text-app-text-muted">Loading…</p>
        ) : (
          <>
            <div className="space-y-3">
              {assignments.map((day) => (
                <div key={day.weekday} className="flex items-center gap-3">
                  <span className="w-10 shrink-0 text-sm font-semibold text-app-text">
                    {WEEKDAY_LABELS[day.weekday]}
                  </span>
                  <select
                    value={day.templateId ?? REST_VALUE}
                    onChange={(event) => setDayTemplate(day.weekday, event.target.value)}
                    className="min-w-0 flex-1 rounded-xl border border-app-border bg-app-surface px-3 py-2 text-sm text-app-text"
                  >
                    <option value={REST_VALUE}>Rest</option>
                    {workouts.map((workout) => (
                      <option key={workout.id} value={workout.id}>
                        {workout.name}
                        {workout.exerciseCount ? ` (${workout.exerciseCount})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <p className="text-sm text-app-text-muted">
              Your routine: <span className="font-medium text-app-text">{summary || 'All rest days'}</span>
            </p>
          </>
        )}

        <div className="space-y-3 rounded-2xl border border-app-border bg-app-muted/40 p-4">
          <h3 className="text-sm font-semibold text-app-text">My workouts</h3>
          <p className="text-xs text-app-text-muted">
            Workouts are reusable exercise lists. Add exercises on any day, then save that day as a workout
            to reuse it in your routine.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={newWorkoutName}
              onChange={(event) => setNewWorkoutName(event.target.value)}
              placeholder="New empty workout name"
              className="min-w-0 flex-1 rounded-xl border border-app-border bg-app-surface px-3 py-2 text-sm"
            />
            <Button
              type="button"
              variant="secondary"
              disabled={creatingWorkout || !newWorkoutName.trim()}
              onClick={() => void handleCreateWorkout()}
            >
              <Plus className="mr-1 inline h-4 w-4" />
              Add
            </Button>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={saveFromDayName}
              onChange={(event) => setSaveFromDayName(event.target.value)}
              placeholder="Save today&apos;s exercises as…"
              className="min-w-0 flex-1 rounded-xl border border-app-border bg-app-surface px-3 py-2 text-sm"
            />
            <Button
              type="button"
              variant="secondary"
              disabled={creatingWorkout || !saveFromDayName.trim()}
              onClick={() => void handleSaveFromDay()}
            >
              Save day
            </Button>
          </div>
          {myWorkouts.length > 0 && (
            <ul className="space-y-2">
              {myWorkouts.map((workout) => (
                <li
                  key={workout.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-app-border px-3 py-2"
                >
                  <span className="min-w-0 text-sm text-app-text">
                    {workout.name}
                    {workout.exerciseCount ? ` — ${workout.exerciseCount} exercises` : ' — empty'}
                  </span>
                  <Button type="button" variant="secondary" onClick={() => setEditingWorkoutId(workout.id)}>
                    Edit
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2">
          <Button type="button" disabled={saving || loading} onClick={() => void handleSave()}>
            {saving ? 'Saving…' : 'Save routine'}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
        </div>
      </Drawer>

      <EditWorkoutDrawer
        open={Boolean(editingWorkoutId)}
        workoutId={editingWorkoutId}
        onClose={() => setEditingWorkoutId(null)}
        onChanged={async () => {
          const templates = await api<ExercisePlanTemplateSummary[]>('/api/exercise-templates');
          setWorkouts(templates);
          const removedId = editingWorkoutId;
          if (removedId && !templates.some((w) => w.id === removedId)) {
            setAssignments((current) =>
              current.map((day) =>
                day.templateId === removedId ? { ...day, templateId: null } : day
              )
            );
            setEditingWorkoutId(null);
          }
        }}
      />
    </>
  );
}
