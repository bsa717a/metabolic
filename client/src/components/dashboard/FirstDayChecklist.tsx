import { useState } from 'react';
import { Check, ChevronRight, Circle, Sparkles, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import type { AppUser, Dashboard } from '../../types';
import { api } from '../../services/api';

type ChecklistItem = {
  key: string;
  label: string;
  done: boolean;
  to: string;
};

function deriveChecklistItems(data: Dashboard, user: AppUser | null | undefined): ChecklistItem[] {
  const hasLoggedMeal = (data.meals ?? []).some(
    (meal) => meal.status === 'EATEN_AS_PLANNED' || meal.status === 'MODIFIED' || meal.status === 'UNPLANNED'
  );

  const hasLoggedWeight = Boolean(data.weightTrend && data.weightTrend.length > 0);

  const todayExercises = data.exercises ?? [];
  const hasExercisePlanToday = todayExercises.length > 0;

  const hasVirtualCoach = Boolean(user?.selectedVirtualCoachId);

  return [
    {
      key: 'meal',
      label: 'Log your first meal',
      done: hasLoggedMeal,
      to: '/nutrition'
    },
    {
      key: 'weight',
      label: 'Record your current weight',
      done: hasLoggedWeight,
      to: '/progress'
    },
    ...(hasExercisePlanToday
      ? [
          {
            key: 'exercise',
            label: 'Check your exercise plan',
            done: true,
            to: '/exercise'
          }
        ]
      : []),
    ...(hasVirtualCoach
      ? [
          {
            key: 'coach',
            label: 'Say hi to your virtual coach',
            done: Boolean(user?.coachWelcomeCompletedAt),
            to: '/virtual-coach'
          }
        ]
      : [])
  ];
}

export const FIRST_DAY_CHECKLIST_DISMISSED_KEY_PREFIX = 'metabolic-first-day-checklist-dismissed:';

export function firstDayChecklistDismissedStorageKey(userId: string) {
  return `${FIRST_DAY_CHECKLIST_DISMISSED_KEY_PREFIX}${userId}`;
}

export function isFirstDayChecklistDismissedLocally(userId: string | undefined) {
  if (!userId) return false;
  try {
    return localStorage.getItem(firstDayChecklistDismissedStorageKey(userId)) === '1';
  } catch {
    return false;
  }
}

export function persistFirstDayChecklistDismissedLocally(userId: string | undefined) {
  if (!userId) return;
  try {
    localStorage.setItem(firstDayChecklistDismissedStorageKey(userId), '1');
  } catch {
    // Ignore storage failures in private browsing or restricted contexts.
  }
}

export function FirstDayChecklist({
  user,
  data,
  onDismiss
}: {
  user: AppUser | null | undefined;
  data: Dashboard;
  onDismiss: (updatedUser?: AppUser) => void;
}) {
  const [dismissing, setDismissing] = useState(false);

  const items = deriveChecklistItems(data, user);
  const completedCount = items.filter((item) => item.done).length;
  const allDone = completedCount === items.length;

  async function handleDismiss() {
    if (dismissing) return;
    setDismissing(true);
    persistFirstDayChecklistDismissedLocally(user?.id);
    const optimisticUser = user
      ? { ...user, firstDayChecklistDismissedAt: new Date().toISOString() }
      : undefined;
    onDismiss(optimisticUser);
    try {
      const response = await api<{ user: AppUser }>('/api/tutorial/first-day-checklist/dismiss', {
        method: 'POST'
      });
      if (response.user) onDismiss(response.user);
    } catch {
      // Card is already hidden locally even if the server request fails.
    }
  }

  return (
    <section className="rounded-3xl border border-brand-green/25 bg-brand-green/5 p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <Sparkles size={20} className="mt-0.5 shrink-0 text-brand-green" aria-hidden />
          <div>
            <h2 className="text-lg font-bold text-app-text">Get Started</h2>
            <p className="text-xs text-app-text-muted">
              {allDone
                ? "Great job! You're all set."
                : 'Complete these tasks to get the most out of Metabolic.'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void handleDismiss();
          }}
          disabled={dismissing}
          className="relative z-10 -m-1 rounded-full p-2.5 text-app-text-muted transition hover:bg-app-muted hover:text-app-text disabled:opacity-50"
          aria-label="Dismiss checklist"
        >
          <X size={18} aria-hidden />
        </button>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-app-muted">
          <div
            className="h-full rounded-full bg-brand-green transition-all duration-300"
            style={{ width: `${(completedCount / items.length) * 100}%` }}
          />
        </div>
        <span className="text-xs font-semibold tabular-nums text-app-text-muted">
          {completedCount}/{items.length}
        </span>
      </div>

      <ul className="divide-y divide-app-border/70">
        {items.map((item) => (
          <li key={item.key}>
            <Link to={item.to} className="flex items-center gap-3 py-3">
              {item.done ? (
                <Check size={18} className="shrink-0 text-brand-green" aria-hidden />
              ) : (
                <Circle size={18} className="shrink-0 text-app-text-muted" aria-hidden />
              )}
              <span
                className={clsx(
                  'min-w-0 flex-1 text-sm font-medium',
                  item.done ? 'text-app-text-muted line-through decoration-app-border' : 'text-app-text'
                )}
              >
                {item.label}
              </span>
              <ChevronRight size={16} className="shrink-0 text-app-text-muted" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>

      {allDone && (
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void handleDismiss();
          }}
          disabled={dismissing}
          className="mt-3 w-full rounded-full bg-brand-green px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-green-light disabled:opacity-50"
        >
          {dismissing ? 'Saving…' : 'Done — Hide Checklist'}
        </button>
      )}
    </section>
  );
}
