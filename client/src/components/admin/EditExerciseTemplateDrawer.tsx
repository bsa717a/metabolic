import { useCallback, useEffect, useRef, useState } from 'react';
import { GripVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../../services/api';
import type { ExercisePlanTemplate, ExercisePlanTemplateSummary, ExerciseTemplateItem } from '../../types';
import { formatPlan } from '../../utils/exerciseFormat';
import { EditTemplateExerciseDrawer } from './EditTemplateExerciseDrawer';
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

function toSummary(template: ExercisePlanTemplate): ExercisePlanTemplateSummary {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    visibility: template.visibility,
    exerciseCount: template.items.length,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt
  };
}

function labelClassName() {
  return 'mb-1 block text-sm font-medium text-app-text-muted';
}

function inputClassName() {
  return 'w-full rounded-xl border border-app-border bg-app-surface px-3 py-2 text-sm text-app-text outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200';
}

export function EditExerciseTemplateDrawer({
  open,
  templateId,
  onClose,
  onSaved
}: {
  open: boolean;
  templateId?: string;
  onClose: () => void;
  onSaved?: (template: ExercisePlanTemplateSummary) => void;
}) {
  const [title, setTitle] = useState('Exercise plan');

  useEffect(() => {
    if (!open) queueMicrotask(() => setTitle('Exercise plan'));
  }, [open]);

  return (
    <Drawer
      open={open}
      title={title}
      panelClassName="max-w-xl"
      onClose={onClose}
    >
      {open && templateId && (
        <EditExerciseTemplateDrawerContent
          key={templateId}
          templateId={templateId}
          onClose={onClose}
          onSaved={onSaved}
          onTitleChange={setTitle}
        />
      )}
    </Drawer>
  );
}

