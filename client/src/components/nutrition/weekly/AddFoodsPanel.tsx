import { useEffect, useState } from 'react';
import { Plus, Sparkles } from 'lucide-react';
import { api } from '../../../services/api';
import type { Food, Meal } from '../../../types';
import { FoodSearch } from '../FoodSearch';
import { LogDifferentFoodModal } from '../LogDifferentFoodModal';
import { addFoodToMeal } from './weeklyHelpers';

function RecentFoodRow({
  food,
  canAdd,
  onAdd
}: {
  food: Food;
  canAdd: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-app-text">{food.name}</p>
        <p className="truncate text-xs text-app-text-muted">
          {Math.round(Number(food.calories))} kcal · {Math.round(Number(food.protein))}g P
        </p>
      </div>
      <button
        type="button"
        aria-label={`Add ${food.name} to selected meal`}
        title={canAdd ? 'Add to selected meal' : 'Select a meal first'}
        disabled={!canAdd}
        onClick={onAdd}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-app-muted text-app-text transition hover:bg-brand-green/20 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Plus size={15} />
      </button>
    </div>
  );
}

export function AddFoodsPanel({
  selectedMeal,
  selectedLabel,
  itemType = 'PLANNED',
  onChange
}: {
  selectedMeal?: Meal;
  selectedLabel?: string;
  itemType?: 'PLANNED' | 'ACTUAL';
  onChange: () => void | Promise<void>;
}) {
  const [recent, setRecent] = useState<Food[]>([]);
  const [busy, setBusy] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const verb = itemType === 'ACTUAL' ? 'Logging' : 'Adding';

  useEffect(() => {
    api<Food[]>('/api/foods/recent')
      .then(setRecent)
      .catch(() => setRecent([]));
  }, []);

  async function add(food: Food) {
    if (!selectedMeal || busy) return;
    setBusy(true);
    try {
      await addFoodToMeal(selectedMeal.id, food, itemType);
      await onChange();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-app-border bg-app-surface p-4 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-app-text-muted">Add foods</h3>
      </div>
      <p className="mt-1 text-xs text-app-text-muted">
        {selectedLabel ? (
          <>
            {verb} to <span className="font-medium text-app-text">{selectedLabel}</span>
            {itemType === 'ACTUAL' ? ' as food you ate (off-plan)' : ''}
          </>
        ) : (
          'Select a meal to add foods.'
        )}
      </p>

      <div className="mt-3 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <FoodSearch onSelect={(food) => void add(food)} />
        </div>
        <button
          type="button"
          aria-label="Describe a food for AI to estimate"
          title={selectedMeal ? 'Describe a food (AI estimate)' : 'Select a meal first'}
          disabled={!selectedMeal}
          onClick={() => setAiOpen(true)}
          className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-app-border bg-app-surface text-brand-green transition hover:bg-brand-green/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Sparkles size={20} />
        </button>
      </div>

      <LogDifferentFoodModal
        open={aiOpen}
        mealId={selectedMeal?.id}
        itemType={itemType}
        title={selectedLabel ? `Add food to ${selectedLabel}` : 'Add food'}
        onClose={() => setAiOpen(false)}
        onSaved={() => void onChange()}
      />

      <div className="mt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-app-text-muted">Recent</p>
        {recent.length === 0 ? (
          <p className="text-sm text-app-text-muted">No recent foods yet.</p>
        ) : (
          <div className="space-y-2.5">
            {recent.slice(0, 10).map((food, index) => (
              <RecentFoodRow
                key={`${food.id}-${index}`}
                food={food}
                canAdd={Boolean(selectedMeal) && !busy}
                onAdd={() => void add(food)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
