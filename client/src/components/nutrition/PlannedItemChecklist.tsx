import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { Meal, MealItem } from '../../types';
import { api } from '../../services/api';
import { foodEmoji } from '../../utils/foodEmoji';
import { displayPortionMacros, formatPortion } from '../../utils/portionDisplay';

function isPlannedItemLogged(plannedItem: MealItem, actualItems: MealItem[]) {
  return actualItems.some(
    (item) =>
      item.linkedPlannedItemId === plannedItem.id ||
      (!item.linkedPlannedItemId &&
        item.nameSnapshot === plannedItem.nameSnapshot &&
        Number(item.quantity) === Number(plannedItem.quantity) &&
        (item.foodId ?? null) === (plannedItem.foodId ?? null))
  );
}

function formatItemLine(item: MealItem) {
  const qty = Number(item.quantity);
  const unit = item.unit?.trim();
  const portion = unit ? `${qty} ${unit}` : `${qty}`;
  return `${portion} ${item.nameSnapshot}`.trim();
}

function formatMacros(item: Pick<MealItem, 'calories' | 'protein' | 'carbs' | 'fat'>) {
  return `${Math.round(Number(item.calories))} kcal · ${Math.round(Number(item.protein))}g P`;
}

export function PlannedItemChecklist({
  meal,
  onChange,
  allowLogging = true,
  reading = false
}: {
  meal: Meal;
  onChange: () => void | Promise<void>;
  allowLogging?: boolean;
  /** Nutrition page: larger lines, portion under the name, kcal in its own column. */
  reading?: boolean;
}) {
  const plannedItems = (meal.items ?? []).filter((item) => item.type === 'PLANNED');
  const actualItems = (meal.items ?? []).filter((item) => item.type === 'ACTUAL');
  const [pendingLogged, setPendingLogged] = useState<Record<string, boolean>>({});
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const extraActualItems = actualItems.filter((item) => !item.linkedPlannedItemId);

  function isItemLogged(plannedItem: MealItem) {
    if (plannedItem.id in pendingLogged) return pendingLogged[plannedItem.id];
    return isPlannedItemLogged(plannedItem, actualItems);
  }

  function clearPending(plannedItemId: string) {
    setPendingLogged((prev) => {
      const next = { ...prev };
      delete next[plannedItemId];
      return next;
    });
  }

  async function togglePlannedItem(plannedItemId: string, logged: boolean) {
    setToggleError(null);
    setTogglingId(plannedItemId);
    // Optimistically reflect the toggle and hold it until the refreshed data agrees —
    // clearing it before onChange() briefly re-reads the stale prop and flickers the box.
    setPendingLogged((prev) => ({ ...prev, [plannedItemId]: logged }));
    try {
      await api(`/api/meal-items/${plannedItemId}/set-logged`, {
        method: 'POST',
        body: JSON.stringify({ logged })
      });
      await onChange();
      clearPending(plannedItemId);
    } catch (error) {
      clearPending(plannedItemId);
      setToggleError(error instanceof Error ? error.message : 'Could not update this item.');
    } finally {
      setTogglingId(null);
    }
  }

  async function deleteActualItem(itemId: string) {
    setToggleError(null);
    setDeletingId(itemId);
    try {
      await api(`/api/meal-items/${itemId}`, { method: 'DELETE' });
      await onChange();
    } catch (error) {
      setToggleError(error instanceof Error ? error.message : 'Could not delete this food.');
    } finally {
      setDeletingId(null);
    }
  }

  if (!plannedItems.length && !extraActualItems.length) {
    return <p className="px-3 pb-3 text-sm text-slate-500">No foods planned for this meal.</p>;
  }

  return (
    <div className={reading ? 'border-t border-app-border px-3 pb-1 pt-3' : 'border-t border-app-border px-3 pb-3 pt-2'}>
      {toggleError && <p className="mb-2 text-sm text-red-600">{toggleError}</p>}
      <ul className={reading ? 'space-y-5' : 'space-y-2'}>
        {plannedItems.map((item) => {
          const logged = isItemLogged(item);
          if (reading) {
            const shown = displayPortionMacros({
              quantity: Number(item.quantity),
              unit: item.unit,
              name: item.nameSnapshot,
              calories: Number(item.calories),
              protein: Number(item.protein),
              carbs: Number(item.carbs),
              fat: Number(item.fat)
            });
            return (
              <li key={item.id} className="flex items-start gap-3 text-app-text">
                {allowLogging && (
                  <input
                    type="checkbox"
                    className="mt-1 h-5 w-5 shrink-0 cursor-pointer rounded border-app-border"
                    checked={logged}
                    disabled={togglingId === item.id}
                    onChange={(event) => void togglePlannedItem(item.id, event.target.checked)}
                    aria-label={`Log ${item.nameSnapshot} as eaten`}
                  />
                )}
                <span className="mt-0.5 w-6 shrink-0 text-center text-lg leading-6" aria-hidden>
                  {foodEmoji(item.nameSnapshot)}
                </span>
                <div className={`flex min-w-0 flex-1 items-start justify-between gap-6 ${logged ? 'text-app-text-muted line-through' : ''}`}>
                  <div className="min-w-0">
                    <p className="text-lg font-semibold leading-7">{item.nameSnapshot}</p>
                    <p className="mt-1 text-base leading-6 text-app-text-muted">{formatPortion(shown.quantity, item.unit, item.nameSnapshot)}</p>
                  </div>
                  <p className="shrink-0 pt-1 text-right leading-7">
                    <span className="text-lg font-semibold tabular-nums text-app-text">{Math.round(shown.calories)}</span>
                    <span className="text-sm font-medium text-app-text-muted"> kcal</span>
                  </p>
                </div>
              </li>
            );
          }
          return (
            <li key={item.id} className="flex items-start gap-2 text-sm text-app-text">
              {allowLogging && (
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-app-border"
                  checked={logged}
                  disabled={togglingId === item.id}
                  onChange={(event) => void togglePlannedItem(item.id, event.target.checked)}
                  aria-label={`Log ${item.nameSnapshot} as eaten`}
                />
              )}
              <span className="w-5 shrink-0 text-center" aria-hidden>
                {foodEmoji(item.nameSnapshot)}
              </span>
              <div className={`flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 ${logged ? 'text-app-text-muted line-through' : ''}`}>
                <span className="min-w-0">{formatItemLine(item)}</span>
                <span className="shrink-0 text-app-text-muted">{formatMacros(item)}</span>
              </div>
            </li>
          );
        })}
        {extraActualItems.map((item) => {
          const shown = displayPortionMacros({
            quantity: Number(item.quantity),
            unit: item.unit,
            name: item.nameSnapshot,
            calories: Number(item.calories),
            protein: Number(item.protein),
            carbs: Number(item.carbs),
            fat: Number(item.fat)
          });
          return (
          <li
            key={item.id}
            className={`flex items-start rounded-xl bg-brand-gold/15 text-app-text ring-1 ring-brand-gold/20 ${reading ? 'gap-3 px-2 py-3' : 'gap-2 px-2 py-1.5 text-sm'}`}
          >
            <button
              type="button"
              className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded text-app-text-muted transition hover:bg-red-500/10 hover:text-red-500 disabled:opacity-50"
              disabled={deletingId === item.id}
              aria-label={`Delete ${item.nameSnapshot}`}
              onClick={() => void deleteActualItem(item.id)}
            >
              <Trash2 size={14} />
            </button>
            <span className={`shrink-0 text-center ${reading ? 'mt-0.5 w-6 text-lg leading-6' : 'w-5'}`} aria-hidden>
              {foodEmoji(item.nameSnapshot)}
            </span>
            {reading ? (
              <div className="flex min-w-0 flex-1 items-start justify-between gap-6">
                <div className="min-w-0">
                  <p className="text-lg font-semibold leading-7">{item.nameSnapshot}</p>
                  <p className="mt-1 text-base leading-6 text-app-text-muted">{formatPortion(shown.quantity, item.unit, item.nameSnapshot)}</p>
                </div>
                <p className="shrink-0 pt-1 text-right leading-7">
                  <span className="text-lg font-semibold tabular-nums">{Math.round(shown.calories)}</span>
                  <span className="text-sm font-medium text-app-text-muted"> kcal</span>
                </p>
              </div>
            ) : (
              <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <span className="min-w-0 font-medium">{formatItemLine(item)}</span>
                <span className="shrink-0 text-app-text-muted">{formatMacros(item)}</span>
              </div>
            )}
          </li>
          );
        })}
      </ul>
    </div>
  );
}
