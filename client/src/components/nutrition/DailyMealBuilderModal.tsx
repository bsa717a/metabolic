import { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { createPortal } from 'react-dom';
import { Pencil, Plus, X } from 'lucide-react';
import { api } from '../../services/api';
import {
  DAILY_GOALS,
  FOOD_GROUPS,
  GROUP_COLORS,
  GROUP_EMOJI_ROLE,
  emptyFoodsByGroup,
  emptyFoodsByGroupCatalog,
  mealTotals,
  sortGroups,
  type AddedFoodEntry,
  type BuilderFood,
  type FoodGroup,
  type FoodsByGroup,
  type MacroTotals
} from '../../data/mealBuilderGroups';
import { foodEmoji } from '../../utils/foodEmoji';

type PlanMeal = {
  id: string;
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

function createMeal(name: string, percentOfDay: number, editing = false): PlanMeal {
  return {
    id: crypto.randomUUID(),
    name,
    percentOfDay,
    groups: [...FOOD_GROUPS],
    foods: emptyFoodsByGroup(),
    editing
  };
}

function createSeedMeals(): PlanMeal[] {
  return SEED_MEALS.map(({ name, percentOfDay }) => createMeal(name, percentOfDay));
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

function FoodListCard({ food, onAdd }: { food: BuilderFood; onAdd: () => void }) {
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
        <div className="min-w-0">
          <p className="font-semibold text-[#1b2733]">{food.name}</p>
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
          max={60}
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

function MealRow({
  meal,
  selected,
  onSelectGroup,
  onToggleEdit,
  onUpdate,
  onDelete,
  onRemoveFood
}: {
  meal: PlanMeal;
  selected: Selection | null;
  onSelectGroup: (group: FoodGroup) => void;
  onToggleEdit: () => void;
  onUpdate: (patch: Partial<PlanMeal>) => void;
  onDelete: () => void;
  onRemoveFood: (group: FoodGroup, instanceId: string) => void;
}) {
  const totals = mealTotals(meal.foods);
  const targetKcal = Math.round((meal.percentOfDay / 100) * DAILY_GOALS.calories);
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
                  {items.map((item) => (
                    <li key={item.instanceId} className="flex items-center justify-between gap-2 text-xs text-[#1b2733]">
                      <span className="min-w-0 truncate">
                        <span aria-hidden>{foodEmoji(item.name, GROUP_EMOJI_ROLE[group])}</span>{' '}
                        {item.name}{' '}
                        <span className="text-[#5a6b7d]">{Math.round(item.calories)} kcal</span>
                      </span>
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
                  ))}
                </ul>
              )}
            </div>
          );
        })}
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
  hasExistingPlan = false,
  onSaved
}: {
  open: boolean;
  onClose: () => void;
  date: string;
  hasExistingPlan?: boolean;
  onSaved?: () => void | Promise<void>;
}) {
  const [meals, setMeals] = useState<PlanMeal[]>(createSeedMeals);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [catalog, setCatalog] = useState<FoodsByGroup | null>(null);
  const [foodError, setFoodError] = useState<string | null>(null);
  const [pushForwardDays, setPushForwardDays] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [prevOpenKey, setPrevOpenKey] = useState(false);
  if (open !== prevOpenKey) {
    setPrevOpenKey(open);
    if (open) {
      const seeded = createSeedMeals();
      setMeals(seeded);
      setSelection({ mealId: seeded[0].id, group: 'Protein' });
      setCatalog(null);
      setFoodError(null);
      setSaveError(null);
      setSaving(false);
      setPushForwardDays(0);
    }
  }

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
  const filteredFoods = catalog?.[selectedGroup] ?? [];
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
  }

  function addFood(food: BuilderFood) {
    if (!selectedMeal) return;
    const entry: AddedFoodEntry = {
      instanceId: crypto.randomUUID(),
      foodId: food.id,
      name: food.name,
      servingUnit: food.servingUnit,
      calories: food.calories,
      protein: food.protein,
      carbs: food.carbs,
      fat: food.fat
    };
    setMeals((prev) =>
      prev.map((meal) => {
        if (meal.id !== selectedMeal.id) return meal;
        const group = food.group;
        if (!meal.groups.includes(group)) return meal;
        return {
          ...meal,
          foods: { ...meal.foods, [group]: [...meal.foods[group], entry] }
        };
      })
    );
    setSelection({ mealId: selectedMeal.id, group: food.group });
  }

  function addMeal() {
    const meal = createMeal('New meal', 10, true);
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
    // Saving replaces the day's planned foods (and pushed-forward days), so warn before
    // clobbering an existing plan — the builder starts from an empty template each open.
    if (hasExistingPlan || pushForwardDays > 0) {
      const forwardNote =
        pushForwardDays > 0 ? ` and overwrite the plan on the next ${pushForwardDays} day${pushForwardDays === 1 ? '' : 's'}` : '';
      const dayNote = hasExistingPlan ? "This replaces this day's current planned foods" : 'This saves the plan to this day';
      if (!window.confirm(`${dayNote}${forwardNote}. Continue?`)) return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const payload = {
        meals: meals.map((meal, index) => ({
          mealNumber: index + 1,
          name: meal.name.trim() || `Meal ${index + 1}`,
          items: FOOD_GROUPS.flatMap((group) =>
            meal.foods[group].map((entry) => ({
              foodId: entry.foodId,
              name: entry.name,
              quantity: 1,
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
              <input
                type="number"
                min={0}
                max={31}
                value={pushForwardDays}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setPushForwardDays(Number.isFinite(next) ? Math.min(31, Math.max(0, Math.trunc(next))) : 0);
                }}
                className="w-14 rounded-md border border-[#dde3e8] bg-white px-2 py-1 text-center text-sm font-semibold text-[#1b2733] outline-none focus:border-[#3b82f6]"
              />
              <span className="font-semibold">days</span>
            </label>
            <button
              type="button"
              onClick={() => void savePlan()}
              disabled={saving || !hasPlannedFood}
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
              {meals.map((meal) => (
                <MealRow
                  key={meal.id}
                  meal={meal}
                  selected={selection}
                  onSelectGroup={(group) => setSelection({ mealId: meal.id, group })}
                  onToggleEdit={() => updateMeal(meal.id, { editing: !meal.editing })}
                  onUpdate={(patch) => updateMeal(meal.id, patch)}
                  onDelete={() => deleteMeal(meal.id)}
                  onRemoveFood={(group, instanceId) => removeFood(meal.id, group, instanceId)}
                />
              ))}
              <button
                type="button"
                onClick={addMeal}
                className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#c5d0da] py-3 text-sm font-semibold text-[#5a6b7d] transition hover:border-[#3b82f6] hover:text-[#1e4a8a]"
              >
                <Plus className="h-4 w-4" />
                Add meal or snack
              </button>
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
              <h3 className="font-bold text-[#1b2733]">
                {selectedGroup} for {selectedMeal?.name ?? '—'}
              </h3>
              <p className="mt-0.5 text-xs text-[#5a6b7d]">Tap a food to add it to this meal</p>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
              {loadingFoods && (
                <p className="text-sm text-[#5a6b7d]">Loading foods…</p>
              )}
              {foodError && (
                <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{foodError}</p>
              )}
              {!loadingFoods && !foodError && filteredFoods.length === 0 && (
                <p className="text-sm text-[#5a6b7d]">No foods in this group yet.</p>
              )}
              {!loadingFoods &&
                filteredFoods.map((food) => (
                  <FoodListCard key={food.id} food={food} onAdd={() => addFood(food)} />
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
