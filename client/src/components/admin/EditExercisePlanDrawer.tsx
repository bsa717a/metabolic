import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, GripVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../../services/api';
import type {
  ExercisePlanSummary,
  ExercisePlanTemplate,
  ExercisePlanTemplateSummary,
  ExerciseTemplateItem
} from '../../types';
import { formatPlanShort } from '../../utils/exerciseFormat';
import { EditExerciseTemplateDrawer } from './EditExerciseTemplateDrawer';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';

function reorderIds(ids: string[], fromId: string, toId: string) {
  const fromIndex = ids.indexOf(fromId);
  const toIndex = ids.indexOf(toId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return ids;
  const next = [...ids];
  next.splice(fromIndex, 1);
  next.splice(toIndex, 0, fromId);
  return next;
}

function rowTargetId(clientY: number, orderedIds: string[], rowRefs: Map<string, HTMLDivElement>) {
  for (const id of orderedIds) {
    const el = rowRefs.get(id);
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    if (clientY >= rect.top && clientY <= rect.bottom) return id;
  }
  return orderedIds[orderedIds.length - 1] ?? null;
}

function labelClassName() {
  return 'mb-1 block text-sm font-medium text-app-text-muted';
}

function inputClassName() {
  return 'w-full rounded-xl border border-app-border bg-app-surface px-3 py-2 text-sm text-app-text outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200';
}

function DayExercisePreview({ templateId, open }: { templateId: string; open: boolean }) {
  const [items, setItems] = useState<ExerciseTemplateItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!open) {
      setItems(null);
      setLoadError('');
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError('');
    api<ExercisePlanTemplate>(`/api/admin/exercise-templates/${templateId}`)
      .then((data) => {
        if (cancelled) return;
        setItems([...data.items].sort((a, b) => a.sortOrder - b.sortOrder));
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Unable to load exercises');
          setItems(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, templateId]);

  if (!open) return null;

  return (
    <div className="border-t border-app-border bg-app-muted/30 px-3 py-2">
      {loading && <p className="text-xs text-app-text-muted">Loading…</p>}
      {!loading && loadError && <p className="text-xs text-red-600">{loadError}</p>}
      {!loading && !loadError && items && items.length === 0 && (
        <p className="text-xs text-app-text-muted">No exercises yet</p>
      )}
      {!loading && !loadError && items && items.length > 0 && (
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.id} className="text-xs text-app-text">
              <span className="font-medium">{item.exercise.name}</span>
              <span className="text-app-text-muted"> · {formatPlanShort(item)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PlanDayRow({
  day,
  dayNumber,
  onEditExercises,
  onRemove,
  onDragStart,
  rowRef
}: {
  day: ExercisePlanTemplateSummary;
  dayNumber: number;
  onEditExercises: () => void;
  onRemove: () => void;
  onDragStart: () => void;
  rowRef: (el: HTMLDivElement | null) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      ref={rowRef}
      className="overflow-hidden rounded-xl border border-app-border bg-app-surface"
    >
      <div className="flex items-stretch">
        <button
          type="button"
          aria-label={`Reorder day ${dayNumber}`}
          onPointerDown={(event) => {
            event.preventDefault();
            onDragStart();
          }}
          className="grid w-10 shrink-0 touch-none place-items-center text-app-text-muted hover:bg-app-muted/50 hover:text-app-text"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1 px-1 py-2.5">
          <div className="text-sm font-semibold text-app-text">
            Day {dayNumber}: {day.name}
          </div>
          <div className="text-xs text-app-text-muted">
            {day.exerciseCount} {day.exerciseCount === 1 ? 'exercise' : 'exercises'}
          </div>
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-label={open ? `Hide exercises in day ${dayNumber}` : `Show exercises in day ${dayNumber}`}
          onClick={() => setOpen((current) => !current)}
          className="shrink-0 px-2.5 text-app-text-muted transition hover:bg-app-muted/50 hover:text-app-text"
        >
          <ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} />
        </button>
        <button
          type="button"
          title="Edit exercises"
          className="grid w-10 shrink-0 place-items-center text-app-text-muted hover:bg-app-muted/50 hover:text-app-text"
          onClick={onEditExercises}
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          title="Remove day"
          className="grid w-10 shrink-0 place-items-center text-red-500 hover:bg-red-50"
          onClick={onRemove}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <DayExercisePreview templateId={day.id} open={open} />
    </div>
  );
}

export function EditExercisePlanDrawer({
  open,
  planId,
  onClose,
  onSaved,
  onReload
}: {
  open: boolean;
  planId?: string;
  onClose: () => void;
  onSaved?: (plan: ExercisePlanSummary) => void;
  onReload?: () => Promise<void>;
}) {
  const [title, setTitle] = useState('Exercise plan');

  useEffect(() => {
    if (!open) queueMicrotask(() => setTitle('Exercise plan'));
  }, [open]);

  return (
    <Drawer open={open} title={title} panelClassName="max-w-xl" onClose={onClose}>
      {open && planId && (
        <EditExercisePlanDrawerContent
          key={planId}
          planId={planId}
          onClose={onClose}
          onSaved={onSaved}
          onReload={onReload}
          onTitleChange={setTitle}
        />
      )}
    </Drawer>
  );
}

function EditExercisePlanDrawerContent({
  planId,
  onClose,
  onSaved,
  onReload,
  onTitleChange
}: {
  planId: string;
  onClose: () => void;
  onSaved?: (plan: ExercisePlanSummary) => void;
  onReload?: () => Promise<void>;
  onTitleChange: (title: string) => void;
}) {
  const [plan, setPlan] = useState<ExercisePlanSummary | null>(null);
  const [standaloneWorkouts, setStandaloneWorkouts] = useState<ExercisePlanTemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [addingDay, setAddingDay] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [selectedAttachId, setSelectedAttachId] = useState('');
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const orderedIdsRef = useRef<string[]>([]);
  const activeIdRef = useRef<string | null>(null);
  const [draft, setDraft] = useState({
    name: '',
    description: '',
    visibility: 'GLOBAL' as 'GLOBAL' | 'USER'
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api<ExercisePlanSummary>(`/api/admin/exercise-plans/${planId}`);
      setPlan(data);
      const ids = [...data.days]
        .sort((a, b) => (a.dayIndex ?? 0) - (b.dayIndex ?? 0))
        .map((day) => day.id);
      setOrderedIds(ids);
      orderedIdsRef.current = ids;
      setDraft({
        name: data.name,
        description: data.description ?? '',
        visibility: data.visibility
      });
      onTitleChange(data.name);
      return data;
    } catch (err) {
      setPlan(null);
      setError(err instanceof Error ? err.message : 'Unable to load exercise plan');
      return null;
    } finally {
      setLoading(false);
    }
  }, [onTitleChange, planId]);

  const loadStandaloneWorkouts = useCallback(async () => {
    try {
      const templates = await api<ExercisePlanTemplateSummary[]>('/api/admin/exercise-templates');
      setStandaloneWorkouts(templates.filter((template) => !template.planId));
    } catch {
      setStandaloneWorkouts([]);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void load());
    queueMicrotask(() => void loadStandaloneWorkouts());
  }, [load, loadStandaloneWorkouts]);

  useEffect(() => {
    orderedIdsRef.current = orderedIds;
  }, [orderedIds]);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    if (!activeId) return;

    function handlePointerMove(event: PointerEvent) {
      const draggingId = activeIdRef.current;
      if (!draggingId) return;
      const targetId = rowTargetId(event.clientY, orderedIdsRef.current, rowRefs.current);
      if (!targetId || targetId === draggingId) return;
      setOrderedIds((current) => {
        const next = reorderIds(current, draggingId, targetId);
        orderedIdsRef.current = next;
        return next;
      });
    }

    async function finishDrag() {
      const nextIds = orderedIdsRef.current;
      setActiveId(null);
      activeIdRef.current = null;
      try {
        const updated = await api<ExercisePlanSummary>(`/api/admin/exercise-plans/${planId}/days/reorder`, {
          method: 'PATCH',
          body: JSON.stringify({ orderedTemplateIds: nextIds })
        });
        setPlan(updated);
        onSaved?.(updated);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to reorder days');
        await load();
      }
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', finishDrag);
    window.addEventListener('pointercancel', finishDrag);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', finishDrag);
      window.removeEventListener('pointercancel', finishDrag);
    };
  }, [activeId, load, onSaved, planId]);

  async function saveMetadata() {
    setSaving(true);
    setError('');
    try {
      const updated = await api<ExercisePlanSummary>(`/api/admin/exercise-plans/${planId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: draft.name.trim(),
          description: draft.description.trim() || null,
          visibility: draft.visibility
        })
      });
      setPlan(updated);
      onTitleChange(updated.name);
      onSaved?.(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save exercise plan');
    } finally {
      setSaving(false);
    }
  }

  async function addDay(name: string) {
    setAddingDay(true);
    setError('');
    try {
      const updated = await api<ExercisePlanSummary>(`/api/admin/exercise-plans/${planId}/days`, {
        method: 'POST',
        body: JSON.stringify({ name: name.trim() })
      });
      setPlan(updated);
      const ids = [...updated.days]
        .sort((a, b) => (a.dayIndex ?? 0) - (b.dayIndex ?? 0))
        .map((day) => day.id);
      setOrderedIds(ids);
      orderedIdsRef.current = ids;
      onSaved?.(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add day');
    } finally {
      setAddingDay(false);
    }
  }

  async function attachWorkout(templateId: string) {
    if (!templateId) return;
    setAddingDay(true);
    setError('');
    try {
      const updated = await api<ExercisePlanSummary>(`/api/admin/exercise-plans/${planId}/days`, {
        method: 'POST',
        body: JSON.stringify({ templateId })
      });
      setPlan(updated);
      const ids = [...updated.days]
        .sort((a, b) => (a.dayIndex ?? 0) - (b.dayIndex ?? 0))
        .map((day) => day.id);
      setOrderedIds(ids);
      orderedIdsRef.current = ids;
      setAttachOpen(false);
      setSelectedAttachId('');
      await loadStandaloneWorkouts();
      onSaved?.(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to attach workout');
    } finally {
      setAddingDay(false);
    }
  }

  async function removeDay(templateId: string, dayName: string) {
    if (!window.confirm(`Remove "${dayName}" from this plan?`)) return;
    setError('');
    try {
      const updated = await api<ExercisePlanSummary>(`/api/admin/exercise-plans/${planId}/days/${templateId}`, {
        method: 'DELETE'
      });
      setPlan(updated);
      const ids = [...updated.days]
        .sort((a, b) => (a.dayIndex ?? 0) - (b.dayIndex ?? 0))
        .map((day) => day.id);
      setOrderedIds(ids);
      orderedIdsRef.current = ids;
      await loadStandaloneWorkouts();
      await onReload?.();
      onSaved?.(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to remove day');
    }
  }

  async function handleTemplateSaved() {
    const data = await load();
    if (data) onSaved?.(data);
  }

  const orderedDays = orderedIds
    .map((id) => plan?.days.find((day) => day.id === id))
    .filter((day): day is ExercisePlanTemplateSummary => Boolean(day));

  if (loading) {
    return <p className="text-sm text-app-text-muted">Loading exercise plan…</p>;
  }

  if (!plan) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p>{error || 'Unable to load exercise plan'}</p>
        </div>
        <Button type="button" variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-2">
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p>{error}</p>
        </div>
      )}

      <section className="space-y-3">
        <div>
          <label className={labelClassName()} htmlFor="plan-name">
            Name
          </label>
          <input
            id="plan-name"
            value={draft.name}
            onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
            className={inputClassName()}
          />
        </div>
        <div>
          <label className={labelClassName()} htmlFor="plan-description">
            Description
          </label>
          <textarea
            id="plan-description"
            value={draft.description}
            onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
            rows={2}
            className={inputClassName()}
          />
        </div>
        <div>
          <label className={labelClassName()} htmlFor="plan-visibility">
            Visibility
          </label>
          <select
            id="plan-visibility"
            value={draft.visibility}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                visibility: event.target.value as 'GLOBAL' | 'USER'
              }))
            }
            className={inputClassName()}
          >
            <option value="GLOBAL">GLOBAL</option>
            <option value="USER">USER</option>
          </select>
        </div>
        <Button type="button" disabled={saving || !draft.name.trim()} onClick={() => void saveMetadata()}>
          {saving ? 'Saving…' : 'Save plan details'}
        </Button>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-app-text">Days</h3>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={addingDay}
              onClick={() => {
                const name = window.prompt('Day name', `Day ${orderedDays.length + 1}`);
                if (name?.trim()) void addDay(name);
              }}
            >
              <Plus className="mr-1 inline h-4 w-4" />
              Add day
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={addingDay}
              onClick={() => setAttachOpen((current) => !current)}
            >
              Attach workout
            </Button>
          </div>
        </div>

        {attachOpen && (
          <div className="flex flex-wrap items-end gap-2 rounded-xl border border-app-border bg-app-muted/30 p-3">
            <div className="min-w-[12rem] flex-1">
              <label className={labelClassName()} htmlFor="attach-workout">
                Standalone workout
              </label>
              <select
                id="attach-workout"
                value={selectedAttachId}
                onChange={(event) => setSelectedAttachId(event.target.value)}
                className={inputClassName()}
              >
                <option value="">Select a workout…</option>
                {standaloneWorkouts.map((workout) => (
                  <option key={workout.id} value={workout.id}>
                    {workout.name} ({workout.exerciseCount} exercises)
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="button"
              disabled={addingDay || !selectedAttachId}
              onClick={() => void attachWorkout(selectedAttachId)}
            >
              Attach
            </Button>
          </div>
        )}

        {orderedDays.length === 0 ? (
          <p className="text-sm text-app-text-muted">No days yet. Add a day or attach an existing workout.</p>
        ) : (
          <div className="space-y-2">
            {orderedDays.map((day, index) => (
              <PlanDayRow
                key={day.id}
                day={day}
                dayNumber={index + 1}
                onEditExercises={() => setEditingTemplateId(day.id)}
                onRemove={() => void removeDay(day.id, day.name)}
                onDragStart={() => setActiveId(day.id)}
                rowRef={(el) => {
                  if (el) rowRefs.current.set(day.id, el);
                  else rowRefs.current.delete(day.id);
                }}
              />
            ))}
          </div>
        )}
      </section>

      <EditExerciseTemplateDrawer
        open={Boolean(editingTemplateId)}
        templateId={editingTemplateId ?? undefined}
        zIndexClass="z-[60]"
        onClose={() => setEditingTemplateId(null)}
        onSaved={() => void handleTemplateSaved()}
      />
    </div>
  );
}
