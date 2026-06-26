import { useState } from 'react';
import { ClipboardPlus, Sparkles, Trash2 } from 'lucide-react';
import { api } from '../../../services/api';
import type { Meal, MealItem } from '../../../types';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import {
  actualItemsOf,
  formatItemLine,
  plannedItemsOf,
  statusLabel,
  statusTone
} from './weeklyHelpers';

function macroLine(item: Pick<MealItem, 'calories' | 'protein'>) {
  return `${Math.round(Number(item.calories))} kcal · ${Math.round(Number(item.protein))}g P`;
}

export function SelectedMealPanel({
  meal,
  dayLabel,
  future,
  onChange,
  onLogActual,
  onAskAi
}: {
  meal?: Meal;
  dayLabel: string;
  future: boolean;
  onChange: () => void | Promise<void>;
  onLogActual: (mealId: string) => void;
  onAskAi: (mealId: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      await onChange();
    } finally {
      setBusy(false);
    }
  }

  if (!meal) {
    return (
      <div className="rounded-2xl border border-app-border bg-app-surface p-4 shadow-sm">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-app-text-muted">Selected meal</h3>
        <p className="mt-2 text-sm text-app-text-muted">Pick a meal in the grid to compare planned vs actual and make quick edits.</p>
      </div>
    );
  }

  const planned = plannedItemsOf(meal);
  const actuals = actualItemsOf(meal);
  const plannedKcal = Math.round(Number(meal.plannedCalories));
  const actualKcal = Math.round(Number(meal.actualCalories));
  const diff = actualKcal - plannedKcal;
  const hasActual = actuals.length > 0;

  return (
    <div className="rounded-2xl border border-app-border bg-app-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-app-text-muted">{dayLabel}</p>
          <h3 className="truncate text-base font-bold text-app-text">{meal.name}</h3>
        </div>
        <Badge tone={statusTone(meal.status)}>{statusLabel(meal.status)}</Badge>
      </div>

      {/* Planned vs actual comparison */}
      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs text-app-text-muted">Planned</p>
          <p className="text-lg font-bold tabular-nums text-app-text">{plannedKcal} kcal</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-app-text-muted">Actual</p>
          <p className="text-lg font-bold tabular-nums text-app-text">{actualKcal} kcal</p>
        </div>
      </div>
      <p className="mt-1 text-xs text-app-text-muted">
        {!hasActual
          ? 'Nothing logged yet.'
          : diff === 0
          ? 'Eaten on plan.'
          : diff > 0
          ? `+${diff} kcal over plan`
          : `${diff} kcal under plan`}
      </p>

      {/* Two-column planned vs actual */}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-brand-gold/10 p-2.5 ring-1 ring-brand-gold/20">
          <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-app-text-muted">Planned</p>
          <ul className="mt-1.5 space-y-1.5">
            {planned.length === 0 && <li className="text-xs text-app-text-muted">No foods planned</li>}
            {planned.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate text-xs text-app-text">{formatItemLine(item)}</span>
                <button
                  type="button"
                  aria-label={`Remove ${item.nameSnapshot}`}
                  disabled={busy}
                  onClick={() => void run(() => api(`/api/meal-items/${item.id}`, { method: 'DELETE' }))}
                  className="shrink-0 text-app-text-muted transition hover:text-red-500 disabled:opacity-50"
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl bg-brand-green/10 p-2.5 ring-1 ring-brand-green/20">
          <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-app-text-muted">Actual</p>
          <ul className="mt-1.5 space-y-1.5">
            {actuals.length === 0 && <li className="text-xs text-app-text-muted">Nothing logged</li>}
            {actuals.map((item) => (
              <li key={item.id} className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 flex-1 truncate text-xs text-app-text">{formatItemLine(item)}</span>
                <span className="shrink-0 text-[0.7rem] text-app-text-muted">{macroLine(item)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Quick actions */}
      <div className="mt-4 flex flex-wrap gap-2">
        {!future && (
          <Button
            type="button"
            disabled={busy || planned.length === 0}
            onClick={() => void run(() => api(`/api/meals/${meal.id}/mark-eaten-as-planned`, { method: 'POST' }))}
          >
            Mark eaten as planned
          </Button>
        )}
        {!future && (
          <Button type="button" variant="secondary" onClick={() => onLogActual(meal.id)}>
            <ClipboardPlus size={15} className="mr-1 inline" />
            Log actual
          </Button>
        )}
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() => void run(() => api(`/api/meals/${meal.id}/copy-from-previous-day`, { method: 'POST' }))}
        >
          Copy from yesterday
        </Button>
        <Button type="button" variant="secondary" onClick={() => onAskAi(meal.id)}>
          <Sparkles size={15} className="mr-1 inline" />
          AI
        </Button>
      </div>
    </div>
  );
}
