import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import { fetchExercisesForDates } from '../utils/planExportData';
import {
  actualsForExercise,
  loadSession,
  remainingMs,
  saveSession,
  sessionReducer,
  startSession,
  type WorkoutSessionState
} from '../utils/workoutSession';
import { restEndCue } from '../utils/sessionCues';
import { useNow } from './useNow';

export type SessionEvent =
  | { type: 'session_started'; date: string }
  | { type: 'set_completed' }
  | { type: 'exercise_skipped' }
  | { type: 'session_finished' };

async function postWithRetry(url: string, body?: unknown): Promise<boolean> {
  const opts = { method: 'POST', ...(body ? { body: JSON.stringify(body) } : {}) };
  try {
    await api(url, opts);
    return true;
  } catch {
    // one soft retry — the session must not stall on a flaky connection.
    try {
      await api(url, opts);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Drives a guided workout: fetches the day, resumes or starts a session,
 * persists every change to localStorage, and mirrors completions/skips to the
 * server (with actuals). `onEvent` is a no-op seam for a future coach buddy.
 */
export function useWorkoutSession(date: string, onEvent?: (event: SessionEvent) => void) {
  const [state, setState] = useState<WorkoutSessionState | null>(() => {
    const stored = loadSession(date);
    return stored && stored.phase !== 'summary' ? stored : null;
  });
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const now = useNow(500, Boolean(state) && state?.phase !== 'summary');
  const syncedRef = useRef<Record<string, 'done' | 'skipped'>>({});
  const cueFiredRef = useRef<number | null>(null);
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  // Fetch the day's exercises, then resume (RECONCILE) or start.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [day] = await fetchExercisesForDates([date]);
        if (cancelled) return;
        const exercises = day?.exercises ?? [];
        setState((prev) => {
          if (prev && prev.date === date && prev.phase !== 'summary') {
            return sessionReducer(prev, { type: 'RECONCILE', exercises, nowMs: Date.now() });
          }
          onEventRef.current?.({ type: 'session_started', date });
          return startSession(date, exercises, Date.now());
        });
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Could not load workout.');
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [date]);

  // Persist on every change.
  useEffect(() => {
    if (state) saveSession(state);
  }, [state]);

  // Mirror completions/skips to the server exactly once each. Only mark synced after the API
  // succeeds so a failed call retries on the next render/focus instead of leaving the server stale.
  useEffect(() => {
    if (!state) return;
    for (const id of state.order) {
      const outcome = state.perExercise[id]?.outcome;
      if (!outcome || syncedRef.current[id] === outcome) continue;
      if (outcome === 'done') {
        const actuals = actualsForExercise(state, id);
        const body = Object.fromEntries(Object.entries(actuals).filter(([, v]) => v !== undefined));
        void postWithRetry(`/api/scheduled-exercises/${id}/mark-done`, body).then((ok) => {
          if (ok) {
            syncedRef.current[id] = outcome;
          } else {
            setSyncError('Some changes may not have saved. They will retry when you reconnect.');
          }
        });
      } else {
        void postWithRetry(`/api/scheduled-exercises/${id}/skip`).then((ok) => {
          if (ok) {
            syncedRef.current[id] = outcome;
          } else {
            setSyncError('Some changes may not have saved.');
          }
        });
      }
    }
  }, [state]);

  // Fire the rest-over cue once per rest period.
  useEffect(() => {
    if (!state || state.phase !== 'rest') return;
    if (remainingMs(state, now) === 0 && cueFiredRef.current !== state.phaseStartedAtMs) {
      cueFiredRef.current = state.phaseStartedAtMs;
      restEndCue(state.settings.sound);
    }
  }, [state, now]);

  const dispatch = useCallback((action: Parameters<typeof sessionReducer>[1]) => {
    setState((prev) => (prev ? sessionReducer(prev, action) : prev));
  }, []);

  const completeSet = useCallback(() => {
    onEventRef.current?.({ type: 'set_completed' });
    dispatch({ type: 'COMPLETE_SET', nowMs: Date.now() });
  }, [dispatch]);

  const adjustActuals = useCallback(
    (patch: { reps?: number | null; weight?: number | null; durationMinutes?: number | null }) =>
      dispatch({ type: 'ADJUST_ACTUALS', patch, nowMs: Date.now() }),
    [dispatch]
  );

  const skipExercise = useCallback(() => {
    onEventRef.current?.({ type: 'exercise_skipped' });
    dispatch({ type: 'SKIP_EXERCISE', nowMs: Date.now() });
  }, [dispatch]);

  const skipRest = useCallback(() => dispatch({ type: 'SKIP_REST', nowMs: Date.now() }), [dispatch]);
  const extendRest = useCallback(() => dispatch({ type: 'EXTEND_REST_15', nowMs: Date.now() }), [dispatch]);
  const pause = useCallback(() => dispatch({ type: 'PAUSE', nowMs: Date.now() }), [dispatch]);
  const resume = useCallback(() => dispatch({ type: 'RESUME', nowMs: Date.now() }), [dispatch]);
  const finish = useCallback(() => {
    onEventRef.current?.({ type: 'session_finished' });
    dispatch({ type: 'FINISH', nowMs: Date.now() });
  }, [dispatch]);

  const remaining = state ? remainingMs(state, now) : null;

  return {
    state,
    ready,
    loadError,
    syncError,
    now,
    remaining,
    completeSet,
    adjustActuals,
    skipExercise,
    skipRest,
    extendRest,
    pause,
    resume,
    finish
  };
}
