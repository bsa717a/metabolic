import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ExerciseCatalogItem, ExercisePlanTemplate, ExerciseTemplateItem } from '../../types';
import { api } from '../../services/api';
import { exercisePlanApi } from '../../utils/exercisePlanApi';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';

function toInput(value?: number | null) {
  return value == null ? '' : String(value);
}

function formatPlan(item: ExerciseTemplateItem) {
  if (item.sets != null) {
    const weight = item.weight != null ? ` @ ${item.weight} lbs` : '';
    return `${item.sets} sets × ${item.reps ?? '—'} reps${weight}`;
  }
  if (item.durationMinutes != null) return `${item.durationMinutes} min`;
  if (item.weight != null) return `${item.weight} lbs`;
  return 'No prescription set';
}

export function EditWorkoutDrawer({
  open,
  workoutId,
  clientId,
  onClose,
  onChanged
}: {
  open: boolean;
  workoutId: string | null;
  clientId?: string;
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}) {
  const endpoints = exercisePlanApi(clientId);
  return (
    <Drawer
      open={open}
      title="Edit workout"
      onClose={onClose}
      panelClassName="max-w-lg"
      zIndexClass="z-[60]"
    >
      {open && workoutId && (
        <EditWorkoutDrawerContent
          workoutId={workoutId}
          endpoints={endpoints}
          onClose={onClose}
          onChanged={onChanged}
        />
      )}
    </Drawer>
  );
}

