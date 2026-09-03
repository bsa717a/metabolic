import { Minus, Pause, Play, Plus, SkipForward } from 'lucide-react';
import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { ExerciseHowToVideoButton } from '../ExerciseHowToVideoButton';
import { formatPlan } from '../../../utils/exerciseFormat';
import { type DurationUnit, formatDuration, secondsToInput } from '../../../utils/duration';
import { repsForSet, repSchemeParts } from '../../../utils/repSchemes';
import { SessionRepScheme } from './SessionRepScheme';
import type { PerExerciseState, SessionExerciseMeta } from '../../../utils/workoutSession';
import { hasSets, isDurationBased, totalSets } from '../../../utils/workoutSession';
import { DurationField } from '../DurationField';
import { timerCueKind } from './format';
import { SessionTimerClock } from './SessionTimerCue';

function Stepper({
  label,
  value,
  suffix,
  step = 1,
  onChange
}: {
  label: string;
  value: number;
  suffix?: string;
  step?: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-2 rounded-2xl bg-white/5 p-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-white/50">{label}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          className="grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white active:bg-white/20"
          onClick={() => onChange(Math.max(0, value - step))}
        >
          <Minus className="h-5 w-5" />
        </button>
        <span className="min-w-[3ch] text-center text-2xl font-bold tabular-nums text-white">
          {value}
          {suffix ? <span className="ml-0.5 text-sm font-medium text-white/50">{suffix}</span> : null}
        </span>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          className="grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white active:bg-white/20"
          onClick={() => onChange(value + step)}
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

export function SessionExerciseCard({
  meta,
  currentSet,
  per,
  durationRemainingMs,
  paused,
  onCompleteSet,
  onAdjust,
  onSkip,
  onPause,
  onResume
}: {
  meta: SessionExerciseMeta;
  currentSet: number;
  per: PerExerciseState;
  durationRemainingMs: number | null;
  paused: boolean;
  onCompleteSet: () => void;
  onAdjust: (patch: { reps?: number; weight?: number; durationSeconds?: number | null }) => void;
  onSkip: () => void;
  onPause: () => void;
  onResume: () => void;
}) {
  const setBased = hasSets(meta);
  const durationBased = isDurationBased(meta);
  const total = totalSets(meta);

  const plannedReps = repsForSet(meta.reps, currentSet);
  const reps = per.actualReps ?? plannedReps;
  const weight = per.actualWeight ?? meta.weight ?? 0;
  const durationTotalMs = (meta.durationSeconds ?? 0) * 1000;
  const durationElapsedFrac =
    durationRemainingMs != null && durationTotalMs > 0
      ? Math.min(1, Math.max(0, 1 - durationRemainingMs / durationTotalMs))
      : 0;

  const actualOrPlannedSeconds = per.actualDurationSeconds ?? meta.durationSeconds ?? null;
  const initialDuration = secondsToInput(actualOrPlannedSeconds);
  const [durationValue, setDurationValue] = useState(initialDuration.value);
  const [durationUnit, setDurationUnit] = useState<DurationUnit>(initialDuration.unit);

  useEffect(() => {
    const next = secondsToInput(per.actualDurationSeconds ?? meta.durationSeconds ?? null);
    setDurationValue(next.value);
    setDurationUnit(next.unit);
  }, [meta.id, meta.durationSeconds, per.actualDurationSeconds]);

  const completeLabel = durationBased
    ? 'Done'
    : setBased
      ? currentSet >= total
        ? 'Complete exercise'
        : 'Complete set'
      : 'Mark complete';
  const durationCue = durationBased
    ? timerCueKind(durationRemainingMs ?? durationTotalMs, paused)
    : 'idle';

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex shrink-0 items-start justify-between gap-3">
        <div className="min-w-0">
          {meta.bodyPart && (
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-300">{meta.bodyPart}</p>
          )}
          <h2 className="mt-1 text-4xl font-bold leading-tight text-white sm:text-5xl">{meta.name}</h2>
          <p className="mt-2 text-lg font-medium text-white/70">
            {setBased
              ? [
                  `Set ${currentSet} of ${total}`,
                  repSchemeParts(meta.reps).length <= 1 && plannedReps > 0 ? `${plannedReps} reps` : null,
                  meta.weight != null ? `${meta.weight} lb` : null
                ]
                  .filter(Boolean)
                  .join(' · ')
              : formatPlan(meta)}
          </p>
          {setBased && (
            <div className="mt-3">
              <SessionRepScheme reps={meta.reps} currentSet={currentSet} align="start" />
            </div>
          )}
        </div>
        {meta.howToVideoUrl && (
          <div className="shrink-0 rounded-xl bg-white/10">
            <ExerciseHowToVideoButton name={meta.name} videoUrl={meta.howToVideoUrl} variant="primary" />
          </div>
        )}
      </div>

      {meta.description && (
        <p className="shrink-0 rounded-2xl bg-white/5 p-3 text-sm leading-relaxed text-white/70">
          {meta.description}
        </p>
      )}

      {durationBased ? (
        <div className="flex shrink-0 flex-col items-center gap-3">
          <SessionTimerClock
            remainingMs={durationRemainingMs ?? durationTotalMs}
            paused={paused}
            goLabel="Time"
            size="duration"
          />
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-emerald-400 transition-all"
              style={{ width: `${durationElapsedFrac * 100}%` }}
            />
          </div>
          <button
            type="button"
            className="flex items-center gap-2 rounded-full bg-white/10 px-5 py-2.5 text-sm font-semibold text-white active:bg-white/20"
            onClick={paused ? onResume : onPause}
          >
            {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            {paused ? 'Resume' : 'Pause'}
          </button>
          <DurationField
            label="Actual duration"
            tone="dark"
            valueSeconds={actualOrPlannedSeconds}
            onChangeSeconds={(seconds) => onAdjust({ durationSeconds: seconds })}
            value={durationValue}
            unit={durationUnit}
            onChangeValue={setDurationValue}
            onChangeUnit={setDurationUnit}
            className="w-full max-w-xs text-sm"
            inputClassName="mt-1 w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-center text-lg font-semibold tabular-nums text-white outline-none"
          />
          {per.actualDurationSeconds != null && (
            <p className="text-xs text-white/45">
              Logging {formatDuration(per.actualDurationSeconds) || '—'} when you tap Done
            </p>
          )}
        </div>
      ) : setBased ? (
        <div className="flex shrink-0 gap-3">
          <Stepper label="Reps" value={reps} onChange={(next) => onAdjust({ reps: next })} />
          <Stepper
            label="Weight"
            value={weight}
            suffix="lb"
            step={5}
            onChange={(next) => onAdjust({ weight: next })}
          />
        </div>
      ) : null}

      <button
        type="button"
        className={clsx(
          'relative z-40 flex min-h-[12rem] w-full flex-1 items-center justify-center rounded-3xl px-4 py-8 text-3xl font-bold shadow-lg sm:min-h-[16rem] sm:text-4xl',
          durationCue === 'go'
            ? 'bg-slate-950 text-white active:bg-slate-900'
            : 'bg-emerald-500 text-white active:bg-emerald-600'
        )}
        onClick={onCompleteSet}
      >
        {completeLabel}
      </button>

      <button
        type="button"
        className="flex w-full shrink-0 items-center justify-center gap-2 rounded-2xl bg-white/5 py-3 text-sm font-semibold text-white/70 active:bg-white/10"
        onClick={onSkip}
      >
        <SkipForward className="h-4 w-4" />
        Skip exercise
      </button>
    </div>
  );
}
