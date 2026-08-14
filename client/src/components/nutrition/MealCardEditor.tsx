import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, Sparkles, Trash2 } from 'lucide-react';
import { api } from '../../services/api';
import type { Food, Meal, MealItem } from '../../types';
import { Button } from '../ui/Button';
import { QuantityInput } from '../ui/QuantityInput';
import { plannedTimeToInputValue } from '../../utils/plannedTime';
import { foodEmoji } from '../../utils/foodEmoji';
import {
  formatFoodMacros,
  useFoodSearchWithAi,
  type FoodLookupOption,
  type PendingFoodLookup
} from '../../hooks/useFoodSearchWithAi';
import { MacroSummaryFooter, type MacroTotals } from './MacroSummaryFooter';

export type MealMacroTargets = MacroTotals;

export type MealCardEditorHandle = {
  isDirty: () => boolean;
  save: () => Promise<boolean>;
  getMealId: () => string;
  getPlannedTotals: () => MacroTotals;
};

export type MealCardEditorSaveAllOptions = {
  thenRebalanceMealId?: string;
};

type LocalEditItem = {
  serverId?: string;
  foodId?: string | null;
  nameSnapshot: string;
  quantity: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

type MacroLike = { calories: number | string; protein: number | string; carbs: number | string; fat: number | string };

function formatMacros(item: MacroLike) {
  return `${Math.round(Number(item.calories))} kcal · ${Math.round(Number(item.protein))}P · ${Math.round(Number(item.carbs))}C · ${Math.round(Number(item.fat))}F`;
}

function toLocalItem(item: MealItem): LocalEditItem {
  return {
    serverId: item.id,
    foodId: item.foodId,
    nameSnapshot: item.nameSnapshot,
    quantity: Number(item.quantity),
    unit: item.unit,
    calories: Number(item.calories),
    protein: Number(item.protein),
    carbs: Number(item.carbs),
    fat: Number(item.fat),
  };
}

function formatMealTotals(calories: number, protein: number, carbs: number, fat: number) {
  return `${Math.round(calories)} kcal · ${Math.round(protein)}g protein · ${Math.round(carbs)}g carbs · ${Math.round(fat)}g fat`;
}

function toLocalItems(items: MealItem[]) {
  return items.filter((item) => item.type === 'PLANNED').map(toLocalItem);
}

const CALORIE_BAND = 0.1;

function isOutOfBalance(calories: number, targetCalories: number | undefined) {
  if (!targetCalories || targetCalories <= 0) return false;
  return Math.abs(calories - targetCalories) > targetCalories * CALORIE_BAND;
}

function itemsAreDirty(baselineItems: MealItem[], localItems: LocalEditItem[]) {
  if (localItems.some((item) => !item.serverId)) return true;
  if (baselineItems.length !== localItems.length) return true;
  if (baselineItems.some((orig) => !localItems.some((local) => local.serverId === orig.id))) return true;
  return localItems.some((local) => {
    const orig = baselineItems.find((item) => item.id === local.serverId);
    return Boolean(orig && Number(orig.quantity) !== local.quantity);
  });
}

export const MealCardEditor = forwardRef<
  MealCardEditorHandle,
  {
    meal: Meal;
    macroTargets?: MealMacroTargets;
    dailyTargets?: MealMacroTargets | null;
    onSaved: () => void;
    onCancel: () => void;
    onRefresh: () => void | Promise<void>;
    onRequestRebalance?: () => void;
    onRequestSaveAll?: (options?: MealCardEditorSaveAllOptions) => void;
    onRequestCancelAll?: () => void;
    externalSaving?: boolean;
    onDraftTotalsChange?: (totals: MacroTotals) => void;
  }
>(function MealCardEditor(
  {
    meal,
    macroTargets,
    dailyTargets,
    onSaved,
    onCancel,
    onRefresh,
    onRequestRebalance,
    onRequestSaveAll,
    onRequestCancelAll,
    externalSaving = false,
    onDraftTotalsChange
  },
  ref
) {
  const [baseline] = useState(() => ({
    name: meal.name,
    plannedTime: plannedTimeToInputValue(meal.plannedTime),
    plannedItems: meal.items.filter((item) => item.type === 'PLANNED'),
  }));

  const [localName, setLocalName] = useState(baseline.name);
  const [localTime, setLocalTime] = useState(baseline.plannedTime);
  const [localItems, setLocalItems] = useState<LocalEditItem[]>(() => toLocalItems(baseline.plannedItems));

  const [undoItem, setUndoItem] = useState<LocalEditItem | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [rebalanceAsk, setRebalanceAsk] = useState(false);
  const rebalanceDismissedRef = useRef(false);

  const [recentFoods, setRecentFoods] = useState<Food[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const {
    local,
    queue,
    pending,
    searching,
    searched,
    hasResults,
    aiOptions,
    aiLoading,
    aiError,
    runAiSearch,
    acceptLookup,
    resetAi
  } = useFoodSearchWithAi(searchQuery);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [searchAcceptError, setSearchAcceptError] = useState<string | null>(null);

  useEffect(() => {
    api<Food[]>('/api/foods/recent').then(setRecentFoods).catch(() => setRecentFoods([]));
  }, []);

  useEffect(() => {
    resetAi();
    setSelectedIndex(-1);
  }, [searchQuery, resetAi]);

  type DropdownEntry =
    | { kind: 'food'; food: Food; label?: string }
    | { kind: 'pending'; pending: PendingFoodLookup }
    | { kind: 'ai'; option: FoodLookupOption }
    | { kind: 'ai-search' };

  const dropdownEntries = useMemo<DropdownEntry[]>(() => {
    if (searchQuery.trim().length < 2) {
      return recentFoods.map((food) => ({ kind: 'food', food }));
    }
    const entries: DropdownEntry[] = [
      ...local.map((food) => ({ kind: 'food' as const, food })),
      ...queue.map((food) => ({ kind: 'food' as const, food, label: 'AI review queue' })),
      ...pending.map((item) => ({ kind: 'pending' as const, pending: item })),
      ...aiOptions.map((option) => ({ kind: 'ai' as const, option }))
    ];
    if (!searching && !aiLoading && searched && !aiError && aiOptions.length === 0 && !hasResults) {
      entries.push({ kind: 'ai-search' });
    }
    return entries;
  }, [searchQuery, recentFoods, local, queue, pending, aiOptions, searching, aiLoading, searched, aiError]);

  const showDropdown =
    searchFocused &&
    (searching ||
      aiLoading ||
      dropdownEntries.length > 0 ||
      searchQuery.trim().length >= 2 ||
      Boolean(aiError));
  const showRecentLabel = searchQuery.trim().length < 2 && recentFoods.length > 0;

  const totals = {
    calories: localItems.reduce((s, i) => s + i.calories, 0),
    protein: localItems.reduce((s, i) => s + i.protein, 0),
    carbs: localItems.reduce((s, i) => s + i.carbs, 0),
    fat: localItems.reduce((s, i) => s + i.fat, 0),
  };

  const onDraftTotalsChangeRef = useRef(onDraftTotalsChange);
  onDraftTotalsChangeRef.current = onDraftTotalsChange;
  useEffect(() => {
    onDraftTotalsChangeRef.current?.(totals);
  }, [totals.calories, totals.protein, totals.carbs, totals.fat]);

  function maybeAskRebalance(nextCalories: number) {
    const target = macroTargets?.calories;
    if (!isOutOfBalance(nextCalories, target)) {
      rebalanceDismissedRef.current = false;
      setRebalanceAsk(false);
      return;
    }
    if (rebalanceDismissedRef.current || !onRequestRebalance) return;
    setRebalanceAsk(true);
  }

  function removeItem(item: LocalEditItem) {
    const nextCalories = totals.calories - item.calories;
    setLocalItems((prev) => prev.filter((i) => i !== item));
    setUndoItem(item);
    setToast(`Removed ${item.nameSnapshot}. Undo?`);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => {
      setUndoItem(null);
      setToast(null);
    }, 5000);
    maybeAskRebalance(nextCalories);
  }

  function undoRemove() {
    if (!undoItem) return;
    const nextCalories = totals.calories + undoItem.calories;
    setLocalItems((prev) => [...prev, undoItem]);
    setUndoItem(null);
    setToast(null);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    maybeAskRebalance(nextCalories);
  }

  function updateQuantity(item: LocalEditItem, newQty: number) {
    if (newQty <= 0) return;
    const factor = newQty / item.quantity;
    const nextCalories = totals.calories - item.calories + item.calories * factor;
    setLocalItems((prev) =>
      prev.map((i) => {
        if (i !== item) return i;
        return { ...i, quantity: newQty, calories: i.calories * factor, protein: i.protein * factor, carbs: i.carbs * factor, fat: i.fat * factor };
      })
    );
    maybeAskRebalance(nextCalories);
  }

  function addFood(food: Food) {
    const newItem: LocalEditItem = {
      serverId: undefined,
      foodId: food.id,
      nameSnapshot: food.name,
      quantity: Number(food.servingSize) || 1,
      unit: food.servingUnit,
      calories: Number(food.calories),
      protein: Number(food.protein),
      carbs: Number(food.carbs),
      fat: Number(food.fat),
    };
    setLocalItems((prev) => [...prev, newItem]);
    setSearchQuery('');
    resetAi();
    setSelectedIndex(-1);
    setSearchFocused(true);
    maybeAskRebalance(totals.calories + newItem.calories);
  }

  function dismissRebalanceAsk() {
    rebalanceDismissedRef.current = true;
    setRebalanceAsk(false);
  }

  async function selectEntry(entry: DropdownEntry) {
    setSearchAcceptError(null);
    try {
      if (entry.kind === 'food') {
        addFood(entry.food);
        return;
      }
      if (entry.kind === 'pending') {
        const food = await acceptLookup(entry.pending.lookupId);
        addFood(food);
        return;
      }
      if (entry.kind === 'ai') {
        const food = await acceptLookup(entry.option.lookupId);
        addFood(food);
        return;
      }
      if (entry.kind === 'ai-search') {
        await runAiSearch();
      }
    } catch (err) {
      setSearchAcceptError(err instanceof Error ? err.message : 'Could not add that food.');
    }
  }

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!showDropdown) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, dropdownEntries.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, -1));
    } else if (event.key === 'Enter' && selectedIndex >= 0) {
      event.preventDefault();
      const entry = dropdownEntries[selectedIndex];
      if (entry) void selectEntry(entry);
    } else if (event.key === 'Escape') {
      setSearchFocused(false);
      setSelectedIndex(-1);
    }
  }

  function isDirty() {
    return (
      localName !== baseline.name ||
      localTime !== baseline.plannedTime ||
      itemsAreDirty(baseline.plannedItems, localItems)
    );
  }

  async function persistMeal(options?: { thenRebalance?: boolean; notifySaved?: boolean }): Promise<boolean> {
    setSaving(true);
    setSaveError(null);
    if (!localTime.trim()) {
      setSaveError('Meal time is required.');
      setSaving(false);
      return false;
    }
    try {
      const patch: Record<string, unknown> = {};
      if (localName !== baseline.name) patch.name = localName;
      if (localTime !== baseline.plannedTime) patch.plannedTime = localTime;
      const mealMetaChanged = Object.keys(patch).length > 0;
      if (mealMetaChanged) {
        await api(`/api/meals/${meal.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
      }

      let existingItemsChanged = false;
      for (const item of localItems.filter((i) => i.serverId)) {
        const orig = baseline.plannedItems.find((o) => o.id === item.serverId);
        if (orig && Number(orig.quantity) !== item.quantity) {
          existingItemsChanged = true;
          const factor = item.quantity / Number(orig.quantity);
          await api(`/api/meal-items/${item.serverId}`, {
            method: 'PATCH',
            body: JSON.stringify({
              quantity: item.quantity,
              calories: Number(orig.calories) * factor,
              protein: Number(orig.protein) * factor,
              carbs: Number(orig.carbs) * factor,
              fat: Number(orig.fat) * factor,
            }),
          });
        }
      }

      const newItems = localItems.filter((i) => !i.serverId);
      for (const item of newItems) {
        await api(`/api/meals/${meal.id}/items`, {
          method: 'POST',
          body: JSON.stringify({
            type: 'PLANNED',
            foodId: item.foodId,
            nameSnapshot: item.nameSnapshot,
            quantity: item.quantity,
            unit: item.unit,
            calories: item.calories,
            protein: item.protein,
            carbs: item.carbs,
            fat: item.fat,
          }),
        });
      }

      const removedIds = baseline.plannedItems
        .filter((orig) => !localItems.some((local) => local.serverId === orig.id))
        .map((orig) => orig.id);
      for (const id of removedIds) {
        await api(`/api/meal-items/${id}`, { method: 'DELETE' });
      }

      const planChanged = mealMetaChanged || existingItemsChanged || newItems.length > 0 || removedIds.length > 0;
      if (planChanged) {
        // Same rule as card builds and AI meals: changing a meal sets it from this day
        // forward. Days where this meal already has logged food are left untouched.
        await api(`/api/meals/${meal.id}/apply-forward`, { method: 'POST' });
      }

      setRebalanceAsk(false);
      if (options?.notifySaved !== false) onSaved();
      if (options?.thenRebalance) onRequestRebalance?.();
      return true;
    } catch (err) {
      await onRefresh();
      setSaveError(
        err instanceof Error
          ? `${err.message} Some changes may have been saved — review the refreshed plan and try again.`
          : 'Could not save all changes. Review the refreshed plan and try again.'
      );
      return false;
    } finally {
      setSaving(false);
    }
  }

  useImperativeHandle(
    ref,
    () => ({
      isDirty,
      save: () => persistMeal({ notifySaved: false }),
      getMealId: () => meal.id,
      getPlannedTotals: () => totals
    }),
    // Keep handle current with latest draft state used by isDirty/persistMeal.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional snapshot of latest closures
    [meal.id, localName, localTime, localItems, baseline, totals]
  );

  function handleSaveClick(options?: { thenRebalance?: boolean }) {
    if (onRequestSaveAll) {
      onRequestSaveAll(options?.thenRebalance ? { thenRebalanceMealId: meal.id } : undefined);
      return;
    }
    void persistMeal(options);
  }

  function handleCancelClick() {
    if (onRequestCancelAll) {
      onRequestCancelAll();
      return;
    }
    onCancel();
  }

  const busy = saving || externalSaving;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-app-text-muted">Meal {meal.mealNumber}</p>
            <span className="inline-flex items-center rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Editing Plan
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={localName}
              onChange={(e) => setLocalName(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-app-border bg-app-surface px-3 py-1.5 text-lg font-bold text-app-text focus:outline-none focus:ring-2 focus:ring-emerald-400"
              aria-label="Meal name"
            />
            <input
              type="time"
              value={localTime}
              onChange={(e) => setLocalTime(e.target.value)}
              required
              className="rounded-lg border border-app-border bg-app-surface px-3 py-1.5 text-sm text-app-text focus:outline-none focus:ring-2 focus:ring-emerald-400"
              aria-label="Meal time (required)"
            />
          </div>
        </div>
      </div>

      {/* Planned panel (editable) */}
      <div>
        <div className="space-y-3 rounded-2xl bg-brand-gold/10 p-3 ring-1 ring-brand-gold/20">
          <p className="font-semibold text-app-text">Planned</p>

          {localItems.length > 0 ? (
            <ul className="space-y-2">
              {localItems.map((item, idx) => (
                <li key={item.serverId ?? `new-${idx}`} className="flex items-start gap-2">
                  <button
                    type="button"
                    aria-label={`Delete ${item.nameSnapshot}`}
                    className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-app-text-muted transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40"
                    onClick={() => removeItem(item)}
                  >
                    <Trash2 size={14} />
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    <QuantityInput
                      value={item.quantity}
                      onChange={(qty) => updateQuantity(item, qty)}
                      className="w-20 rounded-lg border border-app-border bg-app-surface px-2 py-1 text-center text-sm font-medium text-app-text focus:outline-none focus:ring-2 focus:ring-emerald-400"
                      aria-label={`Quantity for ${item.nameSnapshot}`}
                    />
                    <span className="text-xs text-app-text-muted">{item.unit}</span>
                  </div>
                  <span className="mt-0.5 w-5 shrink-0 text-center" aria-hidden>
                    {foodEmoji(item.nameSnapshot)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-app-text">{item.nameSnapshot}</p>
                    <p className="text-xs text-app-text-muted">{formatMacros(item)}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-app-text-muted">No foods planned</p>
          )}

          {/* Planned totals */}
          <div className="border-t border-brand-gold/20 pt-2">
            {macroTargets ? (
              <>
                <MacroSummaryFooter
                  totals={{
                    calories: Math.round(totals.calories),
                    protein: Math.round(totals.protein),
                    carbs: Math.round(totals.carbs),
                    fat: Math.round(totals.fat)
                  }}
                  targets={macroTargets}
                  dailyTargets={dailyTargets}
                />
                <p className="mt-2 text-xs text-app-text-muted">Totals update automatically as you edit.</p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-app-text">{formatMealTotals(totals.calories, totals.protein, totals.carbs, totals.fat)}</p>
                <p className="mt-0.5 text-xs text-app-text-muted">Totals update automatically.</p>
              </>
            )}
          </div>

          {/* Add food search */}
          <div className="relative">
            <div
              className={`flex items-center gap-2 rounded-xl border bg-app-surface px-3 py-2 transition ${
                searchFocused ? 'border-emerald-400 ring-2 ring-emerald-400/20' : 'border-app-border'
              }`}
            >
              <Search size={14} className="shrink-0 text-app-text-muted" />
              <input
                type="text"
                placeholder="Search or add food…"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSelectedIndex(-1);
                }}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                onKeyDown={handleSearchKeyDown}
                className="min-w-0 flex-1 bg-transparent text-sm text-app-text placeholder:text-app-text-muted focus:outline-none"
                aria-label="Search or add food"
                aria-expanded={showDropdown}
                aria-autocomplete="list"
                role="combobox"
              />
              <ChevronDown size={14} className="shrink-0 text-app-text-muted" />
            </div>

            {showDropdown && (
              <ul
                className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-app-border bg-app-surface shadow-lg"
                role="listbox"
              >
                {showRecentLabel && (
                  <li className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-app-text-muted">Recent foods</li>
                )}
                {searching && <li className="px-3 py-2 text-sm text-app-text-muted">Searching…</li>}
                {aiLoading && <li className="px-3 py-2 text-sm text-app-text-muted">Asking AI for matches…</li>}
                {!searching && searchQuery.trim().length >= 2 && !hasResults && aiOptions.length === 0 && !aiLoading && (
                  <li className="px-3 py-2 text-sm text-app-text-muted">No foods found in your library or AI queue.</li>
                )}
                {aiError && (
                  <li className="px-3 py-2 text-sm text-red-600">
                    {aiError}
                    <button type="button" className="ml-2 font-bold underline" onMouseDown={(e) => e.preventDefault()} onClick={() => void runAiSearch()}>
                      Try again
                    </button>
                  </li>
                )}
                {searchAcceptError && <li className="px-3 py-2 text-sm text-red-600">{searchAcceptError}</li>}
                {!searching &&
                  dropdownEntries.map((entry, idx) => {
                    if (entry.kind === 'ai-search') {
                      return (
                        <li key="ai-search" role="option" aria-selected={selectedIndex === idx}>
                          <button
                            type="button"
                            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition ${selectedIndex === idx ? 'bg-emerald-500/10' : 'hover:bg-app-muted'}`}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              void runAiSearch();
                            }}
                          >
                            <Sparkles size={14} className="text-emerald-600" />
                            <span className="font-medium text-emerald-700">Search with AI for &quot;{searchQuery.trim()}&quot;</span>
                          </button>
                        </li>
                      );
                    }

                    const label =
                      entry.kind === 'food'
                        ? entry.food.name
                        : entry.kind === 'pending'
                          ? entry.pending.name
                          : entry.option.name;
                    const macros =
                      entry.kind === 'food'
                        ? formatMacros(entry.food)
                        : entry.kind === 'pending'
                          ? formatFoodMacros(entry.pending)
                          : formatFoodMacros(entry.option);
                    const hint =
                      entry.kind === 'food'
                        ? entry.label
                        : entry.kind === 'pending'
                          ? 'saved lookup'
                          : 'AI estimate';

                    return (
                      <li key={entry.kind === 'food' ? entry.food.id : entry.kind === 'pending' ? entry.pending.lookupId : entry.option.lookupId} role="option" aria-selected={selectedIndex === idx}>
                        <button
                          type="button"
                          className={`w-full px-3 py-2 text-left text-sm transition ${selectedIndex === idx ? 'bg-emerald-500/10' : 'hover:bg-app-muted'}`}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            void selectEntry(entry);
                          }}
                        >
                          <span className="font-medium text-app-text">{label}</span>
                          {hint ? <span className="ml-2 text-xs text-emerald-700 dark:text-emerald-300">{hint}</span> : null}
                          <span className="ml-2 text-xs text-app-text-muted">{macros}</span>
                        </button>
                      </li>
                    );
                  })}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Footer: error + save/cancel */}
      {saveError && <p className="text-sm text-red-600">{saveError}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-app-text-muted">
          {onRequestSaveAll
            ? "Saving updates every meal on this day — days you've already logged stay untouched."
            : "Saving sets this meal for the rest of the week — days you've already logged stay untouched."}
        </p>
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" onClick={handleCancelClick} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={() => handleSaveClick()}
            disabled={busy}
          >
            {busy ? 'Saving…' : onRequestSaveAll ? 'Save day' : 'Save changes'}
          </Button>
        </div>
      </div>

      {/* Undo toast */}
      {toast && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-800 px-4 py-2 text-sm text-white">
          <span>{toast}</span>
          <button type="button" className="font-semibold text-emerald-400 hover:text-emerald-300" onClick={undoRemove}>
            Undo
          </button>
        </div>
      )}

      {rebalanceAsk && onRequestRebalance && (
        <div className="flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-100 sm:flex-row sm:items-center sm:justify-between">
          <p>
            This meal is outside its calorie target
            {macroTargets ? ` (${Math.round(totals.calories)} vs ${Math.round(macroTargets.calories)} kcal)` : ''}.
            Want to try to get it back in balance?
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" variant="secondary" onClick={dismissRebalanceAsk} disabled={busy}>
              Not now
            </Button>
            <Button
              type="button"
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => handleSaveClick({ thenRebalance: true })}
              disabled={busy}
            >
              {busy ? 'Saving…' : 'Yes, help me'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
});
