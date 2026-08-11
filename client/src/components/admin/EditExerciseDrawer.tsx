import { useEffect, useState } from 'react';
import type { AdminExercise } from '../../types';
import { EXERCISE_BODY_PARTS, EXERCISE_CATEGORIES } from '../../types';
import { api } from '../../services/api';
import {
  uploadExerciseHowToVideo,
  validateExerciseVideoFile
} from '../../services/exerciseVideoStorage';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import { NumberInput } from '../ui/NumberInput';

type ExerciseDraft = {
  name: string;
  category: string;
  bodyPart: string;
  description: string;
  defaultSets: string;
  defaultReps: string;
  defaultDurationMinutes: string;
  defaultDistance: string;
};

function emptyDraft(): ExerciseDraft {
  return {
    name: '',
    category: '',
    bodyPart: '',
    description: '',
    defaultSets: '',
    defaultReps: '',
    defaultDurationMinutes: '',
    defaultDistance: ''
  };
}

function toDraft(exercise: AdminExercise): ExerciseDraft {
  return {
    name: exercise.name,
    category: exercise.category ?? '',
    bodyPart: exercise.bodyPart ?? '',
    description: exercise.description ?? '',
    defaultSets: exercise.defaultSets == null ? '' : String(exercise.defaultSets),
    defaultReps: exercise.defaultReps == null ? '' : String(exercise.defaultReps),
    defaultDurationMinutes: exercise.defaultDurationMinutes == null ? '' : String(exercise.defaultDurationMinutes),
    defaultDistance: exercise.defaultDistance == null ? '' : String(exercise.defaultDistance)
  };
}

function labelClassName() {
  return 'mb-1 block text-sm font-medium text-app-text-muted';
}

function inputClassName() {
  return 'w-full rounded-xl border border-app-border bg-app-surface px-3 py-2 text-sm text-app-text outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200';
}

function parseOptionalInt(value: string, label: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${label} must be a whole number zero or greater.`);
  return parsed;
}

function parseOptionalNumber(value: string, label: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} must be a valid number zero or greater.`);
  return parsed;
}

export function EditExerciseDrawer({
  open,
  exercise,
  mode,
  onClose,
  onSaved
}: {
  open: boolean;
  exercise?: AdminExercise;
  mode: 'create' | 'edit';
  onClose: () => void;
  onSaved: (exercise: AdminExercise) => void;
}) {
  const title = mode === 'create' ? 'New exercise' : (exercise?.name ?? 'Edit exercise');

  return (
    <Drawer open={open} title={title} onClose={onClose}>
      {open && mode === 'create' && (
        <EditExerciseDrawerContent key="create" onClose={onClose} onSaved={onSaved} />
      )}
      {open && mode === 'edit' && exercise && (
        <EditExerciseDrawerContent key={exercise.id} exercise={exercise} onClose={onClose} onSaved={onSaved} />
      )}
    </Drawer>
  );
}

