import { Link, useNavigate } from 'react-router-dom';
import { Pencil, Play } from 'lucide-react';
import type { Exercise } from '../../types';
import { todayKey } from '../../services/api';
import { primeAudio } from '../../utils/sessionCues';
import { ExerciseCard } from '../exercise/ExerciseCard';
import { Card } from '../ui/Card';

export function TodayExercise({
  exercises,
  onChange
}: {
  exercises: Exercise[];
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
        <p className="text-sm text-app-text-muted">No exercises planned today.</p>
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
