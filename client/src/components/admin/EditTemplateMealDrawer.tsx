import { useState } from 'react';
import { api } from '../../services/api';
import type { Food, NutritionTemplateMeal, NutritionTemplateMealItem } from '../../types';
import { Drawer } from '../ui/Drawer';
import { QuantityInput } from '../ui/QuantityInput';
import { FoodSearch } from '../nutrition/FoodSearch';

function formatMacros(item: Pick<NutritionTemplateMealItem, 'calories' | 'protein' | 'carbs' | 'fat'>) {
  return `${Math.round(Number(item.calories))} kcal · ${Math.round(Number(item.protein))}g P · ${Math.round(Number(item.carbs))}g C · ${Math.round(Number(item.fat))}g F`;
}

export function EditTemplateMealDrawer({
  open,
  meal,
  onClose,
  onSaved
}: {
  open: boolean;
  meal?: NutritionTemplateMeal;
  onClose: () => void;
  onSaved: () => void;
}) {
  const items = meal?.items ?? [];

  const [addError, setAddError] = useState('');

  async function addFood(food: Food) {
    if (!meal) return;
    setAddError('');
    try {
      await api(`/api/admin/nutrition-template-meals/${meal.id}/items`, {
        method: 'POST',
        body: JSON.stringify({
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
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Could not add food');
    }
  }

  async function updateQuantity(item: NutritionTemplateMealItem, quantity: number) {
    const factor = quantity / Number(item.quantity);
    await api(`/api/admin/nutrition-template-meal-items/${item.id}`, {
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
    await api(`/api/admin/nutrition-template-meal-items/${itemId}`, { method: 'DELETE' });
    onSaved();
  }

  return (
    <Drawer open={open} title={meal ? `Edit meal — ${meal.name}` : 'Edit meal'} onClose={onClose}>
      <div className="space-y-6">
        <div>
          <p className="mb-2 text-sm font-semibold text-app-text">Add food</p>
          <FoodSearch onSelect={addFood} dropUp />
          {addError && <p className="mt-2 text-sm text-red-600">{addError}</p>}
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-app-text">Planned foods</p>
          {items.length === 0 ? (
            <p className="rounded-2xl bg-app-muted p-4 text-sm text-app-text-muted">No foods in this meal yet.</p>
          ) : (
            <ul className="space-y-2">
              {items.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-2 rounded-2xl bg-yellow-50 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{item.nameSnapshot}</p>
                    <p className="text-xs text-app-text-muted">{formatMacros(item)}</p>
                  </div>
                  <QuantityInput
                    className="w-16 rounded-lg border border-app-border px-2 py-1 text-sm"
                    value={Number(item.quantity)}
                    onChange={(quantity) => void updateQuantity(item, quantity)}
                    aria-label={`Quantity for ${item.nameSnapshot}`}
                  />
                  <button type="button" className="text-sm text-app-text-muted hover:text-red-600" onClick={() => void removeItem(item.id)}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Drawer>
  );
}
