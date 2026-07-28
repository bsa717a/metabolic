import { useState } from 'react';
import type { AdminFood, FoodSource, FoodVisibility } from '../../types';
import { api } from '../../services/api';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import { NumberInput } from '../ui/NumberInput';

const sources: FoodSource[] = ['MANUAL', 'AI', 'IMPORTED', 'VERIFIED'];
const visibilities: FoodVisibility[] = ['GLOBAL', 'USER'];

type FoodDraft = {
  name: string;
  brand: string;
  servingSize: string;
  servingUnit: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  source: FoodSource;
  visibility: FoodVisibility;
  verified: boolean;
};

function toDraft(food: AdminFood): FoodDraft {
  return {
    name: food.name,
    brand: food.brand ?? '',
    servingSize: String(food.servingSize),
    servingUnit: food.servingUnit,
    calories: String(food.calories),
    protein: String(food.protein),
    carbs: String(food.carbs),
    fat: String(food.fat),
    source: food.source,
    visibility: food.visibility,
    verified: food.verified
  };
}

function labelClassName() {
  return 'mb-1 block text-sm font-medium text-app-text-muted';
}

function inputClassName() {
  return 'w-full rounded-xl border border-app-border bg-app-surface px-3 py-2 text-sm text-app-text outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200';
}

function parseNumber(value: string, label: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a valid number.`);
  return parsed;
}

export function EditFoodDrawer({
  open,
  food,
  onClose,
  onSaved
}: {
  open: boolean;
  food?: AdminFood;
  onClose: () => void;
  onSaved: (food: AdminFood) => void;
}) {
  return (
    <Drawer open={open} title={food ? food.name : 'Edit food'} onClose={onClose}>
      {open && food && <EditFoodDrawerContent key={food.id} food={food} onClose={onClose} onSaved={onSaved} />}
    </Drawer>
  );
}

function EditFoodDrawerContent({
  food,
  onClose,
  onSaved
}: {
  food: AdminFood;
  onClose: () => void;
  onSaved: (food: AdminFood) => void;
}) {
  const [draft, setDraft] = useState(() => toDraft(food));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function updateDraft<K extends keyof FoodDraft>(field: K, value: FoodDraft[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const servingSize = parseNumber(draft.servingSize, 'Serving size');
      const calories = parseNumber(draft.calories, 'Calories');
      const protein = parseNumber(draft.protein, 'Protein');
      const carbs = parseNumber(draft.carbs, 'Carbs');
      const fat = parseNumber(draft.fat, 'Fat');
      if (!draft.name.trim()) throw new Error('Name is required.');
      if (!draft.servingUnit.trim()) throw new Error('Serving unit is required.');
      if (servingSize <= 0) throw new Error('Serving size must be greater than zero.');

      const updated = await api<AdminFood>(`/api/admin/foods/${food.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: draft.name.trim(),
          brand: draft.brand.trim() ? draft.brand.trim() : null,
          servingSize,
          servingUnit: draft.servingUnit.trim(),
          calories,
          protein,
          carbs,
          fat,
          source: draft.source,
          visibility: draft.visibility,
          verified: draft.verified
        })
      });
      onSaved(updated);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save food');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-app-text-muted">Update nutrition details and database flags.</p>

      <label className="block">
        <span className={labelClassName()}>Name</span>
        <input className={inputClassName()} value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} />
      </label>

      <label className="block">
        <span className={labelClassName()}>Brand</span>
        <input className={inputClassName()} value={draft.brand} onChange={(event) => updateDraft('brand', event.target.value)} placeholder="Optional" />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className={labelClassName()}>Serving size</span>
          <NumberInput className={inputClassName()} step="0.01" value={draft.servingSize} onChange={(value) => updateDraft('servingSize', value)} />
        </label>
        <label className="block">
          <span className={labelClassName()}>Serving unit</span>
          <input className={inputClassName()} value={draft.servingUnit} onChange={(event) => updateDraft('servingUnit', event.target.value)} />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className={labelClassName()}>Calories</span>
          <NumberInput className={inputClassName()} step="0.01" value={draft.calories} onChange={(value) => updateDraft('calories', value)} />
        </label>
        <label className="block">
          <span className={labelClassName()}>Protein (g)</span>
          <NumberInput className={inputClassName()} step="0.01" value={draft.protein} onChange={(value) => updateDraft('protein', value)} />
        </label>
        <label className="block">
          <span className={labelClassName()}>Carbs (g)</span>
          <NumberInput className={inputClassName()} step="0.01" value={draft.carbs} onChange={(value) => updateDraft('carbs', value)} />
        </label>
        <label className="block">
          <span className={labelClassName()}>Fat (g)</span>
          <NumberInput className={inputClassName()} step="0.01" value={draft.fat} onChange={(value) => updateDraft('fat', value)} />
        </label>
      </div>

      <label className="block">
        <span className={labelClassName()}>Source</span>
        <select className={inputClassName()} value={draft.source} onChange={(event) => updateDraft('source', event.target.value as FoodSource)}>
          {sources.map((source) => (
            <option key={source} value={source}>
              {source}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className={labelClassName()}>Visibility</span>
        <select className={inputClassName()} value={draft.visibility} onChange={(event) => updateDraft('visibility', event.target.value as FoodVisibility)}>
          {visibilities.map((visibility) => (
            <option key={visibility} value={visibility}>
              {visibility}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2 text-sm text-app-text">
        <input type="checkbox" checked={draft.verified} onChange={(event) => updateDraft('verified', event.target.checked)} />
        Verified food
      </label>

      {food.aiGenerated && <p className="text-xs text-app-text-muted">This food was AI-generated.</p>}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3 pt-2">
        <Button disabled={saving} onClick={save}>
          {saving ? 'Saving...' : 'Save changes'}
        </Button>
        <Button variant="secondary" disabled={saving} onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
