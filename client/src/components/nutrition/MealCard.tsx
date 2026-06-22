import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ClipboardPlus } from 'lucide-react';
import type { Meal, MealItem } from '../../types';
import { api, isFuture } from '../../services/api';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { MealLogActions } from '../gamification/MealLogActions';
import { MealCardEditor } from './MealCardEditor';

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

function formatItemLine(item: MealItem) {
  const qty = Number(item.quantity);
  const qtyLabel = qty === 1 ? '' : `${qty} ${item.unit} `;
  return `${qtyLabel}${item.nameSnapshot}`.trim();
}

function formatMacros(item: Pick<MealItem, 'calories' | 'protein' | 'carbs' | 'fat'>) {
  return `${Math.round(Number(item.calories))} kcal · ${Math.round(Number(item.protein))}g P · ${Math.round(Number(item.carbs))}g C · ${Math.round(Number(item.fat))}g F`;
}

function formatMealTotals(calories: number, protein: number, carbs: number, fat: number) {
  return `${Math.round(calories)} kcal · ${Math.round(protein)}g protein · ${Math.round(carbs)}g carbs · ${Math.round(fat)}g fat`;
}

function ActionsDropdown({
  future,
  onLogActual,
  onMarkEaten,
  onCopyFromYesterday,
}: {
  future: boolean;
  onLogActual: () => void;
  onMarkEaten: () => void;
  onCopyFromYesterday: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function action(fn: () => void) {
    setOpen(false);
    fn();
  }

  const items: { label: string; onClick: () => void; danger?: boolean; disabled?: boolean }[] = [
    ...(!future
      ? [
          { label: 'Log actual intake', onClick: () => action(onLogActual) },
          { label: 'Mark as eaten', onClick: () => action(onMarkEaten) },
        ]
      : []),
    { label: 'Copy from yesterday', onClick: () => action(onCopyFromYesterday) },
    { label: 'Ask AI to adjust this meal', onClick: () => action(() => {}), disabled: true },
    { label: 'Swap this meal', onClick: () => action(() => {}) , disabled: true },
    { label: 'Save as template', onClick: () => action(() => {}), disabled: true },
    { label: 'View macro details', onClick: () => action(() => {}) , disabled: true },
    { label: 'Delete meal', onClick: () => action(() => {}), danger: true, disabled: true },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Meal actions"
        aria-expanded={open}
        className="inline-flex h-9 items-center gap-1 rounded-xl px-3 text-sm text-app-text-muted transition hover:bg-app-muted hover:text-app-text"
        onClick={() => setOpen((v) => !v)}
      >
        Actions <ChevronDown size={14} />
      </button>
      {open && (
        <ul className="absolute right-0 z-50 mt-1 min-w-[200px] rounded-xl border border-app-border bg-app-surface py-1 shadow-lg">
          {items.map((item) => (
            <li key={item.label}>
              <button
                type="button"
                disabled={item.disabled}
                className={`w-full px-4 py-2 text-left text-sm transition ${
                  item.disabled
                    ? 'cursor-default text-slate-300'
                    : item.danger
                    ? 'text-red-600 hover:bg-red-50'
                    : 'text-app-text hover:bg-app-muted'
                }`}
                onClick={item.onClick}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MealCard({
  meal,
  selectedDate,
  onChange,
  isEditing,
  onEnterEditMode,
  onExitEditMode,
  onLogActual,
}: {
  meal: Meal;
  selectedDate: string;
  onChange: () => void | Promise<void>;
  isEditing: boolean;
  onEnterEditMode: (mealId: string) => void;
  onExitEditMode: () => void;
  onLogActual: (mealId: string) => void;
}) {
  const future = isFuture(selectedDate);
  const plannedItems = (meal.items ?? []).filter((item) => item.type === 'PLANNED');
  const actualItems = (meal.items ?? []).filter((item) => item.type === 'ACTUAL');
  const [pendingLogged, setPendingLogged] = useState<Record<string, boolean>>({});
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const plannedTime = formatPlannedTime(meal.plannedTime);

  function isPlannedItemLogged(plannedItem: MealItem) {
    return actualItems.some(
      (item) =>
        item.linkedPlannedItemId === plannedItem.id ||
        (!item.linkedPlannedItemId &&
          item.nameSnapshot === plannedItem.nameSnapshot &&
          Number(item.quantity) === Number(plannedItem.quantity) &&
          (item.foodId ?? null) === (plannedItem.foodId ?? null))
    );
  }

  function isItemLogged(plannedItem: MealItem) {
    if (plannedItem.id in pendingLogged) return pendingLogged[plannedItem.id];
    return isPlannedItemLogged(plannedItem);
  }

  async function togglePlannedItem(plannedItemId: string, logged: boolean) {
    setToggleError(null);
    setTogglingId(plannedItemId);
    setPendingLogged((prev) => ({ ...prev, [plannedItemId]: logged }));
    try {
      await api(`/api/meal-items/${plannedItemId}/set-logged`, { method: 'POST', body: JSON.stringify({ logged }) });
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

  async function markPlannedAsEaten() {
    setToggleError(null);
    setPendingLogged(Object.fromEntries(plannedItems.map((item) => [item.id, true])));
    try {
      await api(`/api/meals/${meal.id}/mark-eaten-as-planned`, { method: 'POST' });
      setPendingLogged({});
      await onChange();
    } catch (error) {
      setPendingLogged({});
      setToggleError(error instanceof Error ? error.message : 'Could not mark planned as eaten.');
    }
  }

  async function copyFromYesterday() {
    await api(`/api/meals/${meal.id}/copy-from-previous-day`, { method: 'POST' });
    await onChange();
  }

  const [editorKey, setEditorKey] = useState(0);

  async function refreshAfterSaveFailure() {
    await onChange();
    setEditorKey((key) => key + 1);
  }

  return (
    <Card>
      {isEditing ? (
        <MealCardEditor
          key={editorKey}
          meal={meal}
          onSaved={() => {
            onExitEditMode();
            void onChange();
          }}
          onCancel={onExitEditMode}
          onRefresh={refreshAfterSaveFailure}
        />
      ) : (
        <>
          {/* Normal mode header */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-app-text-muted">Meal {meal.mealNumber}</p>
              <h3 className="text-lg font-bold">
                {plannedTime ? `${meal.name} — ${plannedTime}` : meal.name}
              </h3>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-1">
              <button
                type="button"
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100"
                onClick={() => onEnterEditMode(meal.id)}
              >
                Edit plan
              </button>
              {!future && (
                <button
                  type="button"
                  aria-label="Log actual intake"
                  title="Log actual intake"
                  className="grid h-9 w-9 place-items-center rounded-xl text-blue-600 transition hover:bg-blue-50"
                  onClick={() => onLogActual(meal.id)}
                >
                  <ClipboardPlus size={18} />
                </button>
              )}
              <ActionsDropdown
                future={future}
                onLogActual={() => onLogActual(meal.id)}
                onMarkEaten={() => void markPlannedAsEaten()}
                onCopyFromYesterday={() => void copyFromYesterday()}
              />
              <Badge tone={meal.status.includes('EATEN') || meal.status === 'MODIFIED' ? 'green' : 'slate'}>
                {meal.status.replaceAll('_', ' ')}
              </Badge>
            </div>
          </div>

          {toggleError && <p className="mt-2 text-sm text-red-600">{toggleError}</p>}

          {/* Planned + Actual panels */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-yellow-50 p-3">
              <p className="font-semibold">Planned</p>
              {plannedItems.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {plannedItems.map((item) => {
                    const logged = isItemLogged(item);
                    return (
                      <li key={item.id} className="flex items-start gap-2 text-sm text-slate-700">
                        {!future && (
                          <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300"
                            checked={logged}
                            disabled={togglingId === item.id}
                            onChange={(event) => void togglePlannedItem(item.id, event.target.checked)}
                            aria-label={`Log ${item.nameSnapshot} as eaten`}
                          />
                        )}
                        <div className={`flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 ${logged ? 'text-slate-500 line-through' : ''}`}>
                          <span className="min-w-0">{formatItemLine(item)}</span>
                          <span className="shrink-0 text-slate-500">{formatMacros(item)}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-slate-500">No foods planned</p>
              )}
              <p className="mt-2 border-t border-yellow-100 pt-2 text-sm font-medium">
                {formatMealTotals(meal.plannedCalories, meal.plannedProtein, meal.plannedCarbs, meal.plannedFat)}
              </p>
            </div>
            <div className="rounded-2xl bg-blue-50 p-3">
              <p className="font-semibold">Actual</p>
              {actualItems.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {actualItems.map((item) => (
                    <li key={item.id} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm text-slate-700">
                      <span className="min-w-0">{formatItemLine(item)}</span>
                      <span className="shrink-0 text-slate-500">{formatMacros(item)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-slate-500">Nothing logged yet</p>
              )}
              <p className="mt-2 border-t border-blue-100 pt-2 text-sm font-medium">
                {formatMealTotals(meal.actualCalories, meal.actualProtein, meal.actualCarbs, meal.actualFat)}
              </p>
            </div>
          </div>

          {!future && plannedItems.length > 0 && (
            <MealLogActions mealId={meal.id} disabled={future} onLogged={() => void onChange()} />
          )}
        </>
      )}
    </Card>
  );
}
