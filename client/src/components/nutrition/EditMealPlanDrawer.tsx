import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import type { Food, Meal, MealItem } from '../../types';
import { Button } from '../ui/Button';
import { NumberInput } from '../ui/NumberInput';
import { QuantityInput } from '../ui/QuantityInput';
import { plannedTimeToInputValue } from '../../utils/plannedTime';
import { Drawer } from '../ui/Drawer';
import { FoodSearch } from './FoodSearch';

type MealEditMode = 'PLANNED' | 'ACTUAL';

const MODE_CONFIG = {
  PLANNED: {
    title: 'Edit plan',
    foodsLabel: 'Planned foods',
    emptyLabel: 'No foods planned yet.',
    panelClass: 'bg-brand-gold/10 ring-brand-gold/20',
    aiLabel: 'Ask AI to plan',
    manualHint: 'Adding or editing foods recalculates planned totals automatically.',
    totals: (meal: Meal) => ({
      calories: Math.round(Number(meal.plannedCalories)),
      protein: Math.round(Number(meal.plannedProtein)),
      carbs: Math.round(Number(meal.plannedCarbs)),
      fat: Math.round(Number(meal.plannedFat))
    }),
    patchFields: (manual: { calories: number; protein: number; carbs: number; fat: number }) => ({
      plannedCalories: manual.calories,
      plannedProtein: manual.protein,
      plannedCarbs: manual.carbs,
      plannedFat: manual.fat
    })
  },
  ACTUAL: {
    title: 'Log actual',
    foodsLabel: 'Logged foods',
    emptyLabel: 'Nothing logged yet.',
    panelClass: 'bg-brand-green/10 ring-brand-green/20',
    aiLabel: 'Ask AI to log',
    manualHint: 'Adding or editing foods recalculates actual totals automatically.',
    totals: (meal: Meal) => ({
      calories: Math.round(Number(meal.actualCalories)),
      protein: Math.round(Number(meal.actualProtein)),
      carbs: Math.round(Number(meal.actualCarbs)),
      fat: Math.round(Number(meal.actualFat))
    }),
    patchFields: (manual: { calories: number; protein: number; carbs: number; fat: number }) => ({
      actualCalories: manual.calories,
      actualProtein: manual.protein,
      actualCarbs: manual.carbs,
      actualFat: manual.fat
    })
  }
} as const;

function formatMacros(item: Pick<MealItem, 'calories' | 'protein' | 'carbs' | 'fat'>) {
  return `${Math.round(Number(item.calories))} kcal · ${Math.round(Number(item.protein))}g P · ${Math.round(Number(item.carbs))}g C · ${Math.round(Number(item.fat))}g F`;
}

