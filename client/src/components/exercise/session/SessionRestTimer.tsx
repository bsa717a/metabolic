import { Minus, Pause, Play, Plus, SkipForward } from 'lucide-react';
import { clsx } from 'clsx';
import { formatPlan } from '../../../utils/exerciseFormat';
import { repsForSet, repSchemeParts } from '../../../utils/repSchemes';
import {
  REST_STEP_SEC,
  hasSets,
  totalSets,
  type SessionExerciseMeta
} from '../../../utils/workoutSession';
import { timerCueKind } from './format';
import { SessionRepScheme } from './SessionRepScheme';
import { SessionTimerClock } from './SessionTimerCue';

/** Between-set / between-exercise rest with an up-next preview. */
export function SessionRestTimer({
  remainingMs,
  restIntervalSec,
  upNext,
  upNextIsSameExercise,
  currentSet,
  paused,
  onSkip,
  onAdjustRest,
  onPause,
  onResume
}: {
  remainingMs: number;
  /** Current default for this kind of rest (set vs between-exercise), shown so ±15 is clear. */
  restIntervalSec: number;
  upNext: SessionExerciseMeta | null;
  upNextIsSameExercise: boolean;
  currentSet: number;
  paused: boolean;
  onSkip: () => void;
  onAdjustRest: (delta: 1 | -1) => void;
  onPause: () => void;
  onResume: () => void;
}) {
  const over = remainingMs <= 0 && !paused;
  const cue = timerCueKind(remainingMs, paused);
  const go = cue === 'go';

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 text-center">
      <div className="shrink-0 pt-2">
        <p
          className={clsx(
            'text-sm font-semibold uppercase tracking-widest',
            go ? 'text-white' : 'text-emerald-300'
          )}
        >
          {over ? 'Rest complete' : paused ? 'Rest paused' : 'Rest'}
        </p>
        <div className="mt-2">
          <SessionTimerClock remainingMs={remainingMs} paused={paused} goLabel="GO" size="rest" />
        </div>
        <p className={clsx('mt-2 text-sm', go ? 'text-white/80' : 'text-white/45')}>
          {upNextIsSameExercise ? 'Between sets' : 'Between exercises'}: {restIntervalSec}s
        </p>
      </div>

      {upNext && (
        <NextSetCard meta={upNext} currentSet={currentSet} sameExercise={upNextIsSameExercise} go={go} />
      )}

      {/* Between-set rest auto-starts after the GO beat; between-exercise still needs Start. */}
      {(!over || !upNextIsSameExercise) && (
        <button
          type="button"
          className={clsx(
            'relative z-40 flex min-h-[12rem] w-full flex-1 items-center justify-center rounded-3xl px-4 py-8 text-3xl font-bold shadow-lg sm:min-h-[16rem] sm:text-4xl',
            go
              ? 'bg-slate-950 text-white active:bg-slate-900'
              : 'bg-emerald-500 text-white active:bg-emerald-600'
          )}
          onClick={onSkip}
        >
          {over ? 'Start' : 'Skip rest'}
        </button>
      )}
      {over && upNextIsSameExercise && (
        <p className="relative z-40 flex flex-1 items-center justify-center text-lg font-semibold text-white">
          Starting next set…
        </p>
      )}

      {!over && (
        <>
          <button
            type="button"
            className="mx-auto flex shrink-0 items-center gap-2 rounded-full bg-white/10 px-5 py-2.5 text-sm font-semibold text-white active:bg-white/20"
            onClick={paused ? onResume : onPause}
          >
            {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            {paused ? 'Resume' : 'Pause'}
          </button>
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

function NextSetCard({
  meta,
  currentSet,
  sameExercise,
  go
}: {
  meta: SessionExerciseMeta;
  currentSet: number;
  sameExercise: boolean;
  go: boolean;
}) {
  const setBased = hasSets(meta);
  const total = totalSets(meta);
  const nextReps = repsForSet(meta.reps, currentSet);
  const descending = repSchemeParts(meta.reps).length > 1;

  return (
    <div className="mx-auto w-full max-w-sm shrink-0 rounded-2xl bg-white/5 p-4">
      <p className={clsx('text-xs font-semibold uppercase tracking-wide', go ? 'text-white/70' : 'text-white/50')}>
        {sameExercise ? 'Next set' : 'Up next'}
      </p>
      <p className="mt-1 text-2xl font-semibold text-white">{meta.name}</p>
      {setBased && (
        <p className="mt-2 text-3xl font-bold tabular-nums text-white">
          Set {currentSet} of {total}
        </p>
      )}
      {descending ? (
        <div className="mt-3">
          <SessionRepScheme reps={meta.reps} currentSet={currentSet} go={go} />
          <p className={clsx('mt-1 text-xs font-medium uppercase tracking-wide', go ? 'text-white/70' : 'text-white/45')}>
            reps
          </p>
        </div>
      ) : setBased && nextReps > 0 ? (
        <p className={clsx('mt-1 text-lg font-medium', go ? 'text-white/85' : 'text-white/70')}>
          {nextReps} reps
          {meta.weight != null ? ` · ${meta.weight} lb` : ''}
        </p>
      ) : (
        <p className={clsx('mt-1 text-base', go ? 'text-white/80' : 'text-white/60')}>{formatPlan(meta)}</p>
      )}
      {descending && meta.weight != null && (
        <p className={clsx('mt-2 text-sm font-medium', go ? 'text-white/80' : 'text-white/55')}>
          {meta.weight} lb
        </p>
      )}
    </div>
  );
}
