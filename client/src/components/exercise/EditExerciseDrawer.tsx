import { useState } from 'react';
import type { ScheduledExercise } from '../../types';
import { EXERCISE_BODY_PARTS, EXERCISE_CATEGORIES } from '../../types';
import { api } from '../../services/api';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import { NumberInput } from '../ui/NumberInput';
import { ExerciseHowToVideoButton } from './ExerciseHowToVideoButton';
import { RepSchemeSelect } from './RepSchemeSelect';
import { SpeedSchemeSelect } from './SpeedSchemeSelect';

function toInput(value?: number | null) {
  return value == null ? '' : String(value);
}

export function EditExerciseDrawer({
  open,
  item,
  onClose,
  onSaved,
  onRemove
}: {
  open: boolean;
  item?: ScheduledExercise;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  onRemove?: (id: string) => void | Promise<void>;
}) {
  return (
    <Drawer open={open} title={item ? `Edit — ${item.exercise.name}` : 'Edit exercise'} onClose={onClose}>
      {open && item && (
        <EditExerciseDrawerContent
          key={item.id}
          item={item}
          onClose={onClose}
          onSaved={onSaved}
          onRemove={onRemove}
        />
      )}
    </Drawer>
  );
}

function EditExerciseDrawerContent({
  item,
  onClose,
  onSaved,
  onRemove
}: {
  item: ScheduledExercise;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  onRemove?: (id: string) => void | Promise<void>;
}) {
  const [sets, setSets] = useState(() => toInput(item.sets));
  const [reps, setReps] = useState<string | null>(() => item.reps ?? null);
  const [speed, setSpeed] = useState<string | null>(() => item.speed ?? null);
  const [durationMinutes, setDurationMinutes] = useState(() => toInput(item.durationMinutes));
  const [weight, setWeight] = useState(() => toInput(item.weight));
  const [description, setDescription] = useState(() => item.exercise.description ?? '');
  const [category, setCategory] = useState(() => item.exercise.category ?? '');
  const [bodyPart, setBodyPart] = useState(() => item.exercise.bodyPart ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  async function save() {
    setSaving(true);
    setError(undefined);
    try {
      await api(`/api/scheduled-exercises/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          sets: sets === '' ? null : Number(sets),
          reps,
          speed,
          durationMinutes: durationMinutes === '' ? null : Number(durationMinutes),
          weight: weight === '' ? null : Number(weight),
          description: description.trim() || null,
          category: category.trim() || null,
          bodyPart: bodyPart.trim() || null
        })
      });
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save exercise');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    setError(undefined);
    try {
      if (onRemove) {
        await onRemove(item.id);
      } else {
        await api(`/api/scheduled-exercises/${item.id}`, { method: 'DELETE' });
        await onSaved();
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove exercise');
    } finally {
      setSaving(false);
    }
  }

  return (
        <div className="space-y-4">
          {item.exercise.howToVideoUrl && (
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <ExerciseHowToVideoButton
                name={item.exercise.name}
                videoUrl={item.exercise.howToVideoUrl}
                variant="primary"
              />
              <p className="text-sm text-slate-600">Watch the how-to video for this exercise.</p>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="text-sm">
              <span className="font-medium text-slate-700">Sets</span>
              <NumberInput
                min={0}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                value={sets}
                onChange={setSets}
              />
            </label>
            <label className="text-sm">
              <span className="font-medium text-slate-700">Reps</span>
              <RepSchemeSelect
                value={reps}
                onChange={setReps}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
              />
            </label>
            <label className="text-sm">
              <span className="font-medium text-slate-700">Speed</span>
              <SpeedSchemeSelect
                value={speed}
                onChange={setSpeed}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
              />
            </label>
            <label className="text-sm">
              <span className="font-medium text-slate-700">Minutes</span>
              <NumberInput
                min={0}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                value={durationMinutes}
                onChange={setDurationMinutes}
              />
            </label>
            <label className="text-sm">
              <span className="font-medium text-slate-700">Weight (lbs)</span>
              <NumberInput
                min={0}
                step="0.5"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                value={weight}
                onChange={setWeight}
              />
            </label>
          </div>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Body part</span>
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              value={bodyPart}
              onChange={(event) => setBodyPart(event.target.value)}
            >
              <option value="">Select body part…</option>
              {EXERCISE_BODY_PARTS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Type</span>
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="">Select type…</option>
              {EXERCISE_CATEGORIES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Description</span>
            <textarea
              className="mt-1 h-24 w-full rounded-xl border border-slate-200 px-3 py-2"
              placeholder="Notes, form cues, or instructions…"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
            <button
              type="button"
              className="rounded-xl border border-red-200 px-4 py-2 text-sm text-red-700 hover:bg-red-50"
              onClick={() => void remove()}
              disabled={saving}
            >
              Remove from day
            </button>
          </div>
        </div>
  );
}
