import { useEffect, useState } from 'react';
import type { ExerciseCatalogItem, ExerciseTemplateItem } from '../../types';
import { api } from '../../services/api';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import { NumberInput } from '../ui/NumberInput';
import { RepSchemeSelect } from '../exercise/RepSchemeSelect';
import { SpeedSchemeSelect } from '../exercise/SpeedSchemeSelect';

function toInput(value?: number | null) {
  return value == null ? '' : String(value);
}

export function EditTemplateExerciseDrawer({
  open,
  templateId,
  item,
  onClose,
  onSaved,
  zIndexClass
}: {
  open: boolean;
  templateId?: string;
  item?: ExerciseTemplateItem;
  onClose: () => void;
  onSaved: () => void;
  zIndexClass?: string;
}) {
  const isEdit = Boolean(item);
  const [catalog, setCatalog] = useState<ExerciseCatalogItem[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<ExerciseCatalogItem | null>(null);
  const [sets, setSets] = useState('');
  const [reps, setReps] = useState<string | null>(null);
  const [speed, setSpeed] = useState<string | null>(null);
  const [durationMinutes, setDurationMinutes] = useState('');
  const [weight, setWeight] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    api<ExerciseCatalogItem[]>('/api/exercises').then(setCatalog).catch(() => setCatalog([]));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setError('');
      if (item) {
        setSelected(null);
        setQuery('');
        setSets(toInput(item.sets));
        setReps(item.reps ?? null);
        setSpeed(item.speed ?? null);
        setDurationMinutes(toInput(item.durationMinutes));
        setWeight(toInput(item.weight));
        return;
      }
      setSelected(null);
      setQuery('');
      setSets('');
      setReps(null);
      setSpeed(null);
      setDurationMinutes('');
      setWeight('');
    });
  }, [open, item]);

  function selectExercise(exercise: ExerciseCatalogItem) {
    setSelected(exercise);
    setSets(toInput(exercise.defaultSets));
    setReps(exercise.defaultReps == null ? null : String(exercise.defaultReps));
    setSpeed(null);
    setDurationMinutes(toInput(exercise.defaultDurationMinutes));
  }

  const filtered = catalog.filter((exercise) => exercise.name.toLowerCase().includes(query.trim().toLowerCase()));

  async function save() {
    if (!templateId) return;
    setSaving(true);
    setError('');
    try {
      const payload = {
        sets: sets ? Number(sets) : null,
        reps,
        speed,
        durationMinutes: durationMinutes ? Number(durationMinutes) : null,
        weight: weight ? Number(weight) : null
      };

      if (item) {
        await api(`/api/admin/exercise-template-items/${item.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload)
        });
      } else {
        if (!selected) {
          setError('Select an exercise first.');
          return;
        }
        await api(`/api/admin/exercise-templates/${templateId}/items`, {
          method: 'POST',
          body: JSON.stringify({
            exerciseId: selected.id,
            ...payload
          })
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save exercise');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open={open}
      title={isEdit ? `Edit — ${item?.exercise.name ?? 'Exercise'}` : 'Add exercise'}
      zIndexClass={zIndexClass}
      onClose={onClose}
    >
      <div className="space-y-4">
        {!isEdit && (
          <>
            <input
              className="w-full rounded-xl border border-app-border bg-app-surface text-app-text px-3 py-2 text-sm"
              placeholder="Search exercises…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <ul className="max-h-48 space-y-1 overflow-y-auto">
              {filtered.map((exercise) => (
                <li key={exercise.id}>
                  <button
                    type="button"
                    className={`w-full rounded-xl px-3 py-2 text-left text-sm ${
                      selected?.id === exercise.id ? 'bg-blue-50 text-blue-700' : 'hover:bg-app-muted'
                    }`}
                    onClick={() => selectExercise(exercise)}
                  >
                    <span className="font-medium">{exercise.name}</span>
                    {exercise.bodyPart && <span className="ml-2 text-xs uppercase text-app-text-muted">{exercise.bodyPart}</span>}
                  </button>
                </li>
              ))}
              {!filtered.length && <li className="px-3 py-2 text-sm text-app-text-muted">No exercises found.</li>}
            </ul>
          </>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-app-text">Sets</span>
            <NumberInput
              min={0}
              className="w-full rounded-xl border border-app-border bg-app-surface text-app-text px-3 py-2"
              value={sets}
              onChange={setSets}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-app-text">Reps</span>
            <RepSchemeSelect
              value={reps}
              onChange={setReps}
              className="w-full rounded-xl border border-app-border bg-app-surface px-3 py-2 text-sm font-semibold text-app-text"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-app-text">Speed</span>
            <SpeedSchemeSelect
              value={speed}
              onChange={setSpeed}
              className="w-full rounded-xl border border-app-border bg-app-surface px-3 py-2 text-sm font-semibold text-app-text"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-app-text">Duration (min)</span>
            <NumberInput
              min={0}
              className="w-full rounded-xl border border-app-border bg-app-surface text-app-text px-3 py-2"
              value={durationMinutes}
              onChange={setDurationMinutes}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-app-text">Weight (lbs)</span>
            <NumberInput
              min={0}
              step={0.5}
              className="w-full rounded-xl border border-app-border bg-app-surface text-app-text px-3 py-2"
              value={weight}
              onChange={setWeight}
            />
          </label>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <Button type="button" className="w-full" disabled={saving} onClick={() => void save()}>
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add to plan'}
        </Button>
      </div>
    </Drawer>
  );
}
