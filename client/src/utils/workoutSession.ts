import type { ScheduledExercise } from '../types';

/**
 * Pure guided-workout session model. All state is serializable and all timers
 * are expressed as absolute timestamps (`*EndsAtMs`) so backgrounding the tab
 * costs nothing — the next render recomputes remaining time from `Date.now()`.
 * Kept free of React/DOM so it can be unit-tested and, later, driven by an agent.
 */

export const SESSION_STORAGE_KEY = 'metabolic.exerciseSession.v1';
export const SESSION_PREFS_KEY = 'metabolic.exerciseSession.prefs.v1';
export const SESSION_VERSION = 2;

export const DEFAULT_SESSION_SETTINGS: WorkoutSessionSettings = {
  restSetSec: 45,
  restExerciseSec: 45,
  sound: true
};

/** Rest timer / default interval adjustments move in this step. */
export const REST_STEP_SEC = 15;
export const MIN_REST_SEC = 15;
export const MAX_REST_SEC = 5 * 60;

function clampRestSec(seconds: number): number {
  const stepped = Math.round(seconds / REST_STEP_SEC) * REST_STEP_SEC;
  return Math.min(MAX_REST_SEC, Math.max(MIN_REST_SEC, stepped));
}

export type SessionPhase = 'exercise' | 'rest' | 'summary';

export type SessionExerciseMeta = {
  id: string;
  name: string;
  bodyPart?: string | null;
  description?: string | null;
  howToVideoUrl?: string | null;
  sets: number | null;
  reps: string | null;
  speed: string | null;
  weight: number | null;
  durationSeconds: number | null;
  distance: number | null;
};

export type PerExerciseState = {
  setsDone: number;
  actualReps?: number | null;
  actualWeight?: number | null;
  actualDurationSeconds?: number | null;
  actualDistance?: number | null;
  outcome?: 'done' | 'skipped';
};

export type WorkoutSessionSettings = {
  restSetSec: number;
  restExerciseSec: number;
  sound: boolean;
};

export type WorkoutSessionState = {
  version: typeof SESSION_VERSION;
  date: string;
  startedAtMs: number;
  finishedAtMs: number | null;
  order: string[];
  plan: Record<string, SessionExerciseMeta>;
  currentIndex: number;
  currentSet: number; // 1-based
  phase: SessionPhase;
  phaseStartedAtMs: number;
  restEndsAtMs: number | null;
  durationEndsAtMs: number | null;
  pausedRemainingMs: number | null;
  perExercise: Record<string, PerExerciseState>;
  /** Outcomes already mirrored to the server — survives remount so skip is not toggled twice. */
  syncedOutcomes: Record<string, 'done' | 'skipped'>;
  settings: WorkoutSessionSettings;
};

export type SessionAction =
  | { type: 'START'; date: string; exercises: ScheduledExercise[]; nowMs: number; settings?: Partial<WorkoutSessionSettings> }
  | { type: 'COMPLETE_SET'; nowMs: number }
  | {
      type: 'ADJUST_ACTUALS';
      patch: {
        reps?: number | null;
        weight?: number | null;
        durationSeconds?: number | null;
        distance?: number | null;
      };
      nowMs: number;
    }
  | { type: 'SKIP_EXERCISE'; nowMs: number }
  | { type: 'SKIP_REST'; nowMs: number }
  | { type: 'ADJUST_REST_15'; delta: 1 | -1; nowMs: number }
  | { type: 'EXTEND_REST_15'; nowMs: number }
  | { type: 'PAUSE'; nowMs: number }
  | { type: 'RESUME'; nowMs: number }
  | { type: 'RECONCILE'; exercises: ScheduledExercise[]; nowMs: number }
  | { type: 'MARK_SYNCED'; id: string; outcome: 'done' | 'skipped' }
  | { type: 'SET_SOUND'; sound: boolean }
  | { type: 'FINISH'; nowMs: number };

// ---------------------------------------------------------------------------
// Metadata helpers
// ---------------------------------------------------------------------------

