import { useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import type { Meal } from '../../types';
import { api } from '../../services/api';
import { Drawer } from '../ui/Drawer';

function formatPlannedTime(plannedTime?: string | null) {
  if (!plannedTime) return null;
  const match = plannedTime.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return plannedTime;
  const [, hour, minute] = match;
  return new Date(2000, 0, 1, Number(hour), Number(minute))
    .toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    .replace(' AM', 'am')
    .replace(' PM', 'pm');
}

function mealSummary(meal: Meal) {
  const plannedItems = meal.items.filter((item) => item.type === 'PLANNED').length;
  const actualItems = meal.items.filter((item) => item.type === 'ACTUAL').length;
  const parts = [`${Math.round(Number(meal.plannedCalories))} kcal planned`];
  if (plannedItems > 0) parts.push(`${plannedItems} planned item${plannedItems === 1 ? '' : 's'}`);
  if (actualItems > 0) parts.push(`${actualItems} logged`);
  return parts.join(' · ');
}

export function MealSwapDrawer({
  open,
  sourceMeal,
  otherMeals,
  onClose,
  onSaved
}: {
  open: boolean;
  sourceMeal: Meal | null;
  otherMeals: Meal[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function swapWith(otherMeal: Meal) {
    if (!sourceMeal) return;
    setSavingId(otherMeal.id);
    setError(null);
    try {
      await api(`/api/meals/${sourceMeal.id}/swap`, {
        method: 'POST',
        body: JSON.stringify({ otherMealId: otherMeal.id })
      });
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not swap meals.');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <Drawer
      open={open}
      title={sourceMeal ? `Swap ${sourceMeal.name}` : 'Swap meal'}
      onClose={onClose}
    >
      <div className="space-y-4">
        <p className="text-sm text-app-text-muted">
          Exchange this meal&apos;s plan and logged foods with another meal on the same day. Meal times and names swap too.
        </p>

        {otherMeals.length === 0 ? (
          <p className="rounded-2xl bg-app-muted px-4 py-3 text-sm text-app-text-muted">
            No other meals on this day to swap with.
          </p>
        ) : (
          <ul className="space-y-2">
            {otherMeals.map((meal) => {
              const plannedTime = formatPlannedTime(meal.plannedTime);
              const swapping = savingId === meal.id;
              return (
                <li key={meal.id}>
                  <button
                    type="button"
                    disabled={Boolean(savingId)}
                    onClick={() => void swapWith(meal)}
                    className="flex w-full items-center gap-3 rounded-2xl border-2 border-app-border bg-app-surface px-4 py-3 text-left transition hover:border-brand-green-light disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-green/10 text-brand-green">
                      <ArrowLeftRight size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-app-text">
                        {plannedTime ? `${meal.name} — ${plannedTime}` : meal.name}
                      </span>
                      <span className="mt-0.5 block text-xs text-app-text-muted">{mealSummary(meal)}</span>
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-brand-green">
                      {swapping ? 'Swapping…' : 'Swap'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {error && <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      </div>
    </Drawer>
  );
}
