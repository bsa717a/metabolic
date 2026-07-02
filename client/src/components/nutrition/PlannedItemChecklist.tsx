import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { Meal, MealItem } from '../../types';
import { api } from '../../services/api';
import { foodEmoji } from '../../utils/foodEmoji';

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
  const qtyLabel = qty === 1 ? '' : `${qty} ${item.unit} `;
  return `${qtyLabel}${item.nameSnapshot}`.trim();
}

function formatMacros(item: Pick<MealItem, 'calories' | 'protein' | 'carbs' | 'fat'>) {
  return `${Math.round(Number(item.calories))} kcal · ${Math.round(Number(item.protein))}g P`;
}

export function PlannedItemChecklist({
  meal,
  onChange,
  allowLogging = true
}: {
  meal: Meal;
  onChange: () => void | Promise<void>;
  allowLogging?: boolean;
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

  async function togglePlannedItem(plannedItemId: string, logged: boolean) {
    setToggleError(null);
    setTogglingId(plannedItemId);
    setPendingLogged((prev) => ({ ...prev, [plannedItemId]: logged }));
    try {
      await api(`/api/meal-items/${plannedItemId}/set-logged`, {
        method: 'POST',
        body: JSON.stringify({ logged })
      });
      setPendingLogged((prev) => {
        const next = { ...prev };
        delete next[plannedItemId];
        return next;
      });
      await onChange();
    } catch (error) {
      setPendingLogged((prev) => {
        const next = { ...prev };
        delete next[plannedItemId];
        return next;
      });
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
    <div className="border-t border-app-border px-3 pb-3 pt-2">
      {toggleError && <p className="mb-2 text-sm text-red-600">{toggleError}</p>}
      <ul className="space-y-2">
        {plannedItems.map((item) => {
          const logged = isItemLogged(item);
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
        {extraActualItems.map((item) => (
          <li
            key={item.id}
            className="flex items-start gap-2 rounded-xl bg-brand-gold/15 px-2 py-1.5 text-sm text-app-text ring-1 ring-brand-gold/20"
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
            <span className="w-5 shrink-0 text-center" aria-hidden>
              {foodEmoji(item.nameSnapshot)}
            </span>
            <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span className="min-w-0 font-medium">{formatItemLine(item)}</span>
              <span className="shrink-0 text-app-text-muted">{formatMacros(item)}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
