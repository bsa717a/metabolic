import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { WeeklyReview, WeeklyReviewDay, WeeklyReviewDayKind } from '../../types';
import { api, formatWeekRange } from '../../services/api';

const KIND_STYLE: Record<WeeklyReviewDayKind, { dot: string; label: string }> = {
  on_plan: { dot: 'bg-emerald-500', label: 'On plan' },
  partial: { dot: 'bg-amber-500', label: 'Partial' },
  over: { dot: 'bg-orange-500', label: 'Over target' },
  missed: { dot: 'bg-rose-500', label: 'Missed' },
  today: { dot: 'bg-sky-500', label: 'Today' },
  future: { dot: 'bg-slate-300 dark:bg-slate-600', label: 'Upcoming' },
  no_plan: { dot: 'bg-slate-300 dark:bg-slate-600', label: 'No plan' }
};

function StatTile({ value, label, tone }: { value: string | number; label: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-app-border bg-app-bg/60 px-3 py-3 text-center">
      <p className={`text-2xl font-semibold ${tone ?? 'text-app-text'}`}>{value}</p>
      <p className="mt-0.5 text-xs font-medium text-app-text-muted">{label}</p>
    </div>
  );
}

function MacroBar({
  label,
  planned,
  actual,
  unit
}: {
  label: string;
  planned: number;
  actual: number;
  unit: string;
}) {
  const max = Math.max(planned, actual, 1);
  const plannedPct = Math.round((planned / max) * 100);
  const actualPct = Math.round((actual / max) * 100);
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium text-app-text">{label}</span>
        <span className="text-app-text-muted">
          <span className="font-semibold text-app-text">
            {actual}
            {unit}
          </span>{' '}
          / {planned}
          {unit}
        </span>
      </div>
      <div className="space-y-1">
        <div className="h-2 overflow-hidden rounded-full bg-app-muted">
          <div className="h-full rounded-full bg-brand-green" style={{ width: `${actualPct}%` }} />
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-app-muted/60">
          <div className="h-full rounded-full bg-app-text-muted/40" style={{ width: `${plannedPct}%` }} />
        </div>
      </div>
    </div>
  );
}

function DayCell({ day }: { day: WeeklyReviewDay }) {
  const style = KIND_STYLE[day.kind];
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-app-border bg-app-bg/40 px-1 py-2">
      <span className="text-[11px] font-medium text-app-text-muted">{day.label}</span>
      <span className={`h-2.5 w-2.5 rounded-full ${style.dot}`} aria-label={style.label} />
      <span className="text-[11px] font-semibold text-app-text">
        {day.plannedMeals > 0 ? `${day.onPlanMeals}/${day.plannedMeals}` : '—'}
      </span>
      <span className="text-[10px] text-app-text-muted">{day.actualKcal > 0 ? `${day.actualKcal}` : ''}</span>
    </div>
  );
}

export function WeekStatsReport({ stats }: { stats: WeeklyReview }) {
  const adherence = stats.adherencePct;
  const adherenceTone =
    adherence == null
      ? 'text-app-text-muted'
      : adherence >= 80
        ? 'text-emerald-600 dark:text-emerald-400'
        : adherence >= 50
          ? 'text-amber-600 dark:text-amber-400'
          : 'text-rose-600 dark:text-rose-400';

  const weightDelta =
    stats.weightTrend.length >= 2
      ? Math.round((stats.weightTrend[stats.weightTrend.length - 1].weight - stats.weightTrend[0].weight) * 10) / 10
      : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-app-text-muted">{formatWeekRange(stats.weekStart)}</p>
          <p className="text-sm font-medium text-app-text">Plan adherence</p>
        </div>
        <p className={`text-4xl font-bold ${adherenceTone}`}>{adherence == null ? '—' : `${adherence}%`}</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StatTile value={stats.pastOnPlanMeals} label="On plan" tone="text-emerald-600 dark:text-emerald-400" />
        <StatTile value={stats.modifiedMeals} label="Modified" tone="text-amber-600 dark:text-amber-400" />
        <StatTile value={stats.missedMeals} label="Missed" tone="text-rose-600 dark:text-rose-400" />
      </div>

      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="text-sm font-semibold text-app-text">Calories</h3>
          <span className="text-sm text-app-text-muted">
            <span className="font-semibold text-app-text">{stats.actualKcal.toLocaleString()}</span> /{' '}
            {stats.plannedKcal.toLocaleString()} kcal
          </span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-app-muted">
          <div
            className="h-full rounded-full bg-brand-green"
            style={{ width: `${Math.min(100, Math.round((stats.actualKcal / Math.max(stats.plannedKcal, 1)) * 100))}%` }}
          />
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-app-text">Macros (actual / planned)</h3>
        <MacroBar label="Protein" planned={stats.proteinPlanned} actual={stats.proteinActual} unit="g" />
        <MacroBar label="Carbs" planned={stats.carbsPlanned} actual={stats.carbsActual} unit="g" />
        <MacroBar label="Fat" planned={stats.fatPlanned} actual={stats.fatActual} unit="g" />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-app-text">Day by day</h3>
        <div className="grid grid-cols-7 gap-1.5">
          {stats.days.map((day) => (
            <DayCell key={day.date} day={day} />
          ))}
        </div>
        <p className="mt-2 text-[11px] text-app-text-muted">Meals on plan · daily calories</p>
      </div>

      {stats.topMissedMeals.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-app-text">Most missed</h3>
          <ul className="space-y-1">
            {stats.topMissedMeals.map((meal) => (
              <li key={meal.name} className="flex items-center justify-between text-sm">
                <span className="text-app-text">{meal.name}</span>
                <span className="text-app-text-muted">
                  {meal.count} {meal.count === 1 ? 'time' : 'times'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {stats.offPlanFoods.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-app-text">Off-plan extras</h3>
          <div className="flex flex-wrap gap-1.5">
            {stats.offPlanFoods.map((food) => (
              <span
                key={food.name}
                className="rounded-full border border-app-border bg-app-bg px-2.5 py-1 text-xs text-app-text"
              >
                {food.name}
                {food.count > 1 ? ` ×${food.count}` : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {weightDelta != null && weightDelta !== 0 && (
        <div className="flex items-center justify-between rounded-2xl border border-app-border bg-app-bg/60 px-4 py-3 text-sm">
          <span className="font-medium text-app-text">Weight trend</span>
          <span className={weightDelta > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}>
            {weightDelta > 0 ? '+' : ''}
            {weightDelta} over {stats.weightTrend.length} logged days
          </span>
        </div>
      )}
    </div>
  );
}

export function CoachWeekStatsModal({
  open,
  onClose,
  coachName
}: {
  open: boolean;
  onClose: () => void;
  coachName?: string;
}) {
  const [stats, setStats] = useState<WeeklyReview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError(undefined);
    api<{ stats: WeeklyReview }>('/api/virtual-coach/check-in/week-stats')
      .then((res) => {
        if (active) setStats(res.stats);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Unable to load stats.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-app-border bg-app-surface shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-app-border px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-app-text">Your week in numbers</h2>
            {coachName && <p className="text-xs text-app-text-muted">What {coachName} sees</p>}
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-full p-1.5 text-app-text-muted transition hover:bg-app-muted hover:text-app-text"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {loading && <p className="py-8 text-center text-sm text-app-text-muted">Loading your week…</p>}
          {error && <p className="py-8 text-center text-sm text-rose-600">{error}</p>}
          {!loading && !error && stats && <WeekStatsReport stats={stats} />}
        </div>
      </div>
    </div>
  );
}
