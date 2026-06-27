import { useEffect, useRef, useState } from 'react';
import { GripVertical } from 'lucide-react';
import type { ScheduledExercise } from '../../types';
import { api } from '../../services/api';
import { coachDailyExercisesApi } from '../../utils/coachExerciseApi';
import { ExerciseCard } from './ExerciseCard';
import { ExerciseQuickRemoveButton } from './ExerciseQuickRemoveButton';
import { PlannedRestDayCard } from './PlannedRestDayCard';

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
  editDayMode,
  removingId,
  onChange,
  onEdit,
  onRemove,
  setRowRef,
  onHandlePointerDown
}: {
  item: ScheduledExercise;
  selectedDate: string;
  activeId: string | null;
  editDayMode: boolean;
  removingId: string | null;
  onChange: () => void | Promise<void>;
  onEdit: () => void;
  onRemove: (id: string) => void | Promise<void>;
  setRowRef: (id: string, node: HTMLDivElement | null) => void;
  onHandlePointerDown: (id: string, event: React.PointerEvent<HTMLDivElement>) => void;
}) {
  const isDragging = activeId === item.id;
  const removing = removingId === item.id;

  return (
    <div
      ref={(node) => setRowRef(item.id, node)}
      className={`flex items-stretch gap-1 rounded-2xl border bg-white py-3 pl-1 pr-4 shadow-sm transition-shadow ${
        isDragging ? 'z-10 border-blue-400 shadow-md ring-2 ring-blue-100' : 'border-slate-200'
      }`}
    >
      {editDayMode ? (
        <ExerciseQuickRemoveButton
          name={item.exercise.name}
          disabled={removing}
          onClick={() => void onRemove(item.id)}
        />
      ) : (
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
      )}
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

function ExerciseRow({
  item,
  selectedDate,
  editDayMode,
  removingId,
  onChange,
  onEdit,
  onRemove
}: {
  item: ScheduledExercise;
  selectedDate: string;
  editDayMode: boolean;
  removingId: string | null;
  onChange: () => void | Promise<void>;
  onEdit: () => void;
  onRemove: (id: string) => void | Promise<void>;
}) {
  if (!editDayMode) {
    return (
      <ExerciseCard
        item={item}
        selectedDate={selectedDate}
        onChange={onChange}
        onEdit={onEdit}
      />
    );
  }

  return (
    <div className="flex items-start gap-1 rounded-2xl border border-slate-200 bg-white py-3 pl-1 pr-4 shadow-sm">
      <ExerciseQuickRemoveButton
        name={item.exercise.name}
        disabled={removingId === item.id}
        onClick={() => void onRemove(item.id)}
      />
      <div className="min-w-0 flex-1">
        <ExerciseCard embedded item={item} selectedDate={selectedDate} onChange={onChange} onEdit={onEdit} />
      </div>
    </div>
  );
}

export function ExerciseChecklist({
  exercises,
  selectedDate,
  coachClientId,
  editDayMode = false,
  onChange,
  onEdit,
  onRemove
}: {
  exercises: ScheduledExercise[];
  selectedDate: string;
  coachClientId?: string;
  editDayMode?: boolean;
  onChange: () => void | Promise<void>;
  onEdit: (item: ScheduledExercise) => void;
  onRemove: (id: string) => void | Promise<void>;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
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
      const reorderUrl = coachClientId
        ? coachDailyExercisesApi(coachClientId, selectedDate, '/reorder')
        : `/api/daily-logs/${selectedDate}/exercises/reorder`;
      await api(reorderUrl, {
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
    if (editDayMode) return;
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setActiveId(id);
    activeIdRef.current = id;
    setReorderError(null);
  }

  async function handleRemove(id: string) {
    setRemovingId(id);
    try {
      await onRemove(id);
    } finally {
      setRemovingId(null);
    }
  }

  if (!exercises.length) {
    return <PlannedRestDayCard />;
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
                editDayMode={editDayMode}
                removingId={removingId}
                onChange={onChange}
                onEdit={() => onEdit(item)}
                onRemove={handleRemove}
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
              <ExerciseRow
                key={item.id}
                item={item}
                selectedDate={selectedDate}
                editDayMode={editDayMode}
                removingId={removingId}
                onChange={onChange}
                onEdit={() => onEdit(item)}
                onRemove={handleRemove}
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
              <ExerciseRow
                key={item.id}
                item={item}
                selectedDate={selectedDate}
                editDayMode={editDayMode}
                removingId={removingId}
                onChange={onChange}
                onEdit={() => onEdit(item)}
                onRemove={handleRemove}
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
              <ExerciseRow
                key={item.id}
                item={item}
                selectedDate={selectedDate}
                editDayMode={editDayMode}
                removingId={removingId}
                onChange={onChange}
                onEdit={() => onEdit(item)}
                onRemove={handleRemove}
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
