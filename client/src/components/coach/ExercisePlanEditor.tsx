import { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/api';
import type { ExercisePlanTemplateSummary, ScheduledExercise } from '../../types';
import type { ExercisePlanUndoResponse } from '../../types/exercisePlanUndo';
import { formatPlan } from '../../utils/exerciseFormat';
import { CoachDayExerciseEditor } from './CoachDayExerciseEditor';
import { Button } from '../ui/Button';

export function ExercisePlanEditor({
  clientId,
  planDate,
  exerciseTemplates,
  saving,
  manualOpen,
  onManualOpenChange,
  onSavingChange,
  onError,
  onRefresh
}: {
  clientId: string;
  planDate: string;
  exerciseTemplates: ExercisePlanTemplateSummary[];
  saving: boolean;
  manualOpen: boolean;
  onManualOpenChange: (open: boolean) => void;
  onSavingChange: (saving: boolean) => void;
  onError: (message: string) => void;
  onRefresh: () => Promise<void>;
}) {
  const [exercises, setExercises] = useState<ScheduledExercise[]>([]);
  const [loading, setLoading] = useState(false);
  const [templateId, setTemplateId] = useState('');
  const [setAsDefault, setSetAsDefault] = useState(true);

  const loadExercises = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<ScheduledExercise[]>(`/api/coach/users/${clientId}/daily-logs/${planDate}/exercises`);
      setExercises(data);
    } catch (err) {
      setExercises([]);
      onError(err instanceof Error ? err.message : 'Unable to load exercises');
    } finally {
      setLoading(false);
    }
  }, [clientId, onError, planDate]);

  useEffect(() => {
    void loadExercises();
  }, [loadExercises]);

  useEffect(() => {
    setTemplateId((current) => current || exerciseTemplates[0]?.id || '');
  }, [exerciseTemplates]);

  async function applyTemplate() {
    if (!templateId) {
      onError('Choose an exercise plan first.');
      return;
    }
    onSavingChange(true);
    onError('');
    try {
      const updated = await api<ExercisePlanUndoResponse & { exercises: ScheduledExercise[] }>(
        `/api/coach/users/${clientId}/daily-logs/${planDate}/apply-exercise-template`,
        {
          method: 'POST',
          body: JSON.stringify({ templateId, setAsDefault })
        }
      );
      setExercises(updated.exercises);
      await onRefresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to apply exercise plan');
    } finally {
      onSavingChange(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[12rem] flex-1 text-sm">
          <span className="mb-1 block font-medium">Exercise plan</span>
          <select
            className="w-full rounded-xl border border-app-border bg-app-surface px-3 py-2"
            value={templateId}
            onChange={(event) => setTemplateId(event.target.value)}
          >
            {exerciseTemplates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </label>
        <Button disabled={saving || !exerciseTemplates.length} onClick={() => void applyTemplate()}>
          Apply plan
        </Button>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={setAsDefault} onChange={(event) => setSetAsDefault(event.target.checked)} />
        Set as the user&apos;s default going forward
      </label>

      {loading ? (
        <p className="text-sm text-app-text-muted">Loading exercises...</p>
      ) : exercises.length === 0 ? (
        <p className="rounded-xl bg-app-muted p-4 text-sm text-app-text-muted">
          No exercises planned for this day. Apply a plan to get started.
        </p>
      ) : (
        <ul className="space-y-2">
          {exercises.map((item) => (
            <li key={item.id} className="rounded-xl border border-app-border p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">{item.exercise.name}</p>
                <span className="text-xs uppercase text-app-text-muted">{item.status}</span>
              </div>
              <p className="mt-1 text-sm text-app-text-muted">{formatPlan(item)}</p>
            </li>
          ))}
        </ul>
      )}

      <CoachDayExerciseEditor
        open={manualOpen}
        clientId={clientId}
        planDate={planDate}
        exerciseTemplates={exerciseTemplates}
        onClose={() => {
          onManualOpenChange(false);
          void loadExercises();
        }}
        onRefresh={onRefresh}
      />
    </div>
  );
}