function EditExerciseTemplateDrawerContent({
  templateId,
  onClose,
  onSaved,
  onTitleChange
}: {
  templateId: string;
  onClose: () => void;
  onSaved?: (template: ExercisePlanTemplateSummary) => void;
  onTitleChange: (title: string) => void;
}) {
  const [template, setTemplate] = useState<ExercisePlanTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<ExerciseTemplateItem>();
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

  const notifySaved = useCallback(
    (data: ExercisePlanTemplate) => {
      onSaved?.(toSummary(data));
    },
    [onSaved]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api<ExercisePlanTemplate>(`/api/admin/exercise-templates/${templateId}`);
      setTemplate(data);
      setOrderedIds(data.items.map((item) => item.id));
      orderedIdsRef.current = data.items.map((item) => item.id);
      setDraft({
        name: data.name,
        description: data.description ?? '',
        visibility: data.visibility
      });
      onTitleChange(data.name);
      return data;
    } catch (err) {
      setTemplate(null);
      setError(err instanceof Error ? err.message : 'Unable to load plan');
      return null;
    } finally {
      setLoading(false);
    }
  }, [onTitleChange, templateId]);

  const reloadAndNotify = useCallback(async () => {
    const data = await load();
    if (data) notifySaved(data);
  }, [load, notifySaved]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

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
        await api(`/api/admin/exercise-templates/${templateId}/reorder`, {
          method: 'POST',
          body: JSON.stringify({ orderedIds: nextIds })
        });
        await reloadAndNotify();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to reorder exercises');
        await reloadAndNotify();
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
  }, [activeId, reloadAndNotify, templateId]);

  async function saveMetadata() {
    setSaving(true);
    setError('');
    try {
      const updated = await api<ExercisePlanTemplate>(`/api/admin/exercise-templates/${templateId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: draft.name.trim(),
          description: draft.description.trim() || null,
          visibility: draft.visibility
        })
      });
      setTemplate(updated);
      onTitleChange(updated.name);
      notifySaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save plan');
    } finally {
      setSaving(false);
    }
  }

  async function removeItem(itemId: string) {
    if (!window.confirm('Remove this exercise from the plan?')) return;
    try {
      await api(`/api/admin/exercise-template-items/${itemId}`, { method: 'DELETE' });
      await reloadAndNotify();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to remove exercise');
    }
  }

  const orderedItems = orderedIds
    .map((itemId) => template?.items.find((item) => item.id === itemId))
    .filter((item): item is ExerciseTemplateItem => Boolean(item));

  if (loading) {
    return <p className="text-sm text-app-text-muted">Loading plan…</p>;
  }

  if (!template) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p>{error || 'Unable to load plan'}</p>
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

      <section className="space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-wide text-app-text-muted">Plan details</h3>
        <label className="block text-sm">
          <span className={labelClassName()}>Name</span>
          <input
            className={inputClassName()}
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
        </label>
        <label className="block text-sm">
          <span className={labelClassName()}>Description</span>
          <textarea
            className={inputClassName()}
            rows={2}
            value={draft.description}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
          />
        </label>
        <label className="block text-sm">
          <span className={labelClassName()}>Visibility</span>
          <select
            className={inputClassName()}
            value={draft.visibility}
            onChange={(event) => setDraft({ ...draft, visibility: event.target.value as 'GLOBAL' | 'USER' })}
          >
            <option value="GLOBAL">GLOBAL (users can select)</option>
            <option value="USER">USER (hidden from users)</option>
          </select>
        </label>
        <Button type="button" disabled={saving} onClick={() => void saveMetadata()}>
          {saving ? 'Saving…' : 'Save details'}
        </Button>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wide text-app-text-muted">Planned exercises</h3>
            <p className="text-sm text-app-text-muted">{orderedItems.length} exercises</p>
          </div>
          <Button type="button" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1 inline h-4 w-4" />
            Add exercise
          </Button>
        </div>

        {orderedItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-app-border p-6 text-center text-sm text-app-text-muted">
            No exercises yet. Add one to build this plan.
          </div>
        ) : (
          <div className="space-y-2">
            {orderedItems.map((item) => (
              <div
                key={item.id}
                ref={(node) => {
                  if (node) rowRefs.current.set(item.id, node);
                  else rowRefs.current.delete(item.id);
                }}
                className={`flex items-stretch gap-1 rounded-2xl border bg-app-surface py-3 pl-1 pr-3 ${
                  activeId === item.id ? 'border-blue-400 ring-2 ring-blue-100' : 'border-app-border'
                }`}
              >
                <div
                  role="button"
                  tabIndex={0}
                  aria-label={`Reorder ${item.exercise.name}`}
                  title="Drag to reorder"
                  className="flex shrink-0 touch-none cursor-grab items-center self-stretch rounded-lg px-1 text-app-text-muted hover:bg-app-muted hover:text-app-text-muted active:cursor-grabbing"
                  onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    event.preventDefault();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    setActiveId(item.id);
                    activeIdRef.current = item.id;
                  }}
                >
                  <GripVertical size={18} />
                </div>
                <div className={`min-w-0 flex-1 px-1 ${activeId ? 'pointer-events-none select-none' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-app-text">{item.exercise.name}</p>
                      {item.exercise.bodyPart && (
                        <p className="text-xs font-semibold uppercase tracking-wide text-app-text-muted">{item.exercise.bodyPart}</p>
                      )}
                      <p className="mt-1 text-sm text-app-text-muted">{formatPlan(item)}</p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        title="Edit"
                        className="grid h-8 w-8 place-items-center rounded-xl text-blue-600 hover:bg-blue-50"
                        onClick={() => setEditItem(item)}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        title="Remove"
                        className="grid h-8 w-8 place-items-center rounded-xl text-red-500 hover:bg-red-50"
                        onClick={() => void removeItem(item.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <EditTemplateExerciseDrawer
        open={addOpen}
        templateId={templateId}
        onClose={() => setAddOpen(false)}
        onSaved={() => void reloadAndNotify()}
      />

      <EditTemplateExerciseDrawer
        open={Boolean(editItem)}
        templateId={templateId}
        item={editItem}
        onClose={() => setEditItem(undefined)}
        onSaved={() => void reloadAndNotify()}
      />
    </div>
  );
}