function EditWorkoutDrawerContent({
  workoutId,
  endpoints,
  onClose,
  onChanged
}: {
  workoutId: string;
  endpoints: ReturnType<typeof exercisePlanApi>;
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}) {
  const [workout, setWorkout] = useState<ExercisePlanTemplate | null>(null);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [catalog, setCatalog] = useState<ExerciseCatalogItem[]>([]);
  const [query, setQuery] = useState('');
  const [selectedExercise, setSelectedExercise] = useState<ExerciseCatalogItem | null>(null);
  const [sets, setSets] = useState('');
  const [reps, setReps] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [weight, setWeight] = useState('');
  const [addingExercise, setAddingExercise] = useState(false);

  const [editItem, setEditItem] = useState<ExerciseTemplateItem | null>(null);
  const [editSets, setEditSets] = useState('');
  const [editReps, setEditReps] = useState('');
  const [editDuration, setEditDuration] = useState('');
  const [editWeight, setEditWeight] = useState('');
  const [savingItem, setSavingItem] = useState(false);

  const filteredCatalog = useMemo(
    () => catalog.filter((item) => item.name.toLowerCase().includes(query.trim().toLowerCase())),
    [catalog, query]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api<ExercisePlanTemplate>(endpoints.template(workoutId));
      setWorkout(data);
      setName(data.name);
    } catch (err) {
      setWorkout(null);
      setError(err instanceof Error ? err.message : 'Unable to load workout');
    } finally {
      setLoading(false);
    }
  }, [workoutId, endpoints]);

  useEffect(() => {
    void load();
    api<ExerciseCatalogItem[]>('/api/exercises').then(setCatalog).catch(() => setCatalog([]));
  }, [load]);

  function selectCatalogExercise(item: ExerciseCatalogItem) {
    setSelectedExercise(item);
    setSets(toInput(item.defaultSets));
    setReps(toInput(item.defaultReps));
    setDurationMinutes(toInput(item.defaultDurationMinutes));
  }

  function startEditItem(item: ExerciseTemplateItem) {
    setEditItem(item);
    setEditSets(toInput(item.sets));
    setEditReps(toInput(item.reps));
    setEditDuration(toInput(item.durationMinutes));
    setEditWeight(toInput(item.weight));
  }

  async function handleSaveName() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === workout?.name) return;
    setSavingName(true);
    setError('');
    try {
      const updated = await api<ExercisePlanTemplate>(endpoints.template(workoutId), {
        method: 'PATCH',
        body: JSON.stringify({ name: trimmed })
      });
      setWorkout(updated);
      setName(updated.name);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to rename workout');
    } finally {
      setSavingName(false);
    }
  }

  async function handleAddExercise() {
    if (!selectedExercise) {
      setError('Select an exercise first.');
      return;
    }
    setAddingExercise(true);
    setError('');
    try {
      const updated = await api<ExercisePlanTemplate>(endpoints.templateItems(workoutId), {
        method: 'POST',
        body: JSON.stringify({
          exerciseId: selectedExercise.id,
          sets: sets ? Number(sets) : null,
          reps: reps ? Number(reps) : null,
          durationMinutes: durationMinutes ? Number(durationMinutes) : null,
          weight: weight ? Number(weight) : null
        })
      });
      setWorkout(updated);
      setSelectedExercise(null);
      setQuery('');
      setSets('');
      setReps('');
      setDurationMinutes('');
      setWeight('');
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add exercise');
    } finally {
      setAddingExercise(false);
    }
  }

  async function handleSaveItem() {
    if (!editItem) return;
    setSavingItem(true);
    setError('');
    try {
      const updated = await api<ExercisePlanTemplate>(endpoints.templateItem(editItem.id), {
        method: 'PATCH',
        body: JSON.stringify({
          sets: editSets ? Number(editSets) : null,
          reps: editReps ? Number(editReps) : null,
          durationMinutes: editDuration ? Number(editDuration) : null,
          weight: editWeight ? Number(editWeight) : null
        })
      });
      setWorkout(updated);
      setEditItem(null);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save exercise');
    } finally {
      setSavingItem(false);
    }
  }

  async function handleRemoveItem(item: ExerciseTemplateItem) {
    if (!window.confirm(`Remove ${item.exercise.name} from this workout?`)) return;
    setError('');
    try {
      await api(endpoints.templateItem(item.id), { method: 'DELETE' });
      await load();
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to remove exercise');
    }
  }

  async function handleDeleteWorkout() {
    if (!window.confirm(`Delete "${workout?.name}"? Days using it in your routine will become rest days.`)) return;
    setDeleting(true);
    setError('');
    try {
      await api(endpoints.template(workoutId), { method: 'DELETE' });
      await onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete workout');
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-app-text-muted">Loading workout…</p>;
  }

  if (!workout) {
    return <p className="text-sm text-red-600">{error || 'Workout not found.'}</p>;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <label className="text-sm font-semibold text-app-text" htmlFor="workout-name">
          Workout name
        </label>
        <div className="flex gap-2">
          <input
            id="workout-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-app-border bg-app-surface px-3 py-2 text-sm"
          />
          <Button
            type="button"
            variant="secondary"
            disabled={savingName || !name.trim() || name.trim() === workout.name}
            onClick={() => void handleSaveName()}
          >
            {savingName ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-app-text">Exercises</h3>
        {workout.items.length === 0 ? (
          <p className="text-sm text-app-text-muted">No exercises yet. Add some below.</p>
        ) : (
          <ul className="space-y-2">
            {workout.items.map((item) => (
              <li
                key={item.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-app-border px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-app-text">{item.exercise.name}</p>
                  <p className="text-xs text-app-text-muted">{formatPlan(item)}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    className="text-xs font-semibold text-brand-green"
                    onClick={() => startEditItem(item)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="text-xs font-semibold text-red-600"
                    onClick={() => void handleRemoveItem(item)}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {editItem && (
        <div className="space-y-3 rounded-xl border border-app-border p-4">
          <p className="font-semibold text-app-text">{editItem.exercise.name}</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-app-text-muted">
              Sets
              <input
                type="number"
                value={editSets}
                onChange={(event) => setEditSets(event.target.value)}
                className="mt-1 w-full rounded-lg border border-app-border px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs text-app-text-muted">
              Reps
              <input
                type="number"
                value={editReps}
                onChange={(event) => setEditReps(event.target.value)}
                className="mt-1 w-full rounded-lg border border-app-border px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs text-app-text-muted">
              Minutes
              <input
                type="number"
                value={editDuration}
                onChange={(event) => setEditDuration(event.target.value)}
                className="mt-1 w-full rounded-lg border border-app-border px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs text-app-text-muted">
              Weight (lbs)
              <input
                type="number"
                value={editWeight}
                onChange={(event) => setEditWeight(event.target.value)}
                className="mt-1 w-full rounded-lg border border-app-border px-2 py-1.5 text-sm"
              />
            </label>
          </div>
          <div className="flex gap-2">
            <Button type="button" disabled={savingItem} onClick={() => void handleSaveItem()}>
              {savingItem ? 'Saving…' : 'Save exercise'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setEditItem(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-3 rounded-xl border border-dashed border-app-border p-4">
        <h3 className="text-sm font-semibold text-app-text">Add exercise</h3>
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search exercises…"
          className="w-full rounded-xl border border-app-border bg-app-surface px-3 py-2 text-sm"
        />
        <ul className="max-h-40 space-y-1 overflow-y-auto">
          {filteredCatalog.slice(0, 20).map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => selectCatalogExercise(item)}
                className={`w-full rounded-lg px-2 py-1.5 text-left text-sm ${
                  selectedExercise?.id === item.id ? 'bg-brand-green/10 font-semibold' : 'hover:bg-app-muted'
                }`}
              >
                {item.name}
              </button>
            </li>
          ))}
        </ul>
        {selectedExercise && (
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-app-text-muted">
              Sets
              <input
                type="number"
                value={sets}
                onChange={(event) => setSets(event.target.value)}
                className="mt-1 w-full rounded-lg border border-app-border px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs text-app-text-muted">
              Reps
              <input
                type="number"
                value={reps}
                onChange={(event) => setReps(event.target.value)}
                className="mt-1 w-full rounded-lg border border-app-border px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs text-app-text-muted">
              Minutes
              <input
                type="number"
                value={durationMinutes}
                onChange={(event) => setDurationMinutes(event.target.value)}
                className="mt-1 w-full rounded-lg border border-app-border px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs text-app-text-muted">
              Weight (lbs)
              <input
                type="number"
                value={weight}
                onChange={(event) => setWeight(event.target.value)}
                className="mt-1 w-full rounded-lg border border-app-border px-2 py-1.5 text-sm"
              />
            </label>
          </div>
        )}
        <Button
          type="button"
          variant="secondary"
          disabled={addingExercise || !selectedExercise}
          onClick={() => void handleAddExercise()}
        >
          {addingExercise ? 'Adding…' : 'Add to workout'}
        </Button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap gap-2 border-t border-app-border pt-4">
        <Button type="button" variant="secondary" onClick={onClose}>
          Done
        </Button>
        <Button type="button" variant="secondary" disabled={deleting} onClick={() => void handleDeleteWorkout()}>
          {deleting ? 'Deleting…' : 'Delete workout'}
        </Button>
      </div>
    </div>
  );
}
