import { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/api';
import type { ExercisePlanTemplate, ExerciseTemplateItem } from '../../types';
import { formatPlan } from '../../utils/exerciseFormat';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import { NumberInput } from '../ui/NumberInput';
import { RepSchemeSelect } from '../exercise/RepSchemeSelect';
import { SpeedSchemeSelect } from '../exercise/SpeedSchemeSelect';

function toInput(value?: number | null) {
  return value == null ? '' : String(value);
}

export function CoachManualExerciseTemplateDrawer({
  open,
  templateId,
  onClose
}: {
  open: boolean;
  templateId: string;
  onClose: () => void;
}) {
  const [template, setTemplate] = useState<ExercisePlanTemplate | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editItem, setEditItem] = useState<ExerciseTemplateItem | null>(null);
  const [sets, setSets] = useState('');
  const [reps, setReps] = useState<string | null>(null);
  const [speed, setSpeed] = useState<string | null>(null);
  const [durationMinutes, setDurationMinutes] = useState('');
  const [weight, setWeight] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!templateId) return;
    setLoading(true);
    setError('');
    try {
      const data = await api<ExercisePlanTemplate>(`/api/coach/exercise-templates/${templateId}`);
      setTemplate(data);
    } catch (err) {
      setTemplate(null);
      setError(err instanceof Error ? err.message : 'Unable to load plan');
    } finally {
      setLoading(false);
    }
  }, [templateId]);

  useEffect(() => {
    if (open) void load();
  }, [load, open]);

  function startEdit(item: ExerciseTemplateItem) {
    setEditItem(item);
    setSets(toInput(item.sets));
    setReps(item.reps ?? null);
    setSpeed(item.speed ?? null);
    setDurationMinutes(toInput(item.durationMinutes));
    setWeight(toInput(item.weight));
  }

  async function saveEdit() {
    if (!editItem) return;
    setSaving(true);
    setError('');
    try {
      await api(`/api/coach/exercise-template-items/${editItem.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          sets: sets ? Number(sets) : null,
          reps,
          speed,
          durationMinutes: durationMinutes ? Number(durationMinutes) : null,
          weight: weight ? Number(weight) : null
        })
      });
      setEditItem(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save exercise');
    } finally {
      setSaving(false);
    }
  }

  async function removeItem(item: ExerciseTemplateItem) {
    if (!confirm(`Remove ${item.exercise.name} from this plan?`)) return;
    setError('');
    try {
      await api(`/api/coach/exercise-template-items/${item.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to remove exercise');
    }
  }

  return (
    <Drawer
      open={open}
      title={template ? `Edit plan — ${template.name}` : 'Edit exercise plan'}
      onClose={onClose}
      panelClassName="max-w-lg"
    >
      {loading ? (
        <p className="text-sm text-app-text-muted">Loading plan...</p>
      ) : (
        <div className="space-y-4">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <p className="text-sm text-app-text-muted">
            Edit the plan exercises below, then close and apply the plan to update the client&apos;s day.
          </p>

          {editItem ? (
            <div className="space-y-3 rounded-xl border border-app-border p-4">
              <p className="font-semibold">{editItem.exercise.name}</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">
                  <span className="mb-1 block text-app-text-muted">Sets</span>
                  <NumberInput
                    min={0}
                    className="w-full rounded-xl border border-app-border px-3 py-2"
                    value={sets}
                    onChange={setSets}
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-app-text-muted">Reps</span>
                  <RepSchemeSelect
                    value={reps}
                    onChange={setReps}
                    className="w-full rounded-xl border border-app-border bg-app-surface px-3 py-2 text-sm font-semibold text-app-text"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-app-text-muted">Speed</span>
                  <SpeedSchemeSelect
                    value={speed}
                    onChange={setSpeed}
                    className="w-full rounded-xl border border-app-border bg-app-surface px-3 py-2 text-sm font-semibold text-app-text"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-app-text-muted">Duration (min)</span>
                  <NumberInput
                    min={0}
                    className="w-full rounded-xl border border-app-border px-3 py-2"
                    value={durationMinutes}
                    onChange={setDurationMinutes}
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-app-text-muted">Weight (lbs)</span>
                  <NumberInput
                    min={0}
                    className="w-full rounded-xl border border-app-border px-3 py-2"
                    value={weight}
                    onChange={setWeight}
                  />
                </label>
              </div>
              <div className="flex gap-2">
                <Button disabled={saving} onClick={() => void saveEdit()}>
                  {saving ? 'Saving...' : 'Save'}
                </Button>
                <Button variant="secondary" onClick={() => setEditItem(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <ul className="space-y-2">
              {template?.items.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-app-border p-3">
                  <div>
                    <p className="font-semibold">{item.exercise.name}</p>
                    <p className="text-xs text-app-text-muted">{formatPlan(item)}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => startEdit(item)}>
                      Edit
                    </Button>
                    <Button variant="secondary" onClick={() => void removeItem(item)}>
                      Remove
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {!template?.items.length && !editItem && (
            <p className="text-sm text-app-text-muted">This plan has no exercises yet.</p>
          )}
        </div>
      )}
    </Drawer>
  );
}
