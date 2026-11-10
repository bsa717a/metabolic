import { useState } from 'react';
import type { Food } from '../../types';
import { api } from '../../services/api';
import { FoodSearch } from '../nutrition/FoodSearch';
import { Button } from '../ui/Button';
import { finishSavedFood, type SavedFoodStep } from './finishSavedFood';

export function MealFoodLookup({ mealId, mealName, onChange }: {
  mealId: string;
  mealName: string;
  onChange: () => void | Promise<void>;
}) {
  const [food, setFood] = useState<Food | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [type, setType] = useState<'ACTUAL' | 'PLANNED'>('ACTUAL');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pendingStep, setPendingStep] = useState<SavedFoodStep | null>(null);

  async function finish(step: SavedFoodStep) {
    setSaving(true);
    const result = await finishSavedFood(mealId, step, onChange);
    setPendingStep(result?.step ?? null);
    setError(result?.message ?? '');
    setSaving(false);
  }
  const amount = Number(quantity);
  const valid = Number.isFinite(amount) && amount > 0;
  const factor = food ? amount / (Number(food.servingSize) || 1) : 0;

  async function add() {
    if (!food || !valid || saving || pendingStep) return;
    setSaving(true);
    setError('');
    try {
      await api(`/api/meals/${mealId}/items`, {
        method: 'POST',
        body: JSON.stringify({
          type, foodId: food.id, nameSnapshot: food.name,
          quantity: amount, unit: food.servingUnit,
          calories: Number(food.calories) * factor,
          protein: Number(food.protein) * factor,
          carbs: Number(food.carbs) * factor,
          fat: Number(food.fat) * factor
        })
      });
      setFood(null);
      const step = type === 'PLANNED' ? 'apply-forward' : 'refresh';
      setPendingStep(step);
      await finish(step);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add this food.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2 border-t border-app-border p-3" aria-label={`Add food to ${mealName}`}>
      <p className="text-sm font-semibold text-app-text">Add food to {mealName}</p>
      {pendingStep ? (
        <Button disabled={saving} onClick={() => void finish(pendingStep)}>
          {saving ? 'Updating…' : pendingStep === 'refresh' ? 'Retry refresh' : 'Retry future-day update'}
        </Button>
      ) : !food ? (
        <>
          <FoodSearch compact onSelect={(selected) => {
            setFood(selected);
            setQuantity(String(Number(selected.servingSize) || 1));
            setError('');
          }} />
          <p className="text-xs text-app-text-muted">Search saved foods first. If no match is found, try AI lookup.</p>
        </>
      ) : (
        <div className="space-y-3">
          <p className="text-sm font-medium text-app-text">{food.name}</p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm text-app-text">
              Portion ({food.servingUnit})
              <input type="number" min="0.01" step="any" value={quantity} disabled={saving}
                onChange={(event) => setQuantity(event.target.value)}
                className="ml-2 w-24 rounded-xl border border-app-border bg-app-surface p-2" />
            </label>
            <select aria-label="Add food as" value={type} disabled={saving}
              onChange={(event) => setType(event.target.value as 'ACTUAL' | 'PLANNED')}
              className="rounded-xl border border-app-border bg-app-surface p-2 text-sm text-app-text">
              <option value="ACTUAL">Log as eaten</option>
              <option value="PLANNED">Add to plan</option>
            </select>
          </div>
          {type === 'PLANNED' && <p className="text-xs text-app-text-muted">Updates this meal from today forward. Days with logged food are left unchanged.</p>}
          {valid && <p className="text-xs text-app-text-muted">{Math.round(Number(food.calories) * factor)} kcal · {Math.round(Number(food.protein) * factor)}g protein · {Math.round(Number(food.carbs) * factor)}g carbs · {Math.round(Number(food.fat) * factor)}g fat</p>}
          <div className="flex gap-3">
            <Button disabled={!valid || saving} onClick={() => void add()}>{saving ? 'Adding…' : 'Add food'}</Button>
            <button type="button" disabled={saving} onClick={() => setFood(null)} className="text-sm text-app-text-muted">Cancel</button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