function EditExerciseDrawerContent({
  exercise,
  onClose,
  onSaved
}: {
  exercise?: AdminExercise;
  onClose: () => void;
  onSaved: (exercise: AdminExercise) => void;
}) {
  const isCreate = !exercise;
  const [draft, setDraft] = useState(() => (exercise ? toDraft(exercise) : emptyDraft()));
  const [howToVideoUrl, setHowToVideoUrl] = useState<string | null>(exercise?.howToVideoUrl ?? null);
  const [pendingVideoFile, setPendingVideoFile] = useState<File | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [createdExerciseId, setCreatedExerciseId] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (pendingPreviewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(pendingPreviewUrl);
      }
    };
  }, [pendingPreviewUrl]);

  function updateDraft<K extends keyof ExerciseDraft>(field: K, value: ExerciseDraft[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function selectVideoFile(file: File) {
    try {
      validateExerciseVideoFile(file);
      if (pendingPreviewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(pendingPreviewUrl);
      }
      setPendingVideoFile(file);
      setPendingPreviewUrl(URL.createObjectURL(file));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to use that video');
    }
  }

  function removeVideo() {
    if (pendingPreviewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(pendingPreviewUrl);
    }
    setPendingVideoFile(null);
    setPendingPreviewUrl(null);
    setHowToVideoUrl(null);
  }

  const previewVideoUrl = pendingPreviewUrl ?? howToVideoUrl;

  async function save() {
    setSaving(true);
    setError('');
    try {
      if (!draft.name.trim()) throw new Error('Name is required.');

      const payload = {
        name: draft.name.trim(),
        category: draft.category.trim() ? draft.category.trim() : null,
        bodyPart: draft.bodyPart.trim() ? draft.bodyPart.trim() : null,
        description: draft.description.trim() ? draft.description.trim() : null,
        defaultSets: parseOptionalInt(draft.defaultSets, 'Default sets'),
        defaultReps: parseOptionalInt(draft.defaultReps, 'Default reps'),
        defaultDurationMinutes: parseOptionalInt(draft.defaultDurationMinutes, 'Default duration'),
        defaultDistance: parseOptionalNumber(draft.defaultDistance, 'Default distance')
      };

      let updated: AdminExercise;

      if (isCreate) {
        if (createdExerciseId) {
          updated = await api<AdminExercise>(`/api/admin/exercises/${createdExerciseId}`, {
            method: 'PATCH',
            body: JSON.stringify(payload)
          });
        } else {
          updated = await api<AdminExercise>('/api/admin/exercises', {
            method: 'POST',
            body: JSON.stringify(payload)
          });
          setCreatedExerciseId(updated.id);
        }
      } else {
        updated = await api<AdminExercise>(`/api/admin/exercises/${exercise.id}`, {
          method: 'PATCH',
          body: JSON.stringify(
            pendingVideoFile
              ? payload
              : {
                  ...payload,
                  howToVideoUrl
                }
          )
        });
      }

      if (pendingVideoFile) {
        updated = await uploadExerciseHowToVideo(updated.id, pendingVideoFile);
      }

      onSaved(updated);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save exercise');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-app-text-muted">
        {isCreate
          ? 'Add a new exercise to the catalog with optional how-to video and default prescription values.'
          : 'Update exercise details, how-to video, and default prescription values.'}
      </p>

      <label className="block">
        <span className={labelClassName()}>Name</span>
        <input className={inputClassName()} value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} />
      </label>

      <label className="block">
        <span className={labelClassName()}>Category</span>
        <select className={inputClassName()} value={draft.category} onChange={(event) => updateDraft('category', event.target.value)}>
          <option value="">None</option>
          {EXERCISE_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className={labelClassName()}>Body part</span>
        <select className={inputClassName()} value={draft.bodyPart} onChange={(event) => updateDraft('bodyPart', event.target.value)}>
          <option value="">None</option>
          {EXERCISE_BODY_PARTS.map((bodyPart) => (
            <option key={bodyPart} value={bodyPart}>
              {bodyPart}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className={labelClassName()}>Description</span>
        <textarea
          className={`${inputClassName()} min-h-24 resize-y`}
          value={draft.description}
          onChange={(event) => updateDraft('description', event.target.value)}
          placeholder="Optional"
        />
      </label>

      <div className="rounded-2xl border border-app-border p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-app-text">How-to video</p>
            <p className="text-xs text-app-text-muted">MP4, WebM, or MOV up to 100 MB.</p>
          </div>
          {(previewVideoUrl || pendingVideoFile) && (
            <button
              type="button"
              className="text-sm text-red-600 hover:text-red-700"
              onClick={removeVideo}
              disabled={saving}
            >
              Remove video
            </button>
          )}
        </div>

        {previewVideoUrl ? (
          <video controls playsInline className="mb-3 w-full rounded-xl bg-black" src={previewVideoUrl}>
            Your browser does not support video playback.
          </video>
        ) : (
          <p className="mb-3 text-sm text-app-text-muted">No how-to video uploaded yet.</p>
        )}

        <label className="inline-flex cursor-pointer items-center rounded-xl border border-app-border bg-app-surface text-app-text px-3 py-2 text-sm font-medium text-app-text hover:bg-app-muted">
          {previewVideoUrl ? 'Replace video' : 'Upload video'}
          <input
            type="file"
            accept="video/mp4,video/webm,video/quicktime,video/*"
            className="hidden"
            disabled={saving}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) selectVideoFile(file);
              event.target.value = '';
            }}
          />
        </label>
        {pendingVideoFile && <p className="mt-2 text-xs text-app-text-muted">Selected: {pendingVideoFile.name}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className={labelClassName()}>Default sets</span>
          <NumberInput
            className={inputClassName()}
            min={0}
            step={1}
            value={draft.defaultSets}
            onChange={(value) => updateDraft('defaultSets', value)}
          />
        </label>
        <label className="block">
          <span className={labelClassName()}>Default reps</span>
          <NumberInput
            className={inputClassName()}
            min={0}
            step={1}
            value={draft.defaultReps}
            onChange={(value) => updateDraft('defaultReps', value)}
          />
        </label>
        <label className="block">
          <span className={labelClassName()}>Default duration (min)</span>
          <NumberInput
            className={inputClassName()}
            min={0}
            step={1}
            value={draft.defaultDurationMinutes}
            onChange={(value) => updateDraft('defaultDurationMinutes', value)}
          />
        </label>
        <label className="block">
          <span className={labelClassName()}>Default distance (mi)</span>
          <NumberInput
            className={inputClassName()}
            min={0}
            step={0.01}
            value={draft.defaultDistance}
            onChange={(value) => updateDraft('defaultDistance', value)}
          />
        </label>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3 pt-2">
        <Button disabled={saving} onClick={save}>
          {saving ? 'Saving...' : isCreate ? 'Create exercise' : 'Save changes'}
        </Button>
        <Button variant="secondary" disabled={saving} onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
