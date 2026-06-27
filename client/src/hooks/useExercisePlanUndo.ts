import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import type { ExercisePlanUndoSnapshot } from '../types/exercisePlanUndo';

const UNDO_TIMEOUT_MS = 30_000;

type UndoState = {
  message: string;
  snapshot: ExercisePlanUndoSnapshot;
};

export function useExercisePlanUndo({
  restoreUrl,
  onRestored
}: {
  restoreUrl: string;
  onRestored: () => void | Promise<void>;
}) {
  const [undo, setUndo] = useState<UndoState | null>(null);
  const [restoring, setRestoring] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearUndo = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setUndo(null);
  }, []);

  const registerUndo = useCallback((message: string, snapshot: ExercisePlanUndoSnapshot | undefined) => {
    if (!snapshot?.days.length) return;
    setUndo({ message, snapshot });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setUndo(null), UNDO_TIMEOUT_MS);
  }, []);

  const performUndo = useCallback(async () => {
    if (!undo || restoring) return;
    setRestoring(true);
    try {
      await api(restoreUrl, {
        method: 'POST',
        body: JSON.stringify({ days: undo.snapshot.days })
      });
      clearUndo();
      await onRestored();
    } finally {
      setRestoring(false);
    }
  }, [clearUndo, onRestored, restoreUrl, restoring, undo]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { undo, registerUndo, performUndo, restoring, clearUndo };
}

export function exercisePlanUndoMessage(dayCount: number, action: string) {
  const days = `${dayCount} day${dayCount === 1 ? '' : 's'}`;
  return `${action} on ${days}. Undo?`;
}
