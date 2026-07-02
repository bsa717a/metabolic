import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Minus, Search } from 'lucide-react';
import { api } from '../../services/api';
import type { Food, Meal, MealItem } from '../../types';
import { Button } from '../ui/Button';
import { plannedTimeToInputValue } from '../../utils/plannedTime';
import { foodEmoji } from '../../utils/foodEmoji';

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

export function MealCardEditor({
  meal,
  onSaved,
  onCancel,
  onRefresh,
}: {
  meal: Meal;
  onSaved: () => void;
  onCancel: () => void;
  onRefresh: () => void | Promise<void>;
}) {
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

  const [recentFoods, setRecentFoods] = useState<Food[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Food[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    api<Food[]>('/api/foods/recent').then(setRecentFoods).catch(() => setRecentFoods([]));
  }, []);

  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      setSearching(false);
      setSelectedIndex(-1);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const results = await api<Food[]>(`/api/foods?query=${encodeURIComponent(searchQuery.trim())}`);
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const dropdownItems = searchQuery.trim().length >= 2 ? searchResults : recentFoods;
  const showDropdown = searchFocused && (searching || dropdownItems.length > 0 || searchQuery.trim().length >= 2);
  const showRecentLabel = searchQuery.trim().length < 2 && recentFoods.length > 0;

  const totals = {
    calories: localItems.reduce((s, i) => s + i.calories, 0),
    protein: localItems.reduce((s, i) => s + i.protein, 0),
    carbs: localItems.reduce((s, i) => s + i.carbs, 0),
    fat: localItems.reduce((s, i) => s + i.fat, 0),
  };

  function removeItem(item: LocalEditItem) {
    setLocalItems((prev) => prev.filter((i) => i !== item));
    setUndoItem(item);
    setToast(`Removed ${item.nameSnapshot}. Undo?`);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => {
      setUndoItem(null);
      setToast(null);
    }, 5000);
  }

  function undoRemove() {
    if (!undoItem) return;
    setLocalItems((prev) => [...prev, undoItem]);
    setUndoItem(null);
    setToast(null);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
  }

  function updateQuantity(item: LocalEditItem, newQty: number) {
    if (newQty <= 0) return;
    setLocalItems((prev) =>
      prev.map((i) => {
        if (i !== item) return i;
        const factor = newQty / i.quantity;
        return { ...i, quantity: newQty, calories: i.calories * factor, protein: i.protein * factor, carbs: i.carbs * factor, fat: i.fat * factor };
      })
    );
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
    setSearchResults([]);
    setSelectedIndex(-1);
    // Input stays focused after mousedown+preventDefault; keep searchFocused true so the dropdown reopens on the next query.
    setSearchFocused(true);
  }

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!showDropdown) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, dropdownItems.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, -1));
    } else if (event.key === 'Enter' && selectedIndex >= 0) {
      event.preventDefault();
      const food = dropdownItems[selectedIndex];
      if (food) addFood(food);
    } else if (event.key === 'Escape') {
      setSearchFocused(false);
      setSelectedIndex(-1);
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const patch: Record<string, unknown> = {};
      if (localName !== baseline.name) patch.name = localName;
      if (localTime !== baseline.plannedTime) patch.plannedTime = localTime || null;
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

      onSaved();
    } catch (err) {
      await onRefresh();
      setSaveError(
        err instanceof Error
          ? `${err.message} Some changes may have been saved — review the refreshed plan and try again.`
          : 'Could not save all changes. Review the refreshed plan and try again.'
      );
    } finally {
      setSaving(false);
    }
  }

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
              className="rounded-lg border border-app-border bg-app-surface px-3 py-1.5 text-sm text-app-text focus:outline-none focus:ring-2 focus:ring-emerald-400"
              aria-label="Meal time"
            />
          </div>
        </div>
      </div>

      {/* Planned panel (editable) */}
      <div>
        <div className="space-y-3 rounded-2xl bg-yellow-50 p-3">
          <p className="font-semibold">Planned</p>

          {localItems.length > 0 ? (
            <ul className="space-y-2">
              {localItems.map((item, idx) => (
                <li key={item.serverId ?? `new-${idx}`} className="flex items-start gap-2">
                  <button
                    type="button"
                    aria-label={`Remove ${item.nameSnapshot}`}
                    className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-red-50 hover:text-red-500"
                    onClick={() => removeItem(item)}
                  >
                    <Minus size={14} />
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    <input
                      type="number"
                      min={0.25}
                      step={0.25}
                      value={item.quantity}
                      onChange={(e) => updateQuantity(item, Number(e.target.value))}
                      className="w-14 rounded-lg border border-slate-200 bg-white px-2 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
                      aria-label={`Quantity for ${item.nameSnapshot}`}
                    />
                    <span className="text-xs text-slate-500">{item.unit}</span>
                  </div>
                  <span className="mt-0.5 w-5 shrink-0 text-center" aria-hidden>
                    {foodEmoji(item.nameSnapshot)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{item.nameSnapshot}</p>
                    <p className="text-xs text-slate-500">{formatMacros(item)}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No foods planned</p>
          )}

          {/* Planned totals */}
          <div className="border-t border-yellow-100 pt-2">
            <p className="text-sm font-medium text-slate-700">{formatMealTotals(totals.calories, totals.protein, totals.carbs, totals.fat)}</p>
            <p className="mt-0.5 text-xs text-slate-400">Totals update automatically.</p>
          </div>

          {/* Add food search */}
          <div className="relative">
            <div
              className={`flex items-center gap-2 rounded-xl border bg-white px-3 py-2 transition ${
                searchFocused ? 'border-emerald-400 ring-2 ring-emerald-100' : 'border-slate-200'
              }`}
            >
              <Search size={14} className="shrink-0 text-slate-400" />
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
                className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
                aria-label="Search or add food"
                aria-expanded={showDropdown}
                aria-autocomplete="list"
                role="combobox"
              />
              <ChevronDown size={14} className="shrink-0 text-slate-400" />
            </div>

            {showDropdown && (
              <ul
                className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg"
                role="listbox"
              >
                {showRecentLabel && (
                  <li className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Recent foods</li>
                )}
                {searching && <li className="px-3 py-2 text-sm text-slate-400">Searching…</li>}
                {!searching && searchQuery.trim().length >= 2 && searchResults.length === 0 && (
                  <li className="px-3 py-2 text-sm text-slate-400">No foods found.</li>
                )}
                {!searching &&
                  dropdownItems.map((food, idx) => (
                    <li key={food.id} role="option" aria-selected={selectedIndex === idx}>
                      <button
                        type="button"
                        className={`w-full px-3 py-2 text-left text-sm transition ${selectedIndex === idx ? 'bg-emerald-50' : 'hover:bg-slate-50'}`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          addFood(food);
                        }}
                      >
                        <span className="font-medium text-slate-800">{food.name}</span>
                        <span className="ml-2 text-slate-400 text-xs">{formatMacros(food)}</span>
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Footer: error + save/cancel */}
      {saveError && <p className="text-sm text-red-600">{saveError}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-400">Saving sets this meal for the rest of the week — days you've already logged stay untouched.</p>
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save changes'}
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
    </div>
  );
}