export function toMeta(exercise: ScheduledExercise): SessionExerciseMeta {
  return {
    id: exercise.id,
    name: exercise.exercise.name,
    bodyPart: exercise.exercise.bodyPart ?? null,
    description: exercise.exercise.description ?? null,
    howToVideoUrl: exercise.exercise.howToVideoUrl ?? null,
    sets: exercise.sets ?? null,
    reps: exercise.reps ?? null,
    speed: exercise.speed ?? null,
    weight: exercise.weight ?? null,
    durationSeconds: exercise.durationSeconds ?? null,
    distance: exercise.distance ?? null
  };
}

export function hasSets(meta: SessionExerciseMeta): boolean {
  return meta.sets != null && meta.sets > 0;
}

export function totalSets(meta: SessionExerciseMeta): number {
  return hasSets(meta) ? (meta.sets as number) : 1;
}

export function isDurationBased(meta: SessionExerciseMeta): boolean {
  return !hasSets(meta) && meta.durationSeconds != null && meta.durationSeconds > 0;
}

export function isDistanceBased(meta: SessionExerciseMeta): boolean {
  return (
    !hasSets(meta) &&
    !isDurationBased(meta) &&
    meta.distance != null &&
    meta.distance > 0
  );
}

// ---------------------------------------------------------------------------
// Transition helpers
// ---------------------------------------------------------------------------

function enterExercise(state: WorkoutSessionState, index: number, currentSet: number, nowMs: number): WorkoutSessionState {
  const meta = state.plan[state.order[index]];
  const durationEndsAtMs =
    meta && isDurationBased(meta) ? nowMs + (meta.durationSeconds as number) * 1000 : null;
  return {
    ...state,
    currentIndex: index,
    currentSet,
    phase: 'exercise',
    phaseStartedAtMs: nowMs,
    restEndsAtMs: null,
    durationEndsAtMs,
    pausedRemainingMs: null
  };
}

function enterRest(state: WorkoutSessionState, restSec: number, nowMs: number): WorkoutSessionState {
  return {
    ...state,
    phase: 'rest',
    phaseStartedAtMs: nowMs,
    restEndsAtMs: nowMs + restSec * 1000,
    durationEndsAtMs: null,
    pausedRemainingMs: null
  };
}

function enterSummary(state: WorkoutSessionState, nowMs: number): WorkoutSessionState {
  return {
    ...state,
    phase: 'summary',
    finishedAtMs: state.finishedAtMs ?? nowMs,
    restEndsAtMs: null,
    durationEndsAtMs: null,
    pausedRemainingMs: null
  };
}

