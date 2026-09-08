import { Link, useNavigate } from 'react-router-dom';
import { Calendar, Dumbbell, Pencil, Play, Sofa } from 'lucide-react';
import type { Exercise, ExerciseRoutineStatus } from '../../types';
import { todayKey } from '../../services/api';
import { primeAudio } from '../../utils/sessionCues';
import { ExerciseCard } from '../exercise/ExerciseCard';
import { Card } from '../ui/Card';

function EmptyExerciseState({
  routineStatus
}: {
  routineStatus?: ExerciseRoutineStatus;
}) {
  const hasRoutine = routineStatus?.hasRoutine ?? false;
  const isRestDay = routineStatus?.isRestDay ?? false;

  if (hasRoutine && isRestDay) {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-dashed border-brand-green/30 bg-brand-green/5 px-6 py-8 text-center">
        <Sofa className="mb-3 h-10 w-10 text-brand-green/60" aria-hidden />
        <p className="font-semibold text-app-text">Rest day</p>
        <p className="mt-1 text-sm text-app-text-muted">
          Your routine has today scheduled for recovery.
        </p>
        <Link
          to="/exercise/plan"
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-green transition hover:text-brand-green-light"
        >
          <Calendar size={14} />
          View weekly plan
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-app-border bg-app-muted/50 px-6 py-8 text-center">
      <Dumbbell className="mb-3 h-10 w-10 text-app-text-muted/60" aria-hidden />
      <p className="font-semibold text-app-text">No workout scheduled</p>
      <p className="mt-1 max-w-xs text-sm text-app-text-muted">
        {hasRoutine
          ? "Today doesn't have exercises assigned yet."
          : 'Set up your weekly routine to auto-populate workouts.'}
      </p>
      <Link
        to={hasRoutine ? '/exercise' : '/exercise/manage'}
        className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand-navy px-4 py-2 text-sm font-semibold text-brand-off-white transition hover:bg-brand-navy/90 dark:bg-brand-green dark:text-brand-navy dark:hover:bg-brand-green-light"
      >
        <Dumbbell size={14} />
        {hasRoutine ? 'Add exercises' : 'Set up routine'}
      </Link>
    </div>
  );
}

export function TodayExercise({
  exercises,
  routineStatus,
  onChange
}: {
  exercises: Exercise[];
  routineStatus?: ExerciseRoutineStatus;
  onChange: () => void | Promise<void>;
}) {
  const navigate = useNavigate();
  const selectedDate = todayKey();
  const todo = exercises.filter((item) => item.status === 'PLANNED');
  const done = exercises.filter((item) => item.status === 'DONE');
  const skipped = exercises.filter((item) => item.status === 'SKIPPED');
  const otherCompleted = exercises.filter(
    (item) => item.status !== 'PLANNED' && item.status !== 'DONE' && item.status !== 'SKIPPED'
  );

  const doneCount = done.length;
  const totalCount = exercises.length;

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-brand-navy dark:text-brand-off-white">Today&apos;s Exercises</h2>
        <div className="flex shrink-0 items-center gap-3">
          {totalCount > 0 && (
            <p className="text-sm font-medium tabular-nums text-app-text-muted">
              {doneCount} of {totalCount} done
            </p>
          )}
          <Link
            to="/exercise"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-app-border text-app-text-muted transition hover:border-brand-green/50 hover:text-brand-green"
            aria-label="Edit exercises"
          >
            <Pencil size={16} />
          </Link>
        </div>
      </div>
      {!exercises.length ? (
        <EmptyExerciseState routineStatus={routineStatus} />
      ) : (
        <div className="space-y-4">
          {todo.length > 0 && (
            <button
              type="button"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-navy py-3 text-sm font-semibold text-brand-off-white transition hover:bg-brand-navy/90 dark:bg-brand-green dark:text-brand-navy dark:hover:bg-brand-green-light"
              onClick={() => {
                primeAudio();
                navigate('/exercise/session');
              }}
            >
              <Play className="h-4 w-4" />
              Start workout
            </button>
          )}
          {todo.length > 0 && (
            <div className="space-y-2">
              {todo.map((item) => (
                <ExerciseCard
                  key={item.id}
                  item={item}
                  selectedDate={selectedDate}
                  onChange={onChange}
                  onEdit={() => navigate('/exercise')}
                />
              ))}
            </div>
          )}
          {(done.length > 0 || otherCompleted.length > 0) && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-app-text-muted">Completed</p>
              {done.map((item) => (
                <ExerciseCard
                  key={item.id}
                  item={item}
                  selectedDate={selectedDate}
                  onChange={onChange}
                  onEdit={() => navigate('/exercise')}
                />
              ))}
              {otherCompleted.map((item) => (
                <ExerciseCard
                  key={item.id}
                  item={item}
                  selectedDate={selectedDate}
                  onChange={onChange}
                  onEdit={() => navigate('/exercise')}
                />
              ))}
            </div>
          )}
          {skipped.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-app-text-muted">Skipped</p>
              {skipped.map((item) => (
                <ExerciseCard
                  key={item.id}
                  item={item}
                  selectedDate={selectedDate}
                  onChange={onChange}
                  onEdit={() => navigate('/exercise')}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
