import { Check, SkipForward } from 'lucide-react';
import type { SessionSummary as SessionSummaryData } from '../../../utils/workoutSession';
import { formatClock } from './format';

/** End-of-workout recap: elapsed time, done/skipped counts, per-exercise actuals. */
export function SessionSummary({
  summary,
  onDone
}: {
  summary: SessionSummaryData;
  onDone: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-white">Workout complete</h2>
        <p className="mt-1 text-white/60">Nice work.</p>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <Stat value={formatClock(summary.elapsedMs)} label="Time" />
        <Stat value={String(summary.doneCount)} label="Done" />
        <Stat value={String(summary.skippedCount)} label="Skipped" />
      </div>

      <ul className="mt-6 flex-1 space-y-2 overflow-y-auto">
        {summary.perExercise.map(({ meta, state }, index) => {
          const done = state.outcome === 'done';
          const skipped = state.outcome === 'skipped';
          const actual = [
            state.setsDone ? `${state.setsDone} set${state.setsDone === 1 ? '' : 's'}` : null,
            state.actualReps != null ? `${state.actualReps} reps` : null,
            state.actualWeight != null ? `${state.actualWeight} lb` : null
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <li
              key={meta?.id ?? index}
              className="flex items-center gap-3 rounded-2xl bg-white/5 px-4 py-3"
            >
              <span
                className={
                  done
                    ? 'text-emerald-400'
                    : skipped
                      ? 'text-white/40'
                      : 'text-white/30'
                }
              >
                {done ? <Check className="h-5 w-5" /> : <SkipForward className="h-5 w-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-white">{meta?.name ?? 'Exercise'}</p>
                {actual && <p className="text-xs text-white/50">{actual}</p>}
              </div>
              {skipped && <span className="text-xs font-medium text-white/40">Skipped</span>}
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        className="mt-4 w-full rounded-2xl bg-emerald-500 py-4 text-lg font-bold text-white active:bg-emerald-600"
        onClick={onDone}
      >
        Back to Today
      </button>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl bg-white/5 p-4 text-center">
      <p className="text-2xl font-bold tabular-nums text-white">{value}</p>
      <p className="mt-1 text-xs uppercase tracking-wide text-white/50">{label}</p>
    </div>
  );
}
