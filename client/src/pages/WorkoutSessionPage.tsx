import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { X } from 'lucide-react';
import { todayKey } from '../services/api';
import { useWorkoutSession } from '../hooks/useWorkoutSession';
import { useWakeLock } from '../hooks/useWakeLock';
import { primeAudio } from '../utils/sessionCues';
import { clearSession, currentMeta, sessionSummary } from '../utils/workoutSession';
import { SessionProgressBar } from '../components/exercise/session/SessionProgressBar';
import { SessionExerciseCard } from '../components/exercise/session/SessionExerciseCard';
import { SessionRestTimer } from '../components/exercise/session/SessionRestTimer';
import { SessionSummary } from '../components/exercise/session/SessionSummary';

export function WorkoutSessionPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const dateParam = searchParams.get('date');
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : todayKey();

  const session = useWorkoutSession(date);
  const { state, ready, loadError, now, remaining, syncError } = session;
  const [confirmEnd, setConfirmEnd] = useState(false);

  const active = Boolean(state) && state?.phase !== 'summary';
  useWakeLock(active);

  // Warn before leaving mid-workout (refresh / close).
  useEffect(() => {
    if (!active) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [active]);

  function leaveToToday() {
    clearSession();
    navigate(`/exercise?date=${date}`);
  }

  function prime<T extends unknown[]>(fn: (...args: T) => void) {
    return (...args: T) => {
      primeAudio();
      fn(...args);
    };
  }

  if (!ready && !state) {
    return (
      <div className="grid min-h-dvh place-items-center bg-slate-950 text-white/70">Loading workout…</div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-slate-950 px-6 text-center text-white">
        <p className="text-lg font-semibold">Could not load workout</p>
        <p className="text-sm text-white/60">{loadError}</p>
        <button
          type="button"
          className="rounded-2xl bg-white/10 px-5 py-3 text-sm font-semibold text-white active:bg-white/20"
          onClick={() => navigate(`/exercise?date=${date}`)}
        >
          Back to exercise
        </button>
      </div>
    );
  }

  if (ready && !state) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-slate-950 px-6 text-center text-white">
        <p className="text-lg font-semibold">No workout to start</p>
        <p className="text-sm text-white/60">There are no planned exercises for this day.</p>
        <button
          type="button"
          className="rounded-2xl bg-white/10 px-5 py-3 text-sm font-semibold text-white active:bg-white/20"
          onClick={() => navigate(`/exercise?date=${date}`)}
        >
          Back to exercise
        </button>
      </div>
    );
  }

  const summaryData = state ? sessionSummary(state, now) : null;
  const meta = state ? currentMeta(state) : null;

  return (
    <div className="flex min-h-dvh flex-col bg-slate-950 px-5 pb-8 pt-5 text-white">
      {state && state.phase !== 'summary' && (
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <SessionProgressBar
              total={state.order.length}
              currentIndex={state.currentIndex}
              completedCount={
                state.order.filter((id) => state.perExercise[id]?.outcome === 'done').length
              }
            />
          </div>
          <button
            type="button"
            aria-label="End workout"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 text-white/80 active:bg-white/20"
            onClick={() => setConfirmEnd(true)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}

      {syncError && (
        <div className="mt-3 rounded-xl bg-amber-500/20 px-3 py-2 text-xs text-amber-200">{syncError}</div>
      )}

      <div className="mt-6 flex flex-1 flex-col">
        {state && state.phase === 'exercise' && meta && (
          <SessionExerciseCard
            meta={meta}
            currentSet={state.currentSet}
            per={state.perExercise[meta.id] ?? { setsDone: 0 }}
            durationRemainingMs={remaining}
            paused={state.pausedRemainingMs != null}
            onCompleteSet={prime(session.completeSet)}
            onAdjust={session.adjustActuals}
            onSkip={prime(session.skipExercise)}
            onPause={session.pause}
            onResume={session.resume}
          />
        )}

        {state && state.phase === 'rest' && (
          <SessionRestTimer
            remainingMs={remaining ?? 0}
            upNext={meta}
            upNextIsSameExercise={state.currentSet > 1}
            onSkip={prime(session.skipRest)}
            onExtend={session.extendRest}
          />
        )}

        {state && state.phase === 'summary' && summaryData && (
          <SessionSummary summary={summaryData} onDone={leaveToToday} />
        )}
      </div>

      {confirmEnd && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-6">
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 p-6 text-center">
            <h3 className="text-lg font-bold text-white">End workout?</h3>
            <p className="mt-1 text-sm text-white/60">
              Completed exercises are already saved. You can restart anytime.
            </p>
            <div className="mt-5 space-y-2">
              <button
                type="button"
                className="w-full rounded-2xl bg-emerald-500 py-3 font-semibold text-white active:bg-emerald-600"
                onClick={() => {
                  session.finish();
                  setConfirmEnd(false);
                }}
              >
                End &amp; see summary
              </button>
              <button
                type="button"
                className="w-full rounded-2xl bg-white/10 py-3 font-semibold text-white active:bg-white/20"
                onClick={() => setConfirmEnd(false)}
              >
                Keep going
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
