import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { api } from '../../services/api';
import type { ExercisePlanTemplate, ExercisePlanTemplateSummary, ExerciseTemplateItem, ScheduledExercise } from '../../types';
import type { ExercisePlanUndoResponse } from '../../types/exercisePlanUndo';
import { exercisePlanUndoMessage } from '../../hooks/useExercisePlanUndo';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';

function formatTemplateItemPlan(item: ExerciseTemplateItem) {
  if (item.sets != null) {
    const weight = item.weight != null ? ` @ ${item.weight} lbs` : '';
    return `${item.sets} sets × ${item.reps ?? '—'} reps${weight}`;
  }
  if (item.durationMinutes != null) return `${item.durationMinutes} min`;
  if (item.weight != null) return `${item.weight} lbs`;
  return 'No prescription set';
}

export function ApplyExerciseTemplateModal({
  open,
  selectedDate,
  exercises,
  onClose,
  onApplied,
  registerUndo,
  applyUrl
}: {
  open: boolean;
  selectedDate: string;
  exercises: ScheduledExercise[];
  onClose: () => void;
  onApplied: () => void | Promise<void>;
  registerUndo?: (message: string, snapshot: import('../../types/exercisePlanUndo').ExercisePlanUndoSnapshot | undefined) => void;
  applyUrl?: string;
}) {
  const [templates, setTemplates] = useState<ExercisePlanTemplateSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [setAsDefault, setSetAsDefault] = useState(true);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [templateDetails, setTemplateDetails] = useState<Record<string, ExercisePlanTemplate>>({});
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);

  const hasCompleted = exercises.some((item) => item.status !== 'PLANNED');
  const applying = applyingId !== null;

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError('');
    setSelectedId(null);
    setTemplateDetails({});
    setDetailErrors({});
    api<ExercisePlanTemplateSummary[]>('/api/exercise-templates')
      .then(setTemplates)
      .catch((err) => {
        setTemplates([]);
        setError(err instanceof Error ? err.message : 'Unable to load plans');
      })
      .finally(() => setLoading(false));
  }, [open]);

  async function loadTemplateDetail(templateId: string) {
    if (templateDetails[templateId]) return;
    setLoadingDetailId(templateId);
    try {
      const detail = await api<ExercisePlanTemplate>(`/api/exercise-templates/${templateId}`);
      setTemplateDetails((current) => ({ ...current, [templateId]: detail }));
      setDetailErrors((current) => {
        const next = { ...current };
        delete next[templateId];
        return next;
      });
    } catch (err) {
      setDetailErrors((current) => ({
        ...current,
        [templateId]: err instanceof Error ? err.message : 'Unable to load plan details'
      }));
    } finally {
      setLoadingDetailId((current) => (current === templateId ? null : current));
    }
  }

  async function selectTemplate(templateId: string) {
    setError('');
    if (selectedId === templateId) {
      setSelectedId(null);
      return;
    }
    setSelectedId(templateId);
    await loadTemplateDetail(templateId);
  }

  async function apply(templateId: string) {
    if (applying) return;
    setApplyingId(templateId);
    setError('');
    try {
      const result = await api<ExercisePlanUndoResponse & { exercises: ScheduledExercise[] }>(
        applyUrl ?? `/api/daily-logs/${selectedDate}/apply-exercise-template`,
        {
          method: 'POST',
          body: JSON.stringify({ templateId, setAsDefault })
        }
      );
      if (registerUndo) {
        registerUndo(
          exercisePlanUndoMessage(result.undoSnapshot?.days.length ?? 1, 'Plan applied'),
          result.undoSnapshot
        );
      }
      await onApplied();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to apply plan');
    } finally {
      setApplyingId(null);
    }
  }

  return (
    <Drawer open={open} title="Use exercise plan" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-500">
          Apply a plan to <strong>{selectedDate}</strong>. This replaces all exercises planned for that day.
        </p>

        {hasCompleted && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            This day has completed or skipped exercises. Applying a plan will remove all exercises for this day.
          </div>
        )}

        {loading && <p className="text-sm text-slate-500">Loading plans…</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        {!loading && templates.length === 0 && !error && (
          <p className="text-sm text-slate-500">No plans available. Ask an admin to create one.</p>
        )}

        {!loading && templates.length > 0 && (
          <ul className="space-y-2">
            {templates.map((template) => {
              const selected = selectedId === template.id;
              const detail = templateDetails[template.id];
              const loadingDetail = loadingDetailId === template.id;
              const detailError = detailErrors[template.id];
              return (
                <li
                  key={template.id}
                  className={`rounded-2xl border transition ${
                    selected ? 'border-blue-300 bg-blue-50 ring-1 ring-blue-200' : 'border-slate-200 bg-white'
                  }`}
                >
                  <button
                    type="button"
                    className="flex w-full items-start justify-between gap-3 p-4 text-left"
                    disabled={applying}
                    onClick={() => void selectTemplate(template.id)}
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">{template.name}</p>
                      {template.description && <p className="mt-1 text-sm text-slate-500">{template.description}</p>}
                      <p className="mt-2 text-xs text-slate-400">{template.exerciseCount} exercises</p>
                    </div>
                    <ChevronDown
                      size={18}
                      className={`shrink-0 text-slate-400 transition-transform ${selected ? 'rotate-180' : ''}`}
                      aria-hidden
                    />
                  </button>
                  {selected && (
                    <div className="border-t border-blue-200/80 px-4 pb-4 pt-3">
                      {loadingDetail && <p className="text-sm text-slate-500">Loading exercises…</p>}
                      {!loadingDetail && detail && detail.items.length > 0 && (
                        <ul className="space-y-2">
                          {detail.items.map((item) => (
                            <li key={item.id} className="rounded-xl bg-white/80 px-3 py-2 text-sm ring-1 ring-blue-100">
                              <p className="font-medium text-slate-900">{item.exercise.name}</p>
                              <p className="mt-0.5 text-slate-500">{formatTemplateItemPlan(item)}</p>
                            </li>
                          ))}
                        </ul>
                      )}
                      {!loadingDetail && detail && detail.items.length === 0 && (
                        <p className="text-sm text-slate-500">This plan has no exercises yet.</p>
                      )}
                      {!loadingDetail && !detail && detailError && (
                        <p className="text-sm text-amber-700">Could not load preview. You can still apply this plan.</p>
                      )}
                      {!loadingDetail && (
                        <Button
                          type="button"
                          className="mt-3 px-3 py-1.5 text-xs"
                          disabled={applying}
                          onClick={() => void apply(template.id)}
                        >
                          {applyingId === template.id ? 'Applying…' : 'Apply'}
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={setAsDefault}
            onChange={(event) => setSetAsDefault(event.target.checked)}
          />
          <span>Use as my default plan for future days</span>
        </label>
      </div>
    </Drawer>
  );
}
