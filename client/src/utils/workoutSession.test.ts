import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ScheduledExercise } from '../types';
import {
  SESSION_STORAGE_KEY,
  actualsForExercise,
  clearSession,
  hasStoredSessionForDate,
  loadSession,
  remainingMs,
  saveSession,
  sessionReducer,
  sessionSummary,
  startSession,
  type WorkoutSessionState
} from './workoutSession';

function ex(id: string, status: string, presc: Partial<ScheduledExercise> = {}): ScheduledExercise {
  return {
    id,
    status,
    sets: null,
    reps: null,
    durationMinutes: null,
    distance: null,
    weight: null,
    exercise: { name: id, bodyPart: null, description: null, howToVideoUrl: null },
    ...presc
  };
}

const REST_SET_MS = 45 * 1000;
const REST_EX_MS = 45 * 1000;

describe('startSession', () => {
  it('captures PLANNED-only order and starts on the first exercise', () => {
    const s = startSession(
      '2026-07-20',
      [ex('a', 'PLANNED', { sets: 3, reps: 10 }), ex('done', 'DONE'), ex('b', 'PLANNED', { sets: 1 })],
      1000
    );
    expect(s.order).toEqual(['a', 'b']);
    expect(s.phase).toBe('exercise');
    expect(s.currentIndex).toBe(0);
    expect(s.currentSet).toBe(1);
    expect(s.startedAtMs).toBe(1000);
  });

  it('goes straight to summary when nothing is planned', () => {
    const s = startSession('2026-07-20', [ex('done', 'DONE')], 1000);
    expect(s.phase).toBe('summary');
    expect(s.order).toEqual([]);
  });

  it('arms a duration countdown for duration-based exercises', () => {
    const s = startSession('2026-07-20', [ex('c', 'PLANNED', { durationMinutes: 2 })], 1000);
    expect(s.durationEndsAtMs).toBe(1000 + 2 * 60_000);
    expect(remainingMs(s, 1000)).toBe(120_000);
  });
});

describe('COMPLETE_SET', () => {
  it('rests between sets and advances the set counter', () => {
    const s0 = startSession('d', [ex('a', 'PLANNED', { sets: 3, reps: 10 })], 1000);
    const s1 = sessionReducer(s0, { type: 'COMPLETE_SET', nowMs: 2000 });
    expect(s1.phase).toBe('rest');
    expect(s1.currentSet).toBe(2);
    expect(s1.restEndsAtMs).toBe(2000 + REST_SET_MS);
    expect(s1.perExercise.a.setsDone).toBe(1);
  });

  it('completes the exercise on the final set and rests before the next', () => {
    let s = startSession('d', [ex('a', 'PLANNED', { sets: 2 }), ex('b', 'PLANNED', { sets: 1 })], 1000);
    s = sessionReducer(s, { type: 'COMPLETE_SET', nowMs: 2000 }); // set1 -> rest
    s = sessionReducer(s, { type: 'SKIP_REST', nowMs: 3000 }); // -> set2
    s = sessionReducer(s, { type: 'COMPLETE_SET', nowMs: 4000 }); // set2 -> exercise complete
    expect(s.perExercise.a.outcome).toBe('done');
    expect(s.phase).toBe('rest');
    expect(s.currentIndex).toBe(1);
    expect(s.currentSet).toBe(1);
    expect(s.restEndsAtMs).toBe(4000 + REST_EX_MS);
  });

  it('finishes the workout after the last exercise', () => {
    let s = startSession('d', [ex('a', 'PLANNED', { sets: 1 })], 1000);
    s = sessionReducer(s, { type: 'COMPLETE_SET', nowMs: 2000 });
    expect(s.phase).toBe('summary');
    expect(s.perExercise.a.outcome).toBe('done');
  });
});

