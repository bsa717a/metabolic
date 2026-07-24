import { Minus, Plus, SkipForward } from 'lucide-react';
import { formatPlan } from '../../../utils/exerciseFormat';
import { REST_STEP_SEC, type SessionExerciseMeta } from '../../../utils/workoutSession';
import { formatClock } from './format';

/** Between-set / between-exercise rest with an up-next preview. */
export function SessionRestTimer({
  remainingMs,
  restIntervalSec,
  upNext,
  upNextIsSameExercise,
  onSkip,
  onAdjustRest
}: {
  remainingMs: number;
  /** Current default for this kind of rest (set vs between-exercise), shown so ±15 is clear. */
  restIntervalSec: number;
  upNext: SessionExerciseMeta | null;
  upNextIsSameExercise: boolean;
  onSkip: () => void;
  onAdjustRest: (delta: 1 | -1) => void;
}) {
  const over = remainingMs <= 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 text-center">
      <div className="shrink-0 pt-2">
        <p className="text-sm font-semibold uppercase tracking-widest text-emerald-300">
          {over ? 'Rest complete' : 'Rest'}
        </p>
        <div className="mt-2 text-7xl font-bold tabular-nums text-white sm:text-8xl">
          {formatClock(remainingMs)}
        </div>
        <p className="mt-2 text-sm text-white/45">
          {upNextIsSameExercise ? 'Between sets' : 'Between exercises'}: {restIntervalSec}s
        </p>
      </div>

      {upNext && (
        <div className="mx-auto w-full max-w-sm shrink-0 rounded-2xl bg-white/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/50">
            {upNextIsSameExercise ? 'Next set' : 'Up next'}
          </p>
          <p className="mt-1 text-2xl font-semibold text-white">{upNext.name}</p>
          <p className="text-base text-white/60">{formatPlan(upNext)}</p>
        </div>
      )}

      {/* Between-set rest auto-starts when the timer hits zero; between-exercise still needs Start. */}
      {(!over || !upNextIsSameExercise) && (
        <button
          type="button"
          className="flex min-h-[12rem] w-full flex-1 items-center justify-center rounded-3xl bg-emerald-500 px-4 py-8 text-3xl font-bold text-white shadow-lg active:bg-emerald-600 sm:min-h-[16rem] sm:text-4xl"
          onClick={onSkip}
        >
          {over ? 'Start' : 'Skip rest'}
        </button>
      )}
      {over && upNextIsSameExercise && (
        <p className="flex flex-1 items-center justify-center text-lg font-semibold text-white/60">
          Starting next set…
        </p>
      )}

      {!over && (
        <>
          <div className="grid shrink-0 grid-cols-2 gap-3">
            <button
              type="button"
              className="flex items-center justify-center gap-2 rounded-2xl bg-white/5 py-3 text-sm font-semibold text-white/70 active:bg-white/10"
              onClick={() => onAdjustRest(-1)}
            >
              <Minus className="h-4 w-4" />
              {REST_STEP_SEC}s
            </button>
            <button
              type="button"
              className="flex items-center justify-center gap-2 rounded-2xl bg-white/5 py-3 text-sm font-semibold text-white/70 active:bg-white/10"
              onClick={() => onAdjustRest(1)}
            >
              <Plus className="h-4 w-4" />
              {REST_STEP_SEC}s
            </button>
          </div>
          <p className="flex shrink-0 items-center justify-center gap-1 text-xs text-white/40">
            <SkipForward className="h-3 w-3" />
            {upNextIsSameExercise
              ? `±${REST_STEP_SEC}s adjusts rest · next set starts automatically`
              : `±${REST_STEP_SEC}s adjusts this rest and future ones`}
          </p>
        </>
      )}
    </div>
  );
}
