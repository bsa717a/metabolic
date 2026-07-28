import { useState } from 'react';
import type { FoodVisibility, ReviewFood } from '../../types';
import { api } from '../../services/api';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import { NumberInput } from '../ui/NumberInput';

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
  visibility: FoodVisibility;
};

function toDraft(food: ReviewFood): FoodDraft {
  return {
    name: food.name,
    brand: food.brand ?? '',
    servingSize: String(food.servingSize),
    servingUnit: food.servingUnit,
    calories: String(food.calories),
    protein: String(food.protein),
    carbs: String(food.carbs),
    fat: String(food.fat),
    visibility: food.visibility
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

function buildPayload(draft: FoodDraft) {
  const servingSize = parseNumber(draft.servingSize, 'Serving size');
  const calories = parseNumber(draft.calories, 'Calories');
  const protein = parseNumber(draft.protein, 'Protein');
  const carbs = parseNumber(draft.carbs, 'Carbs');
  const fat = parseNumber(draft.fat, 'Fat');
  if (!draft.name.trim()) throw new Error('Name is required.');
  if (!draft.servingUnit.trim()) throw new Error('Serving unit is required.');
  if (servingSize <= 0) throw new Error('Serving size must be greater than zero.');

  return {
    name: draft.name.trim(),
    brand: draft.brand.trim() ? draft.brand.trim() : null,
    servingSize,
    servingUnit: draft.servingUnit.trim(),
    calories,
    protein,
    carbs,
    fat,
    visibility: draft.visibility
  };
}

export function ReviewFoodDrawer({
  open,
  food,
  onClose,
  onApproved,
  onSaved,
  onRejected
}: {
  open: boolean;
  food?: ReviewFood;
  onClose: () => void;
  onApproved: () => void;
  onSaved: (food: ReviewFood) => void;
  onRejected: () => void;
}) {
  return (
    <Drawer open={open} title={food ? `Review — ${food.name}` : 'Review food'} onClose={onClose}>
      {open && food && (
        <ReviewFoodDrawerContent
          key={food.id}
          food={food}
          onClose={onClose}
          onApproved={onApproved}
          onSaved={onSaved}
          onRejected={onRejected}
        />
      )}
    </Drawer>
  );
}

function ReviewFoodDrawerContent({
  food,
  onClose,
  onApproved,
  onSaved,
  onRejected
}: {
  food: ReviewFood;
  onClose: () => void;
  onApproved: () => void;
  onSaved: (food: ReviewFood) => void;
  onRejected: () => void;
}) {
  const [draft, setDraft] = useState(() => toDraft(food));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function updateDraft<K extends keyof FoodDraft>(field: K, value: FoodDraft[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function saveChanges() {
    setSaving(true);
    setError('');
    try {
      const updated = await api<ReviewFood>(`/api/admin/foods/${food.id}`, {
        method: 'PATCH',
        body: JSON.stringify(buildPayload(draft))
      });
      onSaved({ ...food, ...updated });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save food');
    } finally {
      setSaving(false);
    }
  }

  async function approve() {
    setSaving(true);
    setError('');
    try {
      await api(`/api/admin/food-review/${food.id}/approve`, {
        method: 'POST',
        body: JSON.stringify(buildPayload(draft))
      });
      onApproved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to approve food');
    } finally {
      setSaving(false);
    }
  }

  async function reject() {
    if (!confirm(`Reject "${food.name}" and remove it from the database?`)) return;
    setSaving(true);
    setError('');
    try {
      await api(`/api/admin/food-review/${food.id}`, { method: 'DELETE' });
      onRejected();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reject food');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-violet-50 p-4 text-sm text-violet-900">
        <p className="font-semibold">AI submission</p>
        {food.inputText && <p className="mt-1">Original prompt: “{food.inputText}”</p>}
        {food.confidence != null && <p className="mt-1">Confidence: {food.confidence.toFixed(0)}%</p>}
        {food.createdBy && (
          <p className="mt-1">
            Submitted by {food.createdBy.firstName} {food.createdBy.lastName} ({food.createdBy.email})
          </p>
        )}
      </div>

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
        <span className={labelClassName()}>Publish as</span>
        <select className={inputClassName()} value={draft.visibility} onChange={(event) => updateDraft('visibility', event.target.value as FoodVisibility)}>
          {visibilities.map((visibility) => (
            <option key={visibility} value={visibility}>
              {visibility}
            </option>
          ))}
        </select>
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-col gap-3 pt-2">
        <Button disabled={saving} onClick={approve}>
          {saving ? 'Working...' : 'Approve & publish'}
        </Button>
        <Button variant="secondary" disabled={saving} onClick={saveChanges}>
          Save changes
        </Button>
        <Button variant="secondary" disabled={saving} onClick={reject}>
          Reject
        </Button>
        <Button variant="secondary" disabled={saving} onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