describe('rest timers', () => {
  const rest = sessionReducer(startSession('d', [ex('a', 'PLANNED', { sets: 3 })], 1000), {
    type: 'COMPLETE_SET',
    nowMs: 2000
  });

  it('remainingMs clamps to zero once the deadline passes (backgrounding)', () => {
    expect(remainingMs(rest, 2000)).toBe(REST_SET_MS);
    expect(remainingMs(rest, 9_999_999)).toBe(0);
  });

  it('PAUSE freezes remaining and RESUME rebases the deadline', () => {
    const paused = sessionReducer(rest, { type: 'PAUSE', nowMs: 12_000 });
    expect(paused.pausedRemainingMs).toBe(2000 + REST_SET_MS - 12_000);
    expect(remainingMs(paused, 9_999_999)).toBe(paused.pausedRemainingMs);
    const resumed = sessionReducer(paused, { type: 'RESUME', nowMs: 20_000 });
    expect(resumed.pausedRemainingMs).toBeNull();
    expect(resumed.restEndsAtMs).toBe(20_000 + (2000 + REST_SET_MS - 12_000));
  });

  it('ADJUST_REST_15 +1 extends the timer and raises set + exercise intervals', () => {
    const ext = sessionReducer(rest, { type: 'ADJUST_REST_15', delta: 1, nowMs: 5000 });
    expect(ext.restEndsAtMs).toBe(rest.restEndsAtMs! + 15_000);
    expect(ext.settings.restSetSec).toBe(60);
    expect(ext.settings.restExerciseSec).toBe(60);
  });

  it('ADJUST_REST_15 -1 shortens the timer and lowers set + exercise intervals', () => {
    const shortened = sessionReducer(rest, { type: 'ADJUST_REST_15', delta: -1, nowMs: 5000 });
    expect(shortened.restEndsAtMs).toBe(rest.restEndsAtMs! - 15_000);
    expect(shortened.settings.restSetSec).toBe(30);
    expect(shortened.settings.restExerciseSec).toBe(30);
  });

  it('adjusted rest carries from between-set into between-exercise rest', () => {
    let s = startSession(
      'd',
      [ex('a', 'PLANNED', { sets: 2 }), ex('b', 'PLANNED', { sets: 1 })],
      1000
    );
    s = sessionReducer(s, { type: 'COMPLETE_SET', nowMs: 2000 }); // between-set rest
    s = sessionReducer(s, { type: 'ADJUST_REST_15', delta: 1, nowMs: 3000 }); // 45 → 60
    s = sessionReducer(s, { type: 'SKIP_REST', nowMs: 4000 });
    s = sessionReducer(s, { type: 'COMPLETE_SET', nowMs: 5000 }); // finish exercise a → between-exercise rest
    expect(s.phase).toBe('rest');
    expect(s.currentSet).toBe(1);
    expect(s.settings.restExerciseSec).toBe(60);
    expect(s.restEndsAtMs).toBe(5000 + 60_000);
  });

  it('SKIP_REST resumes the exercise at the pending set', () => {
    const resumed = sessionReducer(rest, { type: 'SKIP_REST', nowMs: 8000 });
    expect(resumed.phase).toBe('exercise');
    expect(resumed.currentSet).toBe(2);
    expect(resumed.restEndsAtMs).toBeNull();
  });
});

describe('SKIP_EXERCISE', () => {
  it('marks skipped and advances with no rest', () => {
    const s0 = startSession('d', [ex('a', 'PLANNED', { sets: 3 }), ex('b', 'PLANNED', { sets: 1 })], 1000);
    const s1 = sessionReducer(s0, { type: 'SKIP_EXERCISE', nowMs: 3000 });
    expect(s1.perExercise.a.outcome).toBe('skipped');
    expect(s1.currentIndex).toBe(1);
    expect(s1.phase).toBe('exercise');
  });
});

describe('RECONCILE', () => {
  it('drops deleted and externally-completed exercises we did not touch', () => {
    const s0 = startSession(
      'x',
      [ex('a', 'PLANNED', { sets: 1 }), ex('b', 'PLANNED', { sets: 1 }), ex('c', 'PLANNED', { sets: 1 })],
      1000
    );
    // b deleted server-side, c completed on another device.
    const server = [ex('a', 'PLANNED', { sets: 1 }), ex('c', 'DONE', { sets: 1 })];
    const r = sessionReducer(s0, { type: 'RECONCILE', exercises: server, nowMs: 2000 });
    expect(r.order).toEqual(['a']);
    expect(r.currentIndex).toBe(0);
  });

  it('advances to the next pending exercise when the current one vanishes', () => {
    const s0 = startSession('x', [ex('a', 'PLANNED', { sets: 1 }), ex('b', 'PLANNED', { sets: 1 })], 1000);
    const server = [ex('b', 'PLANNED', { sets: 1 })]; // a deleted
    const r = sessionReducer(s0, { type: 'RECONCILE', exercises: server, nowMs: 2000 });
    expect(r.order).toEqual(['b']);
    expect(r.currentIndex).toBe(0);
    expect(r.phase).toBe('exercise');
  });

  it('retains exercises we already completed even if the server dropped them', () => {
    let s = startSession(
      'x',
      [ex('a', 'PLANNED', { sets: 1 }), ex('b', 'PLANNED', { sets: 1 }), ex('c', 'PLANNED', { sets: 1 })],
      1000
    );
    s = sessionReducer(s, { type: 'COMPLETE_SET', nowMs: 1500 }); // finish a
    const server = [ex('b', 'PLANNED', { sets: 1 }), ex('c', 'PLANNED', { sets: 1 })]; // a gone from server
    const r = sessionReducer(s, { type: 'RECONCILE', exercises: server, nowMs: 3000 });
    expect(r.order).toContain('a');
  });
});

