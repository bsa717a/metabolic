import type { ReactNode } from 'react';
import { Check, CircleX, Pencil } from 'lucide-react';
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
  completed = false,
  skipped = false
}: {
  name: string;
  bodyPart?: string | null;
  completed?: boolean;
  skipped?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-2">
      <p
        className={`font-semibold ${
          skipped
            ? 'text-red-600 line-through decoration-red-400'
            : completed
              ? 'text-emerald-800'
              : 'text-slate-900'
        }`}
      >
        {name}
      </p>
      {bodyPart && (
        <span
          className={`text-xs font-semibold uppercase tracking-wide ${
            skipped ? 'text-red-400 line-through decoration-red-300' : completed ? 'text-emerald-600' : 'text-slate-400'
          }`}
        >
          {bodyPart}
        </span>
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
  canUnskip,
  exerciseName,
  howToVideoUrl,
  onEdit,
  onDone,
  onSkipToggle
}: {
  canComplete: boolean;
  canUnskip?: boolean;
  exerciseName: string;
  howToVideoUrl?: string | null;
  onEdit: () => void;
  onDone?: () => void;
  onSkipToggle?: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <ExerciseHowToVideoButton name={exerciseName} videoUrl={howToVideoUrl} />
      <ExerciseActionButton label="Edit exercise" onClick={onEdit}>
        <Pencil size={18} />
      </ExerciseActionButton>
      {canComplete && onSkipToggle && (
        <ExerciseActionButton label="Skip exercise" variant="muted" onClick={onSkipToggle}>
          <CircleX size={18} />
        </ExerciseActionButton>
      )}
      {canUnskip && onSkipToggle && (
        <ExerciseActionButton label="Unskip exercise" variant="muted" onClick={onSkipToggle}>
          <CircleX size={18} />
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
  const isSkipped = item.status === 'SKIPPED';
  const isDone = item.status === 'DONE';
  const isCompleted = !isPlanned;
  const canComplete = !future && isPlanned;
  const canUnskip = !future && isSkipped;
  const planText = formatPlan(item);

  async function markDone() {
    await api(`/api/scheduled-exercises/${item.id}/mark-done`, { method: 'POST' });
    await onChange();
  }

  async function toggleSkip() {
    await api(`/api/scheduled-exercises/${item.id}/skip`, { method: 'POST' });
    await onChange();
  }

  if (isCompleted) {
    const completedCard = (
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4">
            <div className="flex min-w-0 items-center gap-2">
              {isDone && (
                <span className="text-emerald-600" aria-hidden>
                  ✓
                </span>
              )}
              {isSkipped && (
                <span className="text-red-500" aria-hidden>
                  /
                </span>
              )}
              <ExerciseTitle
                name={item.exercise.name}
                bodyPart={item.exercise.bodyPart}
                completed={isDone}
                skipped={isSkipped}
              />
              {!isDone && !isSkipped && <Badge tone="yellow">{item.status}</Badge>}
            </div>
            <p
              className={`text-sm sm:min-w-0 ${
                isSkipped
                  ? 'text-red-500 line-through decoration-red-300'
                  : isDone
                    ? 'text-emerald-700'
                    : 'text-slate-400'
              }`}
            >
              {planText}
            </p>
          </div>
        </div>
        <ExerciseActions
          canComplete={false}
          canUnskip={canUnskip}
          exerciseName={item.exercise.name}
          howToVideoUrl={item.exercise.howToVideoUrl}
          onEdit={onEdit}
          onSkipToggle={() => void toggleSkip()}
        />
      </div>
    );

    if (embedded) return completedCard;

    return (
      <div
        className={`rounded-2xl border px-4 py-3 ${
          isSkipped
            ? 'border-red-200 bg-red-50'
            : isDone
              ? 'border-emerald-200 bg-emerald-50'
              : 'border-slate-100 bg-slate-50/80'
        }`}
      >
        {completedCard}
      </div>
    );
  }

  const cardContent = (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4">
          <ExerciseTitle name={item.exercise.name} bodyPart={item.exercise.bodyPart} />
          <p className="text-sm text-slate-500 sm:min-w-0">{planText}</p>
        </div>
      </div>
      <ExerciseActions
        canComplete={canComplete}
        exerciseName={item.exercise.name}
        howToVideoUrl={item.exercise.howToVideoUrl}
        onEdit={onEdit}
        onDone={() => void markDone()}
        onSkipToggle={() => void toggleSkip()}
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