export function EditMealPlanDrawer({
  open,
  meal,
  mode = 'PLANNED',
  onClose,
  onSaved,
  onAskAi
}: {
  open: boolean;
  meal?: Meal;
  mode?: MealEditMode;
  onClose: () => void;
  onSaved: () => void;
  onAskAi: (mealId: string, mode: MealEditMode) => void;
}) {
  const config = MODE_CONFIG[mode];
  const items = meal?.items.filter((item) => item.type === mode) ?? [];
  const hasItems = items.length > 0;
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  const [plannedTime, setPlannedTime] = useState('');
  const [savingTime, setSavingTime] = useState(false);
  const [timeError, setTimeError] = useState<string | null>(null);

  useEffect(() => {
    if (!meal) return;
    setManual(MODE_CONFIG[mode].totals(meal));
    setPlannedTime(plannedTimeToInputValue(meal.plannedTime));
    setTimeError(null);
    setManualOpen(false);
  }, [meal, mode]);

  function requirePlannedTime(): boolean {
    if (plannedTime.trim()) return true;
    setTimeError('Meal time is required.');
    return false;
  }

  async function addFood(food: Food) {
    if (!meal || !requirePlannedTime()) return;
    await api(`/api/meals/${meal.id}/items`, {
      method: 'POST',
      body: JSON.stringify({
        type: mode,
        foodId: food.id,
        nameSnapshot: food.name,
        quantity: Number(food.servingSize) || 1,
        unit: food.servingUnit,
        calories: Number(food.calories),
        protein: Number(food.protein),
        carbs: Number(food.carbs),
        fat: Number(food.fat)
      })
    });
    onSaved();
  }

  async function updateQuantity(item: MealItem, quantity: number) {
    if (!requirePlannedTime()) return;
    const factor = quantity / Number(item.quantity);
    await api(`/api/meal-items/${item.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        quantity,
        calories: Number(item.calories) * factor,
        protein: Number(item.protein) * factor,
        carbs: Number(item.carbs) * factor,
        fat: Number(item.fat) * factor
      })
    });
    onSaved();
  }

  async function removeItem(itemId: string) {
    if (!requirePlannedTime()) return;
    await api(`/api/meal-items/${itemId}`, { method: 'DELETE' });
    onSaved();
  }

  async function saveManual() {
    if (!meal || !requirePlannedTime()) return;
    await api(`/api/meals/${meal.id}`, {
      method: 'PATCH',
      body: JSON.stringify(config.patchFields(manual))
    });
    onSaved();
    onClose();
  }

  async function savePlannedTime() {
    if (!meal) return;
    if (!plannedTime) {
      setTimeError('Meal time is required.');
      return;
    }
    setSavingTime(true);
    setTimeError(null);
    try {
      await api(`/api/meals/${meal.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ plannedTime })
      });
      onSaved();
    } catch (error) {
      setTimeError(error instanceof Error ? error.message : 'Could not save meal time.');
    } finally {
      setSavingTime(false);
    }
  }

  return (
    <Drawer open={open} title={meal ? `${config.title} — ${meal.name}` : config.title} onClose={onClose}>
      <div className="space-y-6">
        <div className="rounded-2xl border border-app-border bg-app-muted p-4">
          <label className="text-sm font-semibold text-app-text" htmlFor="meal-planned-time">
            Meal time <span className="text-red-600">*</span>
          </label>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              id="meal-planned-time"
              type="time"
              required
              className="rounded-xl border border-app-border bg-app-surface px-3 py-2 text-app-text"
              value={plannedTime}
              onChange={(event) => setPlannedTime(event.target.value)}
              disabled={!meal || savingTime}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => void savePlannedTime()}
              disabled={!meal || savingTime || !plannedTime || plannedTime === plannedTimeToInputValue(meal.plannedTime)}
            >
              {savingTime ? 'Saving...' : 'Save time'}
            </Button>
          </div>
          {timeError && <p className="mt-2 text-sm text-red-600">{timeError}</p>}
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-app-text">{config.foodsLabel}</p>
          {items.length === 0 ? (
            <p className="rounded-2xl bg-app-muted p-4 text-sm text-app-text-muted">{config.emptyLabel}</p>
          ) : (
            <ul className="space-y-2">
              {items.map((item) => (
                <li key={item.id} className={`flex items-center justify-between gap-2 rounded-2xl p-3 ring-1 ${config.panelClass}`}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-app-text">{item.nameSnapshot}</p>
                    <p className="text-xs text-app-text-muted">{formatMacros(item)}</p>
                  </div>
                  <QuantityInput
                    className="w-16 rounded-lg border border-app-border bg-app-surface px-2 py-1 text-sm text-app-text"
                    value={Number(item.quantity)}
                    onChange={(quantity) => void updateQuantity(item, quantity)}
                    aria-label={`Quantity for ${item.nameSnapshot}`}
                  />
                  <button type="button" className="text-sm text-app-text-muted hover:text-red-500" onClick={() => removeItem(item.id)}>×</button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <FoodSearch onSelect={addFood} />

        <Button type="button" className="w-full bg-blue-600 hover:bg-blue-700" onClick={() => meal && onAskAi(meal.id, mode)} disabled={!meal}>
          {config.aiLabel}
        </Button>

        {!hasItems && (
          <div className="border-t border-app-border pt-4">
            <button type="button" className="text-sm font-semibold text-app-text" onClick={() => setManualOpen(!manualOpen)}>
              {manualOpen ? 'Hide manual totals' : 'Set totals manually'}
            </button>
            {manualOpen && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                {(['calories', 'protein', 'carbs', 'fat'] as const).map((field) => (
                  <label key={field} className="text-sm">
                    <span className="mb-1 block capitalize text-app-text-muted">{field === 'calories' ? 'Kcal' : `${field} (g)`}</span>
                    <NumberInput
                      min={0}
                      step={1}
                      className="w-full rounded-xl border border-app-border bg-app-surface px-3 py-2 text-app-text"
                      value={manual[field]}
                      onChange={(value) => setManual({ ...manual, [field]: value })}
                    />
                  </label>
                ))}
                <div className="col-span-2">
                  <Button type="button" onClick={saveManual}>Save manual totals</Button>
                </div>
              </div>
            )}
          </div>
        )}

        {hasItems && <p className="text-xs text-app-text-muted">{config.manualHint}</p>}
      </div>
    </Drawer>
  );
}
