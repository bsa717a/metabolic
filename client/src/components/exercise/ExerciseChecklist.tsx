import { useEffect, useRef, useState } from 'react';
import { GripVertical } from 'lucide-react';
import type { ScheduledExercise } from '../../types';
import { api } from '../../services/api';
import { ExerciseCard } from './ExerciseCard';

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

function ReorderableExerciseCard({
  item,
  selectedDate,
  activeId,
  onChange,
  onEdit,
  setRowRef,
  onHandlePointerDown
}: {
  item: ScheduledExercise;
  selectedDate: string;
  activeId: string | null;
  onChange: () => void | Promise<void>;
  onEdit: () => void;
  setRowRef: (id: string, node: HTMLDivElement | null) => void;
  onHandlePointerDown: (id: string, event: React.PointerEvent<HTMLDivElement>) => void;
}) {
  const isDragging = activeId === item.id;

  return (
    <div
      ref={(node) => setRowRef(item.id, node)}
      className={`flex items-stretch gap-1 rounded-2xl border bg-white py-3 pl-1 pr-4 shadow-sm transition-shadow ${
        isDragging ? 'z-10 border-blue-400 shadow-md ring-2 ring-blue-100' : 'border-slate-200'
      }`}
    >
      <div
        role="button"
        tabIndex={0}
        aria-label={`Reorder ${item.exercise.name}`}
        title="Drag to reorder"
        className="flex shrink-0 touch-none cursor-grab items-center self-stretch rounded-lg px-1 text-slate-400 hover:bg-slate-50 hover:text-slate-600 active:cursor-grabbing"
        onPointerDown={(event) => onHandlePointerDown(item.id, event)}
      >
        <GripVertical size={18} />
      </div>
      <div className={`min-w-0 flex-1 ${activeId ? 'pointer-events-none select-none' : ''}`}>
        <ExerciseCard
          embedded
          item={item}
          selectedDate={selectedDate}
          onChange={onChange}
          onEdit={onEdit}
        />
      </div>
    </div>
  );
}

export function ExerciseChecklist({
  exercises,
  selectedDate,
  onChange,
  onEdit
}: {
  exercises: ScheduledExercise[];
  selectedDate: string;
  onChange: () => void | Promise<void>;
  onEdit: (item: ScheduledExercise) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  const [reorderError, setReorderError] = useState<string | null>(null);
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const orderedIdsRef = useRef<string[]>([]);
  const savedOrderRef = useRef<string[]>([]);
  const activeIdRef = useRef<string | null>(null);

  const todo = exercises.filter((item) => item.status === 'PLANNED');
  const completed = exercises.filter((item) => item.status !== 'PLANNED');
  const done = completed.filter((item) => item.status === 'DONE');
  const skipped = completed.filter((item) => item.status === 'SKIPPED');
  const otherCompleted = completed.filter((item) => item.status !== 'DONE' && item.status !== 'SKIPPED');
  const todoKey = todo.map((item) => item.id).join(',');

  useEffect(() => {
    const ids = todo.map((item) => item.id);
    setOrderedIds(ids);
    orderedIdsRef.current = ids;
    savedOrderRef.current = ids;
  }, [todoKey]);

  useEffect(() => {
    orderedIdsRef.current = orderedIds;
  }, [orderedIds]);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  const orderedTodo = orderedIds
    .map((id) => todo.find((item) => item.id === id))
    .filter((item): item is ScheduledExercise => Boolean(item));

  function setRowRef(id: string, node: HTMLDivElement | null) {
    if (node) rowRefs.current.set(id, node);
    else rowRefs.current.delete(id);
  }

  async function persistOrder(nextIds: string[]) {
    if (nextIds.join(',') === savedOrderRef.current.join(',')) return;

    setReordering(true);
    setReorderError(null);
    try {
      await api(`/api/daily-logs/${selectedDate}/exercises/reorder`, {
        method: 'POST',
        body: JSON.stringify({ orderedIds: nextIds })
      });
      savedOrderRef.current = nextIds;
      await onChange();
    } catch (error) {
      setOrderedIds(savedOrderRef.current);
      orderedIdsRef.current = savedOrderRef.current;
      setReorderError(error instanceof Error ? error.message : 'Could not save exercise order');
    } finally {
      setReordering(false);
    }
  }

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

    function finishDrag() {
      const nextIds = orderedIdsRef.current;
      setActiveId(null);
      activeIdRef.current = null;
      void persistOrder(nextIds);
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', finishDrag);
    window.addEventListener('pointercancel', finishDrag);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', finishDrag);
      window.removeEventListener('pointercancel', finishDrag);
    };
  }, [activeId, selectedDate]);

  function handleHandlePointerDown(id: string, event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setActiveId(id);
    activeIdRef.current = id;
    setReorderError(null);
  }

  if (!exercises.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        No exercises planned for this day. Add one or copy from another day.
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${reordering ? 'opacity-70' : ''}`}>
      {reorderError && (
        <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{reorderError}</div>
      )}

      {orderedTodo.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">To do</h2>
          <div className="space-y-2">
            {orderedTodo.map((item) => (
              <ReorderableExerciseCard
                key={item.id}
                item={item}
                selectedDate={selectedDate}
                activeId={activeId}
                onChange={onChange}
                onEdit={() => onEdit(item)}
                setRowRef={setRowRef}
                onHandlePointerDown={handleHandlePointerDown}
              />
            ))}
          </div>
        </section>
      )}

      {done.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Completed</h2>
          <div className="space-y-2">
            {done.map((item) => (
              <ExerciseCard
                key={item.id}
                item={item}
                selectedDate={selectedDate}
                onChange={onChange}
                onEdit={() => onEdit(item)}
              />
            ))}
          </div>
        </section>
      )}

      {skipped.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Skipped</h2>
          <div className="space-y-2">
            {skipped.map((item) => (
              <ExerciseCard
                key={item.id}
                item={item}
                selectedDate={selectedDate}
                onChange={onChange}
                onEdit={() => onEdit(item)}
              />
            ))}
          </div>
        </section>
      )}

      {otherCompleted.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Other</h2>
          <div className="space-y-2">
            {otherCompleted.map((item) => (
              <ExerciseCard
                key={item.id}
                item={item}
                selectedDate={selectedDate}
                onChange={onChange}
                onEdit={() => onEdit(item)}
              />
            ))}
          </div>
        </section>
      )}

      {!orderedTodo.length && completed.length > 0 && (
        <p className="text-center text-sm text-emerald-700">All exercises logged for this day.</p>
      )}
    </div>
  );
}
