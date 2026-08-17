import { Check, ChevronRight, Circle, Target } from 'lucide-react';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import type { Exercise, Meal } from '../../../types';
import { openHydrationDrawer } from '../../hydration/hydrationEvents';
import { mealMissionDone, mealMissionLabel, nextUnloggedMeal, workoutDone, workoutLabel } from './deriveMissions';

export function CoachHomeMissions({
  waterDone,
  meals,
  exercises
}: {
  waterDone: boolean;
  meals: Meal[];
  exercises: Exercise[];
}) {
  const mealDone = mealMissionDone(meals);
  const nextMeal = nextUnloggedMeal(meals);
  const rows = [
    {
      key: 'water',
      label: "Hit today's water goal",
      done: waterDone,
      to: undefined as string | undefined,
      onWater: true
    },
    {
      key: 'meal',
      label: mealMissionLabel(meals),
      done: mealDone,
      to: nextMeal ? `/nutrition?meal=${encodeURIComponent(nextMeal.id)}` : '/nutrition',
      onWater: false
    },
    {
      key: 'workout',
      label: workoutLabel(exercises),
      done: workoutDone(exercises),
      to: '/exercise',
      onWater: false
    }
  ];

  return (
    <section className="rounded-3xl border border-brand-gold/25 bg-brand-gold/10 p-4 shadow-sm">
      <div className="mb-3 flex items-start gap-2">
        <Target size={20} className="mt-0.5 shrink-0 text-brand-gold" aria-hidden />
        <div>
          <h2 className="text-lg font-bold text-app-text">Today&apos;s Mission</h2>
          <p className="text-xs text-app-text-muted">Execute the basics. Build the results.</p>
        </div>
      </div>
      <ul className="divide-y divide-app-border/70">
        {rows.map((row) => {
          const content = (
            <>
              {row.done ? (
                <Check size={18} className="shrink-0 text-brand-green" aria-hidden />
              ) : (
                <Circle size={18} className="shrink-0 text-app-text-muted" aria-hidden />
              )}
              <span
                className={clsx(
                  'min-w-0 flex-1 text-sm font-medium',
                  row.done ? 'text-app-text-muted line-through decoration-app-border' : 'text-app-text'
                )}
              >
                {row.label}
              </span>
              <ChevronRight size={16} className="shrink-0 text-app-text-muted" aria-hidden />
            </>
          );

          if (row.onWater) {
            return (
              <li key={row.key}>
                <button
                  type="button"
                  onClick={() => {
                    openHydrationDrawer();
                  }}
                  className="flex w-full items-center gap-3 py-3 text-left"
                >
                  {content}
                </button>
              </li>
            );
          }

          return (
            <li key={row.key}>
              <Link to={row.to ?? '/'} className="flex items-center gap-3 py-3">
                {content}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
