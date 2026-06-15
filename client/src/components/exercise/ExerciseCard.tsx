import type { ReactNode } from 'react';
import { Check, Pencil, SkipForward } from 'lucide-react';
import type { ScheduledExercise } from '../../types';
import { api, isFuture } from '../../services/api';
import { Badge } from '../ui/Badge';
import { ExerciseHowToVideoButton } from './ExerciseHowToVideoButton';

function formatPlan(item: ScheduledExercise) {
  if (item.sets != null) {
    const weight = item.weight != null ? ` @ ${item.weight} lbs` : '';
    return `${item.sets} sets × ${item.reps ?? '—'} reps${weight}`;
  }
  if (item.durationMinutes != null) return `${item.durationMinutes} min`;
  if (item.weight != null) return `${item.weight} lbs`;
  return 'No prescription set';
}

function ExerciseTitle({
  name,
  bodyPart,
  completed = false
}: {
  name: string;
  bodyPart?: string | null;
  completed?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-2">
      <p className={`font-semibold ${completed ? 'text-slate-600' : 'text-slate-900'}`}>{name}</p>
      {bodyPart && (
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{bodyPart}</span>
      )}
    </div>
  );
}

function ExerciseActionButton({
  label,
  onClick,
  children,
  variant = 'default'
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  variant?: 'default' | 'primary' | 'muted';
}) {
  const styles = {
    default: 'text-slate-500 hover:bg-slate-100 hover:text-slate-900',
    primary: 'text-emerald-700 hover:bg-emerald-50',
    muted: 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
  };

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`grid h-9 w-9 place-items-center rounded-xl transition ${styles[variant]}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function ExerciseActions({
  canComplete,
  exerciseName,
  howToVideoUrl,
  onEdit,
  onDone,
  onSkip
}: {
  canComplete: boolean;
  exerciseName: string;
  howToVideoUrl?: string | null;
  onEdit: () => void;
  onDone?: () => void;
  onSkip?: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <ExerciseHowToVideoButton name={exerciseName} videoUrl={howToVideoUrl} />
      <ExerciseActionButton label="Edit exercise" onClick={onEdit}>
        <Pencil size={18} />
      </ExerciseActionButton>
      {canComplete && onSkip && (
        <ExerciseActionButton label="Skip exercise" variant="muted" onClick={onSkip}>
          <SkipForward size={18} />
        </ExerciseActionButton>
      )}
      {canComplete && onDone && (
        <ExerciseActionButton label="Mark done" variant="primary" onClick={onDone}>
          <Check size={18} />
        </ExerciseActionButton>
      )}
    </div>
  );
}

export function ExerciseCard({
  item,
  selectedDate,
  onChange,
  onEdit,
  embedded = false
}: {
  item: ScheduledExercise;
  selectedDate: string;
  onChange: () => void | Promise<void>;
  onEdit: () => void;
  embedded?: boolean;
}) {
  const future = isFuture(selectedDate);
  const isPlanned = item.status === 'PLANNED';
  const canComplete = !future && isPlanned;
  const isCompleted = !isPlanned;

  async function markDone() {
    await api(`/api/scheduled-exercises/${item.id}/mark-done`, { method: 'POST' });
    await onChange();
  }

  async function skip() {
    await api(`/api/scheduled-exercises/${item.id}/skip`, { method: 'POST' });
    await onChange();
  }

  if (isCompleted) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4">
              <div className="flex min-w-0 items-center gap-2">
                <span className="text-emerald-600" aria-hidden>
                  ✓
                </span>
                <ExerciseTitle name={item.exercise.name} bodyPart={item.exercise.bodyPart} completed />
                {item.status !== 'DONE' && (
                  <Badge tone={item.status === 'SKIPPED' ? 'slate' : 'yellow'}>{item.status}</Badge>
                )}
              </div>
              <p className="text-sm text-slate-400 sm:min-w-0">{formatPlan(item)}</p>
            </div>
          </div>
          <ExerciseActions
            canComplete={false}
            exerciseName={item.exercise.name}
            howToVideoUrl={item.exercise.howToVideoUrl}
            onEdit={onEdit}
          />
        </div>
      </div>
    );
  }

  const cardContent = (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4">
          <ExerciseTitle name={item.exercise.name} bodyPart={item.exercise.bodyPart} />
          <p className="text-sm text-slate-500 sm:min-w-0">{formatPlan(item)}</p>
        </div>
      </div>
      <ExerciseActions
        canComplete={canComplete}
        exerciseName={item.exercise.name}
        howToVideoUrl={item.exercise.howToVideoUrl}
        onEdit={onEdit}
        onDone={() => void markDone()}
        onSkip={() => void skip()}
      />
    </div>
  );

  if (embedded) return cardContent;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      {cardContent}
    </div>
  );
}
