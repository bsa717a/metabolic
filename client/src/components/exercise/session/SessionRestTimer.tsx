import { Plus, SkipForward } from 'lucide-react';
import { formatPlan } from '../../../utils/exerciseFormat';
import type { SessionExerciseMeta } from '../../../utils/workoutSession';
import { formatClock } from './format';

/** Between-set / between-exercise rest with an up-next preview. */
export function SessionRestTimer({
  remainingMs,
  upNext,
  upNextIsSameExercise,
  onSkip,
  onExtend
}: {
  remainingMs: number;
  upNext: SessionExerciseMeta | null;
  upNextIsSameExercise: boolean;
  onSkip: () => void;
  onExtend: () => void;
}) {
  const over = remainingMs <= 0;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
      <div>
        <p className="text-sm font-semibold uppercase tracking-widest text-emerald-300">
          {over ? 'Rest complete' : 'Rest'}
        </p>
        <div className="mt-2 text-7xl font-bold tabular-nums text-white">{formatClock(remainingMs)}</div>
      </div>

      {upNext && (
        <div className="w-full max-w-xs rounded-2xl bg-white/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/50">
            {upNextIsSameExercise ? 'Next set' : 'Up next'}
          </p>
          <p className="mt-1 text-lg font-semibold text-white">{upNext.name}</p>
          <p className="text-sm text-white/60">{formatPlan(upNext)}</p>
        </div>
      )}

      <div className="w-full space-y-3">
        <button
          type="button"
          className="w-full rounded-2xl bg-emerald-500 py-5 text-lg font-bold text-white shadow-lg active:bg-emerald-600"
          onClick={onSkip}
        >
          {over ? 'Start' : 'Skip rest'}
        </button>
        {!over && (
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white/5 py-3 text-sm font-semibold text-white/70 active:bg-white/10"
            onClick={onExtend}
          >
            <Plus className="h-4 w-4" />
            Add 15s
          </button>
        )}
      </div>
      {!over && (
        <p className="flex items-center gap-1 text-xs text-white/40">
          <SkipForward className="h-3 w-3" /> Tap Skip rest to begin early
        </p>
      )}
    </div>
  );
}