function nextIndex(state: WorkoutSessionState): number | null {
  const next = state.currentIndex + 1;
  return next < state.order.length ? next : null;
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function startSession(
  date: string,
  exercises: ScheduledExercise[],
  nowMs: number,
  settings?: Partial<WorkoutSessionSettings>
): WorkoutSessionState {
  const planned = exercises.filter((item) => item.status === 'PLANNED');
  const order = planned.map((item) => item.id);
  const plan: Record<string, SessionExerciseMeta> = {};
  const perExercise: Record<string, PerExerciseState> = {};
  for (const item of planned) {
    plan[item.id] = toMeta(item);
    perExercise[item.id] = { setsDone: 0 };
  }

  const base: WorkoutSessionState = {
    version: SESSION_VERSION,
    date,
    startedAtMs: nowMs,
    finishedAtMs: null,
    order,
    plan,
    currentIndex: 0,
    currentSet: 1,
    phase: 'exercise',
    phaseStartedAtMs: nowMs,
    restEndsAtMs: null,
    durationEndsAtMs: null,
    pausedRemainingMs: null,
    perExercise,
    syncedOutcomes: {},
    settings: { ...DEFAULT_SESSION_SETTINGS, ...settings }
  };

  if (!order.length) return enterSummary(base, nowMs);
  return enterExercise(base, 0, 1, nowMs);
}

export function sessionReducer(state: WorkoutSessionState, action: SessionAction): WorkoutSessionState {
  switch (action.type) {
    case 'START':
      return startSession(action.date, action.exercises, action.nowMs, action.settings);

    case 'COMPLETE_SET': {
      if (state.phase !== 'exercise') return state;
      const currentId = state.order[state.currentIndex];
      const meta = state.plan[currentId];
      if (!meta) return state;
      const per = state.perExercise[currentId] ?? { setsDone: 0 };
      const setsDone = per.setsDone + 1;
      const total = totalSets(meta);
      const nextPer = { ...state.perExercise, [currentId]: { ...per, setsDone } };

      if (setsDone < total) {
        // More sets remain: rest, then continue the same exercise at the next set.
        // Clear actualReps so descending schemes (15/12/10) reset to the next set target.
        const betweenSets = {
          ...nextPer,
          [currentId]: { ...nextPer[currentId], actualReps: undefined }
        };
        const rested = enterRest({ ...state, perExercise: betweenSets }, state.settings.restSetSec, action.nowMs);
        return { ...rested, currentSet: state.currentSet + 1 };
      }

      // Exercise complete. For duration work, log elapsed time (not only the prescription).
      const completedPer = {
        ...nextPer[currentId],
        ...(isDurationBased(meta)
          ? {
              actualDurationSeconds:
                nextPer[currentId].actualDurationSeconds ??
                elapsedDurationSeconds(state, action.nowMs, meta.durationSeconds)
            }
          : {}),
        ...(isDistanceBased(meta)
          ? {
              actualDistance:
                nextPer[currentId].actualDistance ?? meta.distance ?? null
            }
          : {})
      };
      const done = {
        ...state,
        perExercise: { ...nextPer, [currentId]: { ...completedPer, outcome: 'done' as const } }
      };
      const next = nextIndex(state);
      if (next == null) return enterSummary(done, action.nowMs);
      // Rest before the next exercise; currentIndex already advanced so up-next reads correctly.
      const rested = enterRest({ ...done, currentIndex: next, currentSet: 1 }, state.settings.restExerciseSec, action.nowMs);
      return rested;
    }

    case 'ADJUST_ACTUALS': {
      const currentId = state.order[state.currentIndex];
      if (!currentId) return state;
      const per = state.perExercise[currentId] ?? { setsDone: 0 };
      return {
        ...state,
        perExercise: {
          ...state.perExercise,
          [currentId]: {
            ...per,
            ...(action.patch.reps !== undefined ? { actualReps: action.patch.reps } : {}),
            ...(action.patch.weight !== undefined ? { actualWeight: action.patch.weight } : {}),
            ...(action.patch.durationSeconds !== undefined
              ? { actualDurationSeconds: action.patch.durationSeconds }
              : {}),
            ...(action.patch.distance !== undefined ? { actualDistance: action.patch.distance } : {})
          }
        }
      };
    }

    case 'MARK_SYNCED':
      return {
        ...state,
        syncedOutcomes: { ...state.syncedOutcomes, [action.id]: action.outcome }
      };

    case 'SKIP_EXERCISE': {
      if (state.phase === 'summary') return state;
      const currentId = state.order[state.currentIndex];
      if (!currentId) return state;
      const per = state.perExercise[currentId] ?? { setsDone: 0 };
      const skipped = {
        ...state,
        perExercise: { ...state.perExercise, [currentId]: { ...per, outcome: 'skipped' as const } }
      };
      const next = nextIndex(state);
      if (next == null) return enterSummary(skipped, action.nowMs);
      return enterExercise(skipped, next, 1, action.nowMs);
    }

    case 'SKIP_REST': {
      if (state.phase !== 'rest') return state;
      // "Skip rest" and "Start" after rest both mean: begin the current exercise/set now.
      return enterExercise(state, state.currentIndex, state.currentSet, action.nowMs);
    }

    case 'EXTEND_REST_15':
      return sessionReducer(state, { type: 'ADJUST_REST_15', delta: 1, nowMs: action.nowMs });

    case 'ADJUST_REST_15': {
      if (state.phase !== 'rest') return state;
      const deltaMs = action.delta * REST_STEP_SEC * 1000;
      // Between-set rest has currentSet > 1; between-exercise rest resets to set 1.
      // Keep both intervals in sync so ±15 applies to future set AND exercise rests.
      const settingKey = state.currentSet > 1 ? 'restSetSec' : 'restExerciseSec';
      const nextSec = clampRestSec(state.settings[settingKey] + action.delta * REST_STEP_SEC);
      const nextSettings = {
        ...state.settings,
        restSetSec: nextSec,
        restExerciseSec: nextSec
      };

      if (state.pausedRemainingMs != null) {
        return {
          ...state,
          settings: nextSettings,
          pausedRemainingMs: Math.max(0, state.pausedRemainingMs + deltaMs)
        };
      }
      if (state.restEndsAtMs == null) return { ...state, settings: nextSettings };
      // Shortening past "now" clamps to zero remaining (rest complete).
      const nextEnds = Math.max(action.nowMs, state.restEndsAtMs + deltaMs);
      return { ...state, settings: nextSettings, restEndsAtMs: nextEnds };
    }

    case 'PAUSE': {
      if (state.pausedRemainingMs != null) return state;
      const active = state.phase === 'rest' ? state.restEndsAtMs : state.durationEndsAtMs;
      if (active == null) return state;
      return { ...state, pausedRemainingMs: Math.max(0, active - action.nowMs) };
    }

    case 'RESUME': {
      if (state.pausedRemainingMs == null) return state;
      const remaining = state.pausedRemainingMs;
      if (state.phase === 'rest') {
        return { ...state, restEndsAtMs: action.nowMs + remaining, pausedRemainingMs: null };
      }
      if (state.durationEndsAtMs != null) {
        return { ...state, durationEndsAtMs: action.nowMs + remaining, pausedRemainingMs: null };
      }
      return { ...state, pausedRemainingMs: null };
    }

    case 'RECONCILE':
      return reconcile(state, action.exercises, action.nowMs);

    case 'SET_SOUND':
      return { ...state, settings: { ...state.settings, sound: action.sound } };

    case 'FINISH':
      return enterSummary(state, action.nowMs);

    default:
      return state;
  }
}

function reconcile(state: WorkoutSessionState, exercises: ScheduledExercise[], nowMs: number): WorkoutSessionState {
  if (state.phase === 'summary') return state;
  const byId = new Map(exercises.map((item) => [item.id, item]));

  const keep = (id: string) => {
    const mine = state.perExercise[id]?.outcome;
    if (mine) return true; // we handled it — keep for the summary
    const ex = byId.get(id);
    if (!ex) return false; // deleted server-side
    if (ex.status === 'DONE' || ex.status === 'SKIPPED') return false; // handled on another device
    return true;
  };

  const currentId = state.order[state.currentIndex];
  const newOrder = state.order.filter(keep);

  if (newOrder.join(',') === state.order.join(',')) {
    // Nothing dropped — just refresh metadata for still-present items.
    return { ...state, plan: refreshedPlan(state, byId) };
  }

  const plan = refreshedPlan({ ...state, order: newOrder }, byId);

  // Resolve the new current position.
  let newIndex: number;
  if (currentId && newOrder.includes(currentId)) {
    newIndex = newOrder.indexOf(currentId);
  } else {
    newIndex = newOrder.findIndex((id) => !state.perExercise[id]?.outcome);
  }

  const rebased: WorkoutSessionState = { ...state, order: newOrder, plan };

  if (newIndex < 0) return enterSummary(rebased, nowMs);

  if (currentId && newOrder.includes(currentId)) {
    // Current exercise survived: keep phase/timers, just fix the index.
    return { ...rebased, currentIndex: newIndex };
  }
  // Current vanished: move to the next pending exercise fresh.
  return enterExercise(rebased, newIndex, 1, nowMs);
}

function refreshedPlan(
  state: WorkoutSessionState,
  byId: Map<string, ScheduledExercise>
): Record<string, SessionExerciseMeta> {
  const plan: Record<string, SessionExerciseMeta> = {};
  for (const id of state.order) {
    const ex = byId.get(id);
    plan[id] = ex ? toMeta(ex) : state.plan[id];
  }
  return plan;
}

// ---------------------------------------------------------------------------
// Derived values
// ---------------------------------------------------------------------------

/** Remaining ms on whichever timer is active, or null if none. Pure. */
export function remainingMs(state: WorkoutSessionState, nowMs: number): number | null {
  if (state.pausedRemainingMs != null) return state.pausedRemainingMs;
  if (state.phase === 'rest' && state.restEndsAtMs != null) return Math.max(0, state.restEndsAtMs - nowMs);
  if (state.phase === 'exercise' && state.durationEndsAtMs != null) {
    return Math.max(0, state.durationEndsAtMs - nowMs);
  }
  return null;
}

/** Elapsed duration seconds for a timed exercise (prescribed − remaining), min 1. */
export function elapsedDurationSeconds(
  state: WorkoutSessionState,
  nowMs: number,
  prescribedSeconds: number | null
): number {
  const prescribed = prescribedSeconds && prescribedSeconds > 0 ? prescribedSeconds : null;
  if (prescribed != null && (state.durationEndsAtMs != null || state.pausedRemainingMs != null)) {
    const rem = remainingMs(state, nowMs) ?? 0;
    const elapsedMs = Math.max(0, prescribed * 1000 - rem);
    return Math.max(1, Math.round(elapsedMs / 1000));
  }
  const elapsedMs = Math.max(0, nowMs - state.phaseStartedAtMs);
  return Math.max(1, Math.round(elapsedMs / 1000));
}

export function currentMeta(state: WorkoutSessionState): SessionExerciseMeta | null {
  return state.plan[state.order[state.currentIndex]] ?? null;
}

export function upNextMeta(state: WorkoutSessionState): SessionExerciseMeta | null {
  if (state.phase === 'rest') return currentMeta(state);
  const next = state.currentIndex + 1;
  return state.plan[state.order[next]] ?? null;
}

export type SessionSummary = {
  elapsedMs: number;
  doneCount: number;
  skippedCount: number;
  totalCount: number;
  perExercise: Array<{ meta: SessionExerciseMeta; state: PerExerciseState }>;
};

export function sessionSummary(state: WorkoutSessionState, nowMs: number): SessionSummary {
  const endMs = state.finishedAtMs ?? nowMs;
  let doneCount = 0;
  let skippedCount = 0;
  const perExercise = state.order.map((id) => {
    const per = state.perExercise[id] ?? { setsDone: 0 };
    if (per.outcome === 'done') doneCount += 1;
    if (per.outcome === 'skipped') skippedCount += 1;
    return { meta: state.plan[id], state: per };
  });
  return {
    elapsedMs: Math.max(0, endMs - state.startedAtMs),
    doneCount,
    skippedCount,
    totalCount: state.order.length,
    perExercise
  };
}

/** Actuals to send with mark-done for a completed exercise. Undefined fields are omitted upstream. */
export function actualsForExercise(state: WorkoutSessionState, id: string) {
  const per = state.perExercise[id];
  const meta = state.plan[id];
  if (!per) return {};
  if (meta && isDurationBased(meta)) {
    return {
      actualDurationSeconds: per.actualDurationSeconds ?? meta.durationSeconds ?? undefined
    };
  }
  if (meta && isDistanceBased(meta)) {
    return {
      actualDistance: per.actualDistance ?? meta.distance ?? undefined
    };
  }
  return {
    actualReps: per.actualReps ?? undefined,
    actualWeight: per.actualWeight ?? undefined,
    actualDurationSeconds: per.actualDurationSeconds ?? undefined,
    actualSets: per.setsDone || undefined
  };
}

// ---------------------------------------------------------------------------
// Persistence (localStorage). All access guarded for SSR / privacy modes.
// ---------------------------------------------------------------------------

/** Per-date storage key so changing `?date=` cannot wipe another day's session. */
export function sessionStorageKey(date: string): string {
  return `${SESSION_STORAGE_KEY}:${date}`;
}

export function saveSession(state: WorkoutSessionState): void {
  try {
    window.localStorage.setItem(sessionStorageKey(state.date), JSON.stringify(state));
    // Drop legacy single-slot key when it belongs to this date.
    const legacy = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (legacy) {
      try {
        const parsed = JSON.parse(legacy) as WorkoutSessionState;
        if (parsed?.date === state.date) window.localStorage.removeItem(SESSION_STORAGE_KEY);
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore quota / unavailable storage
  }
}

function normalizeLoadedSession(parsed: WorkoutSessionState): WorkoutSessionState {
  return {
    ...parsed,
    syncedOutcomes: parsed.syncedOutcomes ?? {},
    settings: {
      ...DEFAULT_SESSION_SETTINGS,
      ...parsed.settings,
      sound: parsed.settings?.sound ?? DEFAULT_SESSION_SETTINGS.sound
    }
  };
}

/** Last-used sound + rest intervals, stored separately from the per-date session. */
export function loadSessionPrefs(): Partial<WorkoutSessionSettings> {
  try {
    const raw = window.localStorage.getItem(SESSION_PREFS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<WorkoutSessionSettings>;
    const prefs: Partial<WorkoutSessionSettings> = {};
    if (typeof parsed.sound === 'boolean') prefs.sound = parsed.sound;
    if (typeof parsed.restSetSec === 'number') prefs.restSetSec = clampRestSec(parsed.restSetSec);
    if (typeof parsed.restExerciseSec === 'number') {
      prefs.restExerciseSec = clampRestSec(parsed.restExerciseSec);
    }
    return prefs;
  } catch {
    return {};
  }
}

export function saveSessionPrefs(settings: WorkoutSessionSettings): void {
  try {
    window.localStorage.setItem(
      SESSION_PREFS_KEY,
      JSON.stringify({
        sound: settings.sound,
        restSetSec: settings.restSetSec,
        restExerciseSec: settings.restExerciseSec
      })
    );
  } catch {
    // ignore quota / unavailable storage
  }
}

export function loadSession(date?: string): WorkoutSessionState | null {
  try {
    if (date) {
      const dated = window.localStorage.getItem(sessionStorageKey(date));
      if (dated) {
        const parsed = JSON.parse(dated) as WorkoutSessionState;
        if (parsed?.version !== SESSION_VERSION || parsed.date !== date) return null;
        return normalizeLoadedSession(parsed);
      }
      // Legacy single-key fallback (pre date-scoped storage).
      const legacy = window.localStorage.getItem(SESSION_STORAGE_KEY);
      if (!legacy) return null;
      const parsed = JSON.parse(legacy) as WorkoutSessionState;
      if (parsed?.version !== SESSION_VERSION || parsed.date !== date) return null;
      return normalizeLoadedSession(parsed);
    }
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WorkoutSessionState;
    if (parsed?.version !== SESSION_VERSION) return null;
    return normalizeLoadedSession(parsed);
  } catch {
    return null;
  }
}

export function clearSession(date?: string): void {
  try {
    if (date) {
      window.localStorage.removeItem(sessionStorageKey(date));
      const legacy = window.localStorage.getItem(SESSION_STORAGE_KEY);
      if (legacy) {
        try {
          const parsed = JSON.parse(legacy) as WorkoutSessionState;
          if (parsed?.date === date) window.localStorage.removeItem(SESSION_STORAGE_KEY);
        } catch {
          window.localStorage.removeItem(SESSION_STORAGE_KEY);
        }
      }
      return;
    }
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    const prefix = `${SESSION_STORAGE_KEY}:`;
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(prefix)) keys.push(key);
    }
    for (const key of keys) window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/** True when a resumable (not-yet-finished) session is stored for `date`. */
export function hasStoredSessionForDate(date: string): boolean {
  const stored = loadSession(date);
  return Boolean(stored && stored.phase !== 'summary');
}
