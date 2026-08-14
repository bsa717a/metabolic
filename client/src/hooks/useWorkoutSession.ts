import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import { fetchExercisesForDates } from '../utils/planExportData';
import {
  actualsForExercise,
  loadSession,
  loadSessionPrefs,
  remainingMs,
  saveSession,
  saveSessionPrefs,
  sessionReducer,
  startSession,
  type WorkoutSessionState
} from '../utils/workoutSession';
import { countdownTick, restEndCue } from '../utils/sessionCues';
import { useNow } from './useNow';

const COUNTDOWN_MARKS_MS = [3000, 2000, 1000] as const;
const AUTO_START_AFTER_GO_MS = 800;

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

function seedSyncedFromServer(
  exercises: Array<{ id: string; status: string }>,
  into: Record<string, 'done' | 'skipped'>
) {
  for (const item of exercises) {
    if (item.status === 'SKIPPED') into[item.id] = 'skipped';
    if (item.status === 'DONE') into[item.id] = 'done';
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
  const pendingSyncRef = useRef<Set<string>>(new Set());
  const cueFiredRef = useRef<Set<string>>(new Set());
  const autoStartTimeoutRef = useRef<number | null>(null);
  const onEventRef = useRef(onEvent);
  const [syncTick, setSyncTick] = useState(0);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  // Retry failed mark-done/skip when the tab regains focus or the network returns.
  useEffect(() => {
    const bump = () => setSyncTick((n) => n + 1);
    const onVis = () => {
      if (document.visibilityState === 'visible') bump();
    };
    window.addEventListener('online', bump);
    window.addEventListener('focus', bump);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('online', bump);
      window.removeEventListener('focus', bump);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  // Fetch the day's exercises, then resume (RECONCILE) or start.
  useEffect(() => {
    let cancelled = false;
    pendingSyncRef.current.clear();
    setSyncError(null);
    setLoadError(null);
    setReady(false);
    const stored = loadSession(date);
    syncedRef.current = { ...(stored?.syncedOutcomes ?? {}) };
    setState(stored && stored.phase !== 'summary' ? stored : null);
    (async () => {
      try {
        const [day] = await fetchExercisesForDates([date]);
        if (cancelled) return;
        const exercises = day?.exercises ?? [];
        seedSyncedFromServer(exercises, syncedRef.current);
        setState((prev) => {
          if (prev && prev.date === date && prev.phase !== 'summary') {
            return sessionReducer(prev, { type: 'RECONCILE', exercises, nowMs: Date.now() });
          }
          onEventRef.current?.({ type: 'session_started', date });
          return startSession(date, exercises, Date.now(), loadSessionPrefs());
        });
      } catch (error) {
        if (!cancelled) {
          // Keep a resumable local session usable offline; only surface a hard error when empty.
          setLoadError(error instanceof Error ? error.message : 'Could not load workout.');
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [date]);

  // Persist on every change (date-scoped key — safe across `?date=` switches).
  useEffect(() => {
    if (state) saveSession(state);
  }, [state]);

  useEffect(() => {
    if (state) saveSessionPrefs(state.settings);
  }, [state]);

  // Mirror completions/skips to the server exactly once each. Only mark synced after the API
  // succeeds; failed calls retry on the next state change, online, or focus.
  // Skip is a toggle on the server — never re-post after a successful sync (persisted in state).
  useEffect(() => {
    if (!state) return;
    // Keep the in-memory map aligned with persisted sync markers.
    for (const [id, outcome] of Object.entries(state.syncedOutcomes ?? {})) {
      syncedRef.current[id] = outcome;
    }
    let anyPending = false;
    for (const id of state.order) {
      const outcome = state.perExercise[id]?.outcome;
      if (!outcome || syncedRef.current[id] === outcome) continue;
      if (pendingSyncRef.current.has(id)) {
        anyPending = true;
        continue;
      }
      pendingSyncRef.current.add(id);
      anyPending = true;
      if (outcome === 'done') {
        const actuals = actualsForExercise(state, id);
        const body = Object.fromEntries(Object.entries(actuals).filter(([, v]) => v !== undefined));
        void postWithRetry(`/api/scheduled-exercises/${id}/mark-done`, body).then((ok) => {
          pendingSyncRef.current.delete(id);
          if (ok) {
            syncedRef.current[id] = outcome;
            setState((prev) =>
              prev ? sessionReducer(prev, { type: 'MARK_SYNCED', id, outcome }) : prev
            );
            setSyncError(null);
          } else {
            setSyncError('Some changes may not have saved. They will retry when you reconnect.');
          }
        });
      } else {
        void postWithRetry(`/api/scheduled-exercises/${id}/skip`).then((ok) => {
          pendingSyncRef.current.delete(id);
          if (ok) {
            syncedRef.current[id] = outcome;
            setState((prev) =>
              prev ? sessionReducer(prev, { type: 'MARK_SYNCED', id, outcome }) : prev
            );
            setSyncError(null);
          } else {
            setSyncError('Some changes may not have saved. They will retry when you reconnect.');
          }
        });
      }
    }
    if (!anyPending) setSyncError(null);
  }, [state, syncTick]);

  // Drop a pending between-set auto-start if this rest phase ends another way.
  useEffect(() => {
    return () => {
      if (autoStartTimeoutRef.current != null) {
        window.clearTimeout(autoStartTimeoutRef.current);
        autoStartTimeoutRef.current = null;
      }
    };
  }, [state?.phaseStartedAtMs]);

  // 3-2-1 ticks + GO cue. Prefer precise setTimeouts; also re-check from
  // absolute remaining via `now` so a backgrounded tab still fires GO.
  // Missed ticks are skipped (no catch-up beeps). Between-set auto-start
  // waits a short GO beat so the flash is visible.
  useEffect(() => {
    if (!state || state.phase === 'summary') return;
    if (state.pausedRemainingMs != null) return;

    const endsAtMs = state.phase === 'rest' ? state.restEndsAtMs : state.durationEndsAtMs;
    if (endsAtMs == null) return;

    const phaseKey = state.phaseStartedAtMs;
    const sound = state.settings.sound;
    const autoStartNextSet = state.phase === 'rest' && state.currentSet > 1;
    const timeouts: number[] = [];

    const fireTick = (sec: 1 | 2 | 3) => {
      const key = `${phaseKey}:t${sec}`;
      if (cueFiredRef.current.has(key)) return;
      cueFiredRef.current.add(key);
      countdownTick(sound);
    };

    const scheduleAutoStart = (delayMs: number) => {
      if (!autoStartNextSet || autoStartTimeoutRef.current != null) return;
      autoStartTimeoutRef.current = window.setTimeout(() => {
        autoStartTimeoutRef.current = null;
        setState((prev) => {
          if (!prev || prev.phase !== 'rest') return prev;
          if (prev.phaseStartedAtMs !== phaseKey) return prev;
          if (prev.currentSet <= 1) return prev;
          return sessionReducer(prev, { type: 'SKIP_REST', nowMs: Date.now() });
        });
      }, delayMs);
    };

    const fireGo = () => {
      const key = `${phaseKey}:go`;
      const already = cueFiredRef.current.has(key);
      if (!already) {
        cueFiredRef.current.add(key);
        restEndCue(sound);
      }
      // Reschedule if the GO beat timeout was cleared (date switch / remount)
      // while this rest is still showing "Starting next set…".
      scheduleAutoStart(already ? 0 : AUTO_START_AFTER_GO_MS);
    };

    const remaining = remainingMs(state, now);
    if (remaining === 0) {
      fireGo();
      return;
    }

    const scheduledAt = Date.now();
    for (const markMs of COUNTDOWN_MARKS_MS) {
      const delay = endsAtMs - markMs - scheduledAt;
      if (delay > 0) {
        const sec = (markMs / 1000) as 1 | 2 | 3;
        timeouts.push(window.setTimeout(() => fireTick(sec), delay));
      }
    }
    timeouts.push(window.setTimeout(fireGo, Math.max(0, endsAtMs - scheduledAt)));

    return () => {
      for (const id of timeouts) window.clearTimeout(id);
    };
  }, [state, now]);

  const dispatch = useCallback((action: Parameters<typeof sessionReducer>[1]) => {
    setState((prev) => (prev ? sessionReducer(prev, action) : prev));
  }, []);

  const completeSet = useCallback(() => {
    onEventRef.current?.({ type: 'set_completed' });
    dispatch({ type: 'COMPLETE_SET', nowMs: Date.now() });
  }, [dispatch]);

  const adjustActuals = useCallback(
    (patch: {
      reps?: number | null;
      weight?: number | null;
      durationMinutes?: number | null;
      distance?: number | null;
    }) => dispatch({ type: 'ADJUST_ACTUALS', patch, nowMs: Date.now() }),
    [dispatch]
  );

  const skipExercise = useCallback(() => {
    onEventRef.current?.({ type: 'exercise_skipped' });
    dispatch({ type: 'SKIP_EXERCISE', nowMs: Date.now() });
  }, [dispatch]);

  const skipRest = useCallback(() => dispatch({ type: 'SKIP_REST', nowMs: Date.now() }), [dispatch]);
  const adjustRest = useCallback(
    (delta: 1 | -1) => dispatch({ type: 'ADJUST_REST_15', delta, nowMs: Date.now() }),
    [dispatch]
  );
  const pause = useCallback(() => dispatch({ type: 'PAUSE', nowMs: Date.now() }), [dispatch]);
  const resume = useCallback(() => dispatch({ type: 'RESUME', nowMs: Date.now() }), [dispatch]);
  const setSound = useCallback(
    (sound: boolean) => dispatch({ type: 'SET_SOUND', sound }),
    [dispatch]
  );
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
    adjustRest,
    pause,
    resume,
    setSound,
    finish
  };
}