describe('actualsForExercise', () => {
  it('logs elapsed duration minutes (not only the prescription)', () => {
    let s = startSession('d', [ex('c', 'PLANNED', { durationMinutes: 20 })], 1000);
    // ~10 minutes into a 20-minute block
    s = sessionReducer(s, { type: 'COMPLETE_SET', nowMs: 1000 + 10 * 60_000 });
    expect(actualsForExercise(s, 'c')).toEqual({ actualDurationMinutes: 10 });
  });

  it('keeps a manually adjusted duration when completing', () => {
    let s = startSession('d', [ex('c', 'PLANNED', { durationMinutes: 20 })], 1000);
    s = sessionReducer(s, {
      type: 'ADJUST_ACTUALS',
      patch: { durationMinutes: 12 },
      nowMs: 1500
    });
    s = sessionReducer(s, { type: 'COMPLETE_SET', nowMs: 2000 });
    expect(actualsForExercise(s, 'c')).toEqual({ actualDurationMinutes: 12 });
  });

  it('sends actualDistance for distance-based exercises', () => {
    let s = startSession('d', [ex('run', 'PLANNED', { distance: 3.1 })], 1000);
    s = sessionReducer(s, { type: 'COMPLETE_SET', nowMs: 2000 });
    expect(actualsForExercise(s, 'run')).toEqual({ actualDistance: 3.1 });
  });

  it('sends set/rep actuals for set-based exercises', () => {
    let s = startSession('d', [ex('a', 'PLANNED', { sets: 2, reps: 10, weight: 135 })], 1000);
    s = sessionReducer(s, { type: 'COMPLETE_SET', nowMs: 2000 });
    expect(actualsForExercise(s, 'a')).toEqual({ actualSets: 1 });
  });
});

describe('sessionSummary', () => {
  it('counts outcomes and elapsed time', () => {
    let s = startSession('d', [ex('a', 'PLANNED', { sets: 1 }), ex('b', 'PLANNED', { sets: 1 })], 1000);
    s = sessionReducer(s, { type: 'COMPLETE_SET', nowMs: 2000 }); // a done, rest before b
    s = sessionReducer(s, { type: 'SKIP_REST', nowMs: 2500 });
    s = sessionReducer(s, { type: 'SKIP_EXERCISE', nowMs: 3000 }); // b skipped -> summary
    const summary = sessionSummary(s, 10_000);
    expect(summary.doneCount).toBe(1);
    expect(summary.skippedCount).toBe(1);
    expect(summary.totalCount).toBe(2);
    expect(summary.elapsedMs).toBe((s.finishedAtMs ?? 0) - 1000);
  });
});

describe('persistence', () => {
  function makeStorage() {
    const map = new Map<string, string>();
    return {
      getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
      get length() {
        return map.size;
      },
      key: (i: number) => [...map.keys()][i] ?? null
    };
  }

  let sample: WorkoutSessionState;
  let otherDay: WorkoutSessionState;

  beforeAll(() => {
    (globalThis as unknown as { window: unknown }).window = { localStorage: makeStorage() };
    sample = startSession('2026-07-20', [ex('a', 'PLANNED', { sets: 2, reps: 10 })], 1000);
    otherDay = startSession('2026-07-21', [ex('b', 'PLANNED', { sets: 1 })], 1000);
  });

  afterAll(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it('round-trips a session and keeps days isolated', () => {
    saveSession(sample);
    saveSession(otherDay);
    expect(loadSession('2026-07-20')).toEqual(sample);
    expect(loadSession('2026-07-21')).toEqual(otherDay);
    expect(hasStoredSessionForDate('2026-07-20')).toBe(true);
  });

  it('rejects a mismatched version', () => {
    const storage = (globalThis as unknown as { window: { localStorage: Storage } }).window.localStorage;
    storage.setItem(
      `${SESSION_STORAGE_KEY}:2026-07-20`,
      JSON.stringify({ ...sample, version: 99 })
    );
    expect(loadSession('2026-07-20')).toBeNull();
  });

  it('clears one date without wiping another', () => {
    saveSession(sample);
    saveSession(otherDay);
    clearSession('2026-07-20');
    expect(loadSession('2026-07-20')).toBeNull();
    expect(loadSession('2026-07-21')).toEqual(otherDay);
  });

  it('reads the legacy single-slot key when the date matches', () => {
    clearSession();
    const storage = (globalThis as unknown as { window: { localStorage: Storage } }).window.localStorage;
    storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sample));
    expect(loadSession('2026-07-20')).toEqual(sample);
    expect(loadSession('2026-07-21')).toBeNull();
  });
});

describe('empty plan', () => {
  it('starts in summary with an empty order', () => {
    const s = startSession('2026-07-20', [], 1000);
    expect(s.phase).toBe('summary');
    expect(s.order).toEqual([]);
  });
});

describe('MARK_SYNCED', () => {
  it('records outcomes so remounts will not re-toggle skip', () => {
    let s = startSession('d', [ex('a', 'PLANNED', { sets: 1 })], 1000);
    s = sessionReducer(s, { type: 'SKIP_EXERCISE', nowMs: 2000 });
    s = sessionReducer(s, { type: 'MARK_SYNCED', id: 'a', outcome: 'skipped' });
    expect(s.syncedOutcomes.a).toBe('skipped');
  });
});
