import { useEffect, useMemo, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { createPortal } from 'react-dom';
import { Pencil, Plus, Search, X } from 'lucide-react';
import { api } from '../../services/api';
import type { Meal } from '../../types';
import {
  DAILY_GOALS,
  FOOD_GROUPS,
  GROUP_COLORS,
  GROUP_EMOJI_ROLE,
  emptyFoodsByGroup,
  emptyFoodsByGroupCatalog,
  mealTotals,
  mealsFromDayPlan,
  sortGroups,
  type AddedFoodEntry,
  type BuilderFood,
  type FoodGroup,
  type FoodsByGroup,
  type MacroTotals
} from '../../data/mealBuilderGroups';
import { NumberInput } from '../ui/NumberInput';
import { QuantityInput } from '../ui/QuantityInput';
import { foodEmoji } from '../../utils/foodEmoji';

type PlanMeal = {
  id: string;
  mealNumber: number;
  name: string;
  percentOfDay: number;
  groups: FoodGroup[];
  foods: Record<FoodGroup, AddedFoodEntry[]>;
  editing: boolean;
};

type Selection = { mealId: string; group: FoodGroup };

const SEED_MEALS: Array<{ name: string; percentOfDay: number }> = [
  { name: 'Breakfast', percentOfDay: 25 },
  { name: 'Lunch', percentOfDay: 30 },
  { name: 'Dinner', percentOfDay: 30 },
  { name: 'Snacks', percentOfDay: 15 }
];

function createMeal(name: string, percentOfDay: number, mealNumber: number, editing = false): PlanMeal {
  return {
    id: crypto.randomUUID(),
    mealNumber,
    name,
    percentOfDay,
    groups: [...FOOD_GROUPS],
    foods: emptyFoodsByGroup(),
    editing
  };
}

function createSeedMeals(): PlanMeal[] {
  return SEED_MEALS.map(({ name, percentOfDay }, index) => createMeal(name, percentOfDay, index + 1));
}

function progressColor(actual: number, target: number): string {
  if (target <= 0) return '#22c55e';
  return actual > target ? '#f59e0b' : '#22c55e';
}

function progressPercent(actual: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(100, (actual / target) * 100);
}

function MiniProgressBar({ actual, target }: { actual: number; target: number }) {
  const pct = progressPercent(actual, target);
  const color = progressColor(actual, target);
  return (
    <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-[#dde3e8]">
      <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

function MacroChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <span
      className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums"
      style={{ backgroundColor: `${color}18`, color }}
    >
      {label} {Math.round(value)}
    </span>
  );
}

function FoodListCard({ food, onAdd, showGroup = false }: { food: BuilderFood; onAdd: () => void; showGroup?: boolean }) {
  const colors = GROUP_COLORS[food.group];
  const servingLabel = `${food.servingSize} ${food.servingUnit}`.trim();
  return (
    <button
      type="button"
      onClick={onAdd}
      className="w-full rounded-xl border border-[#dde3e8] bg-white p-3 text-left shadow-sm transition hover:border-[#b8c5d0] hover:shadow-md active:scale-[0.99]"
    >
      <div className="flex items-start gap-2">
        <span className="shrink-0 text-lg leading-6" aria-hidden>
          {foodEmoji(food.name, GROUP_EMOJI_ROLE[food.group])}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-[#1b2733]">{food.name}</p>
            {showGroup && (
              <span
                className="rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                style={{ backgroundColor: colors.bg, color: colors.text }}
              >
                {food.group}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-[#5a6b7d]">{servingLabel}</p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <MacroChip label="kcal" value={food.calories} color={colors.chip} />
        <MacroChip label="P" value={food.protein} color="#e74c5e" />
        <MacroChip label="C" value={food.carbs} color="#3b82f6" />
        <MacroChip label="F" value={food.fat} color="#ca8a04" />
      </div>
    </button>
  );
}

function MealEditor({
  meal,
  onUpdate,
  onDelete
}: {
  meal: PlanMeal;
  onUpdate: (patch: Partial<PlanMeal>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="mt-3 rounded-xl border border-[#c5d0da] bg-[#f8fafb] p-3">
      <label className="block text-xs font-semibold uppercase tracking-wide text-[#5a6b7d]">Meal name</label>
      <input
        type="text"
        value={meal.name}
        onChange={(e) => onUpdate({ name: e.target.value })}
        className="mt-1 w-full rounded-lg border border-[#dde3e8] bg-white px-3 py-2 text-sm text-[#1b2733] outline-none focus:border-[#3b82f6]"
      />
      <div className="mt-3">
        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-[#5a6b7d]">
          <span>% of daily calories</span>
          <span className="tabular-nums text-[#1b2733]">{meal.percentOfDay}%</span>
        </div>
        <input
          type="range"
          min={5}
          max={100}
          step={1}
          value={meal.percentOfDay}
          onChange={(e) => onUpdate({ percentOfDay: Number(e.target.value) })}
          className="mt-1 w-full accent-[#3b82f6]"
        />
        <p className="mt-0.5 text-xs text-[#5a6b7d]">
          Target: {Math.round((meal.percentOfDay / 100) * DAILY_GOALS.calories)} kcal
        </p>
      </div>
      <div className="mt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#5a6b7d]">Food groups</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {FOOD_GROUPS.map((group) => {
            const active = meal.groups.includes(group);
            const colors = GROUP_COLORS[group];
            return (
              <button
                key={group}
                type="button"
                onClick={() => {
                  if (active) {
                    const nextGroups = meal.groups.filter((g) => g !== group);
                    const nextFoods = { ...meal.foods, [group]: [] };
                    onUpdate({ groups: nextGroups, foods: nextFoods });
                  } else {
                    onUpdate({ groups: sortGroups([...meal.groups, group]) });
                  }
                }}
                className={clsx(
                  'rounded-lg border px-3 py-1.5 text-xs font-semibold transition',
                  active ? 'shadow-sm' : 'opacity-50'
                )}
                style={
                  active
                    ? { backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }
                    : { backgroundColor: 'white', color: '#5a6b7d', borderColor: '#dde3e8' }
                }
              >
                {group}
              </button>
            );
          })}
        </div>
      </div>
      <button
        type="button"
        onClick={onDelete}
        className="mt-3 text-xs font-semibold text-red-600 transition hover:text-red-700"
      >
        Delete meal
      </button>
    </div>
  );
}

function mealGoalsFromPercent(percentOfDay: number): MacroTotals {
  const share = percentOfDay / 100;
  return {
    calories: Math.round(share * DAILY_GOALS.calories),
    protein: Math.round(share * DAILY_GOALS.protein),
    carbs: Math.round(share * DAILY_GOALS.carbs),
    fat: Math.round(share * DAILY_GOALS.fat)
  };
}

type QuantityEdit = { mealId: string; group: FoodGroup; instanceId: string };

function MealRow({
  meal,
  selected,
  quantityEdit,
  onSelectGroup,
  onToggleEdit,
  onUpdate,
  onDelete,
  onRemoveFood,
  onQuantityEditSelect,
  onUpdateQuantity,
  onQuantityEditDone
}: {
  meal: PlanMeal;
  selected: Selection | null;
  quantityEdit: { group: FoodGroup; instanceId: string } | null;
  onSelectGroup: (group: FoodGroup) => void;
  onToggleEdit: () => void;
  onUpdate: (patch: Partial<PlanMeal>) => void;
  onDelete: () => void;
  onRemoveFood: (group: FoodGroup, instanceId: string) => void;
  onQuantityEditSelect: (group: FoodGroup, instanceId: string) => void;
  onUpdateQuantity: (group: FoodGroup, instanceId: string, quantity: number) => void;
  onQuantityEditDone: () => void;
}) {
  const totals = mealTotals(meal.foods);
  const goals = mealGoalsFromPercent(meal.percentOfDay);
  const targetKcal = goals.calories;
  const barColor = progressColor(totals.calories, targetKcal);
  const barPct = progressPercent(totals.calories, targetKcal);

  return (
    <div className="rounded-xl border border-[#dde3e8] bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-[#1b2733]">{meal.name}</h3>
          <p className="mt-0.5 text-xs text-[#5a6b7d]">
            {meal.percentOfDay}% of day · Target {targetKcal} kcal
          </p>
        </div>
        <button
          type="button"
          onClick={onToggleEdit}
          className={clsx(
            'flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition',
            meal.editing
              ? 'border-[#3b82f6] bg-[#e8f0fd] text-[#1e4a8a]'
              : 'border-[#dde3e8] bg-white text-[#5a6b7d] hover:border-[#b8c5d0]'
          )}
        >
          <Pencil className="h-3 w-3" />
          Edit
        </button>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#eef1f4]">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${barPct}%`, backgroundColor: barColor }}
        />
      </div>
      <p className="mt-1 text-xs tabular-nums text-[#5a6b7d]">
        {Math.round(totals.calories)} / {targetKcal} kcal
      </p>

      {meal.editing && <MealEditor meal={meal} onUpdate={onUpdate} onDelete={onDelete} />}

      <div className="mt-3 space-y-2">
        {sortGroups(meal.groups).map((group) => {
          const colors = GROUP_COLORS[group];
          const isSelected = selected?.mealId === meal.id && selected.group === group;
          const items = meal.foods[group];
          const count = items.length;

          return (
            <div key={group}>
              <button
                type="button"
                onClick={() => onSelectGroup(group)}
                className={clsx(
                  'flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm font-semibold transition',
                  isSelected ? 'shadow-sm' : 'hover:shadow-sm'
                )}
                style={
                  isSelected
                    ? { backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }
                    : { backgroundColor: 'white', color: '#1b2733', borderColor: '#eef1f4' }
                }
              >
                <span>{group}</span>
                {count > 0 && (
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-bold tabular-nums"
                    style={{ backgroundColor: colors.chip, color: 'white' }}
                  >
                    {count}
                  </span>
                )}
              </button>
              {items.length > 0 && (
                <ul className="ml-3 mt-1 space-y-1 border-l-2 pl-3" style={{ borderColor: colors.border }}>
                  {items.map((item) => {
                    const isEditingQty =
                      quantityEdit?.group === group && quantityEdit.instanceId === item.instanceId;
                    return (
                    <li
                      key={item.instanceId}
                      className={clsx(
                        'flex items-center justify-between gap-2 rounded-md text-xs text-[#1b2733]',
                        isEditingQty && 'bg-[#e8f0fd] px-1 py-1 ring-1 ring-[#93b8f5]'
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => onQuantityEditSelect(group, item.instanceId)}
                        className="min-w-0 flex-1 truncate text-left"
                      >
                        <span aria-hidden>{foodEmoji(item.name, GROUP_EMOJI_ROLE[group])}</span>{' '}
                        {item.name}{' '}
                        <span className="text-[#5a6b7d]">
                          {Math.round(item.calories)} kcal
                          {!isEditingQty && item.quantity !== 1 ? ` · ${item.quantity} ${item.servingUnit}` : ''}
                        </span>
                      </button>
                      {isEditingQty && (
                        <QuantityInput
                          value={item.quantity}
                          autoFocus
                          onChange={(qty) => onUpdateQuantity(group, item.instanceId, qty)}
                          onBlur={onQuantityEditDone}
                          className="w-16 shrink-0 rounded-md border border-[#dde3e8] bg-white px-1.5 py-0.5 text-center text-xs font-medium tabular-nums text-[#1b2733] outline-none focus:border-[#3b82f6] focus:ring-1 focus:ring-[#3b82f6]"
                          aria-label={`Quantity for ${item.name}`}
                        />
                      )}
                      <button
                        type="button"
                        aria-label={`Remove ${item.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveFood(group, item.instanceId);
                        }}
                        className="shrink-0 rounded p-0.5 text-[#5a6b7d] transition hover:bg-red-50 hover:text-red-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 border-t border-[#eef1f4] pt-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MacroFooterRow label="Cal" actual={totals.calories} goal={goals.calories} unit="" />
          <MacroFooterRow label="Pro" actual={totals.protein} goal={goals.protein} unit="g" />
          <MacroFooterRow label="Carb" actual={totals.carbs} goal={goals.carbs} unit="g" />
          <MacroFooterRow label="Fat" actual={totals.fat} goal={goals.fat} unit="g" />
        </div>
      </div>
    </div>
  );
}

function MacroFooterRow({ label, actual, goal, unit }: { label: string; actual: number; goal: number; unit: string }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-baseline justify-between gap-1">
        <span className="text-[10px] font-bold uppercase tracking-wide text-[#5a6b7d]">{label}</span>
        <span className="text-xs font-bold tabular-nums text-[#1b2733]">
          {Math.round(actual)}
          {unit} <span className="font-medium text-[#5a6b7d]">/ {goal}{unit}</span>
        </span>
      </div>
      <MiniProgressBar actual={actual} target={goal} />
    </div>
  );
}

export function DailyMealBuilderModal({
  open,
  onClose,
  date,
  dayMeals,
  onSaved
}: {
  open: boolean;
  onClose: () => void;
  date: string;
  dayMeals: Meal[];
  onSaved?: () => void | Promise<void>;
}) {
  const [meals, setMeals] = useState<PlanMeal[]>(createSeedMeals);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [catalog, setCatalog] = useState<FoodsByGroup | null>(null);
  const [foodError, setFoodError] = useState<string | null>(null);
  const [planReady, setPlanReady] = useState(false);
  const [foodSearchQuery, setFoodSearchQuery] = useState('');
  const [quantityEdit, setQuantityEdit] = useState<QuantityEdit | null>(null);
  const [pushForwardDays, setPushForwardDays] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const dayMealsSnapshotRef = useRef<Meal[]>([]);

  const [prevOpenKey, setPrevOpenKey] = useState<string | null>(null);
  const openKey = open ? date : null;
  if (openKey !== prevOpenKey) {
    setPrevOpenKey(openKey);
    if (openKey) {
      dayMealsSnapshotRef.current = dayMeals;
      const seeded = createSeedMeals();
      setMeals(seeded);
      setSelection({ mealId: seeded[0].id, group: 'Protein' });
      setCatalog(null);
      setFoodError(null);
      setSaveError(null);
      setSaving(false);
      setPushForwardDays(0);
      setFoodSearchQuery('');
      setQuantityEdit(null);
      setPlanReady(false);
    }
  }

  useEffect(() => {
    if (!open || catalog === null) return;
    const hydrated = mealsFromDayPlan(dayMealsSnapshotRef.current, catalog);
    const next = hydrated?.length ? hydrated : createSeedMeals();
    setMeals(next);
    setSelection({ mealId: next[0].id, group: next[0].groups[0] ?? 'Protein' });
    setPlanReady(true);
  }, [open, catalog]);

  useEffect(() => {
    if (!open || catalog !== null || foodError !== null) return;
    let cancelled = false;
    api<FoodsByGroup>('/api/foods/by-group')
      .then((result) => {
        if (!cancelled) setCatalog(result);
      })
      .catch((error) => {
        if (!cancelled) {
          setFoodError(error instanceof Error ? error.message : 'Could not load foods.');
          setCatalog(emptyFoodsByGroupCatalog());
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, catalog, foodError]);

  const dailyTotals = useMemo(
    () =>
      meals.reduce(
        (sum, meal) => {
          const totals = mealTotals(meal.foods);
          return {
            calories: sum.calories + totals.calories,
            protein: sum.protein + totals.protein,
            carbs: sum.carbs + totals.carbs,
            fat: sum.fat + totals.fat
          };
        },
        { calories: 0, protein: 0, carbs: 0, fat: 0 } satisfies MacroTotals
      ),
    [meals]
  );

  const allocatedPercent = useMemo(() => meals.reduce((sum, meal) => sum + meal.percentOfDay, 0), [meals]);

  const selectedMeal = meals.find((meal) => meal.id === selection?.mealId) ?? meals[0];
  const selectedGroup = selection?.group ?? 'Protein';
  const searchQuery = foodSearchQuery.trim().toLowerCase();
  const isSearching = searchQuery.length > 0;
  const filteredFoods = useMemo(() => {
    if (!catalog) return [];
    if (!isSearching) return catalog[selectedGroup] ?? [];
    return FOOD_GROUPS.flatMap((group) => catalog[group]).filter(
      (food) =>
        food.name.toLowerCase().includes(searchQuery) ||
        (food.brand?.toLowerCase().includes(searchQuery) ?? false)
    );
  }, [catalog, selectedGroup, searchQuery, isSearching]);
  const loadingFoods = open && catalog === null && foodError === null;

  function updateMeal(id: string, patch: Partial<PlanMeal>) {
    setMeals((prev) => prev.map((meal) => (meal.id === id ? { ...meal, ...patch } : meal)));
  }

  function removeFood(mealId: string, group: FoodGroup, instanceId: string) {
    setMeals((prev) =>
      prev.map((meal) => {
        if (meal.id !== mealId) return meal;
        return {
          ...meal,
          foods: {
            ...meal.foods,
            [group]: meal.foods[group].filter((item) => item.instanceId !== instanceId)
          }
        };
      })
    );
    setQuantityEdit((current) =>
      current?.mealId === mealId && current.group === group && current.instanceId === instanceId ? null : current
    );
  }

  function updateFoodQuantity(mealId: string, group: FoodGroup, instanceId: string, newQty: number) {
    if (!Number.isFinite(newQty) || newQty <= 0) return;
    setMeals((prev) =>
      prev.map((meal) => {
        if (meal.id !== mealId) return meal;
        return {
          ...meal,
          foods: {
            ...meal.foods,
            [group]: meal.foods[group].map((item) => {
              if (item.instanceId !== instanceId) return item;
              const factor = newQty / item.quantity;
              return {
                ...item,
                quantity: newQty,
                calories: item.calories * factor,
                protein: item.protein * factor,
                carbs: item.carbs * factor,
                fat: item.fat * factor
              };
            })
          }
        };
      })
    );
  }

  function addFood(food: BuilderFood) {
    if (!selectedMeal) return;
    const entry: AddedFoodEntry = {
      instanceId: crypto.randomUUID(),
      foodId: food.id,
      name: food.name,
      servingUnit: food.servingUnit,
      quantity: 1,
      calories: food.calories,
      protein: food.protein,
      carbs: food.carbs,
      fat: food.fat
    };
    setMeals((prev) =>
      prev.map((meal) => {
        if (meal.id !== selectedMeal.id) return meal;
        const group = food.group;
        const nextGroups = meal.groups.includes(group) ? meal.groups : sortGroups([...meal.groups, group]);
        return {
          ...meal,
          groups: nextGroups,
          foods: { ...meal.foods, [group]: [...meal.foods[group], entry] }
        };
      })
    );
    setSelection({ mealId: selectedMeal.id, group: food.group });
  }

  function addMeal() {
    const nextMealNumber = meals.reduce((max, meal) => Math.max(max, meal.mealNumber), 0) + 1;
    const meal = createMeal('New meal', 10, nextMealNumber, true);
    setMeals((prev) => [...prev, meal]);
    setSelection({ mealId: meal.id, group: 'Protein' });
  }

  function deleteMeal(id: string) {
    setMeals((prev) => {
      const next = prev.filter((meal) => meal.id !== id);
      if (selection?.mealId === id && next.length > 0) {
        setSelection({ mealId: next[0].id, group: next[0].groups[0] ?? 'Protein' });
      }
      return next.length > 0 ? next : createSeedMeals();
    });
  }

  async function savePlan() {
    if (saving) return;
    if (pushForwardDays > 0) {
      if (
        !window.confirm(
          `This saves the plan to this day and overwrites the plan on the next ${pushForwardDays} day${pushForwardDays === 1 ? '' : 's'}. Continue?`
        )
      ) {
        return;
      }
    }
    setSaving(true);
    setSaveError(null);
    try {
      const payload = {
        meals: meals.map((meal, index) => ({
          mealNumber: meal.mealNumber || index + 1,
          name: meal.name.trim() || `Meal ${index + 1}`,
          items: FOOD_GROUPS.flatMap((group) =>
            meal.foods[group].map((entry) => ({
              foodId: entry.foodId || null,
              name: entry.name,
              quantity: entry.quantity,
              unit: entry.servingUnit || 'serving',
              calories: entry.calories,
              protein: entry.protein,
              carbs: entry.carbs,
              fat: entry.fat
            }))
          )
        })),
        copyForwardDays: pushForwardDays
      };
      await api(`/api/daily-logs/${date}/build-plan`, { method: 'POST', body: JSON.stringify(payload) });
      await onSaved?.();
      onClose();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save this plan.');
    } finally {
      setSaving(false);
    }
  }

  const hasPlannedFood = dailyTotals.calories > 0;

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onClick={onClose} role="presentation">
      <div
        className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl shadow-2xl"
        style={{ backgroundColor: '#eef1f4' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[#dde3e8] bg-white px-5 py-4">
          <div>
            <h2 className="text-xl font-bold text-[#1b2733]">Day Builder</h2>
            <p className="text-sm text-[#5a6b7d]">Plan this day&apos;s meals by food group</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 rounded-lg border border-[#dde3e8] bg-[#f8fafb] px-3 py-1.5 text-sm text-[#5a6b7d]">
              <span className="font-semibold">Also apply to next</span>
              <NumberInput
                min={0}
                max={31}
                step={1}
                integer
                value={pushForwardDays}
                onChange={setPushForwardDays}
                className="w-14 rounded-md border border-[#dde3e8] bg-white px-2 py-1 text-center text-sm font-semibold text-[#1b2733] outline-none focus:border-[#3b82f6]"
              />
              <span className="font-semibold">days</span>
            </label>
            <button
              type="button"
              onClick={() => void savePlan()}
              disabled={saving || !hasPlannedFood || !planReady}
              className="rounded-lg bg-[#22c55e] px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-[#1ba34c] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Saving…' : pushForwardDays > 0 ? `Save & push ${pushForwardDays} days` : 'Save to day'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[#dde3e8] px-3 py-1.5 text-sm font-semibold text-[#5a6b7d] transition hover:bg-[#eef1f4]"
            >
              Close
            </button>
          </div>
        </div>
        {saveError && (
          <div className="shrink-0 border-b border-red-100 bg-red-50 px-5 py-2 text-sm text-red-700">{saveError}</div>
        )}

        <div className="grid min-h-0 flex-1 gap-4 overflow-hidden p-4 lg:grid-cols-2">
          <div className="flex min-h-0 flex-col rounded-2xl border border-[#dde3e8] bg-white shadow-sm">
            <div className="shrink-0 border-b border-[#eef1f4] px-4 py-3">
              <h3 className="font-bold text-[#1b2733]">Today&apos;s plan</h3>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="font-semibold tabular-nums text-[#1b2733]">
                  {Math.round(dailyTotals.calories)} kcal planned
                </span>
                <span
                  className={clsx(
                    'font-semibold tabular-nums',
                    allocatedPercent === 100 ? 'text-[#22c55e]' : 'text-[#f59e0b]'
                  )}
                >
                  Allocated {allocatedPercent}%
                </span>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {!planReady && (
                <p className="text-sm text-[#5a6b7d]">Loading today&apos;s plan…</p>
              )}
              {planReady &&
                meals.map((meal) => (
                  <MealRow
                    key={meal.id}
                    meal={meal}
                    selected={selection}
                    quantityEdit={
                      quantityEdit?.mealId === meal.id
                        ? { group: quantityEdit.group, instanceId: quantityEdit.instanceId }
                        : null
                    }
                    onSelectGroup={(group) => setSelection({ mealId: meal.id, group })}
                    onToggleEdit={() => updateMeal(meal.id, { editing: !meal.editing })}
                    onUpdate={(patch) => updateMeal(meal.id, patch)}
                    onDelete={() => deleteMeal(meal.id)}
                    onRemoveFood={(group, instanceId) => removeFood(meal.id, group, instanceId)}
                    onQuantityEditSelect={(group, instanceId) =>
                      setQuantityEdit({ mealId: meal.id, group, instanceId })
                    }
                    onUpdateQuantity={(group, instanceId, qty) =>
                      updateFoodQuantity(meal.id, group, instanceId, qty)
                    }
                    onQuantityEditDone={() => setQuantityEdit(null)}
                  />
                ))}
              {planReady && (
              <button
                type="button"
                onClick={addMeal}
                className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#c5d0da] py-3 text-sm font-semibold text-[#5a6b7d] transition hover:border-[#3b82f6] hover:text-[#1e4a8a]"
              >
                <Plus className="h-4 w-4" />
                Add meal or snack
              </button>
              )}
            </div>

            <div className="shrink-0 border-t border-[#eef1f4] bg-[#f8fafb] px-4 py-3">
              <div className="flex flex-wrap gap-3">
                <MacroFooterRow label="Cal" actual={dailyTotals.calories} goal={DAILY_GOALS.calories} unit="" />
                <MacroFooterRow label="Pro" actual={dailyTotals.protein} goal={DAILY_GOALS.protein} unit="g" />
                <MacroFooterRow label="Carb" actual={dailyTotals.carbs} goal={DAILY_GOALS.carbs} unit="g" />
                <MacroFooterRow label="Fat" actual={dailyTotals.fat} goal={DAILY_GOALS.fat} unit="g" />
              </div>
            </div>
          </div>

          <div className="flex min-h-0 flex-col rounded-2xl border border-[#dde3e8] bg-white shadow-sm">
            <div className="shrink-0 border-b border-[#eef1f4] px-4 py-3">
              <div className="flex items-center gap-3">
                <h3 className="min-w-0 flex-1 truncate font-bold text-[#1b2733]">
                  {isSearching ? 'Search results' : `${selectedGroup} for ${selectedMeal?.name ?? '—'}`}
                </h3>
                <label className="flex w-32 shrink-0 items-center gap-1.5 rounded-lg border border-[#dde3e8] bg-[#f8fafb] px-2 py-1.5">
                  <Search className="h-3.5 w-3.5 shrink-0 text-[#5a6b7d]" aria-hidden />
                  <input
                    type="search"
                    value={foodSearchQuery}
                    onChange={(e) => setFoodSearchQuery(e.target.value)}
                    placeholder="Search…"
                    className="min-w-0 w-full bg-transparent text-xs text-[#1b2733] placeholder:text-[#5a6b7d] outline-none"
                    aria-label="Search foods"
                  />
                </label>
              </div>
              <p className="mt-0.5 text-xs text-[#5a6b7d]">
                {isSearching ? 'Results from all food groups' : 'Tap a food to add it to this meal'}
              </p>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
              {loadingFoods && (
                <p className="text-sm text-[#5a6b7d]">Loading foods…</p>
              )}
              {foodError && (
                <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{foodError}</p>
              )}
              {!loadingFoods && !foodError && filteredFoods.length === 0 && (
                <p className="text-sm text-[#5a6b7d]">
                  {isSearching ? 'No foods match your search.' : 'No foods in this group yet.'}
                </p>
              )}
              {!loadingFoods &&
                filteredFoods.map((food) => (
                  <FoodListCard key={food.id} food={food} showGroup={isSearching} onAdd={() => addFood(food)} />
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
