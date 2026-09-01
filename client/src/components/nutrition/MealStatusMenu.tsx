import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Meal } from '../../types';
import { api } from '../../services/api';
import { Badge } from '../ui/Badge';
import { actualItemsOf, plannedItemsOf, statusLabel } from './weekly/weeklyHelpers';

function mealStatusTone(status: string): 'green' | 'slate' {
  return status.includes('EATEN') ? 'green' : 'slate';
}

function matchesPlannedItem(actual: Meal['items'][number], planned: Meal['items'][number]) {
  return (
    actual.nameSnapshot === planned.nameSnapshot &&
    Number(actual.quantity) === Number(planned.quantity) &&
    (actual.foodId ?? null) === (planned.foodId ?? null)
  );
}

function hasOffPlanActuals(meal: Meal) {
  const plannedItems = plannedItemsOf(meal);
  return actualItemsOf(meal).some(
    (actual) => !actual.linkedPlannedItemId && !plannedItems.some((planned) => matchesPlannedItem(actual, planned))
  );
}

function canMarkMealEaten(meal: Meal) {
  return plannedItemsOf(meal).length > 0 && meal.status !== 'EATEN_AS_PLANNED' && !hasOffPlanActuals(meal);
}

export function MealStatusMenu({
  meal,
  onChange
}: {
  meal: Meal;
  onChange: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const label = statusLabel(meal.status);
  const tone = mealStatusTone(meal.status);
  const interactive = canMarkMealEaten(meal);

  useEffect(() => {
    if (!open) return;

    function handlePointer(event: MouseEvent) {
      if (ref.current?.contains(event.target as Node)) return;
      setOpen(false);
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  async function markEaten() {
    setOpen(false);
    setSaving(true);
    setError(null);
    try {
      await api(`/api/meals/${meal.id}/mark-eaten-as-planned`, { method: 'POST' });
      await onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not mark this meal as eaten.');
    } finally {
      setSaving(false);
    }
  }

  if (!interactive) {
    return <Badge tone={tone}>{label}</Badge>;
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        className="inline-flex items-center gap-0.5 rounded-full bg-app-surface px-2.5 py-1 text-xs font-semibold text-app-text-muted transition hover:text-app-text"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${label}. Change meal status`}
        disabled={saving}
        onClick={() => setOpen((current) => !current)}
      >
        {saving ? 'Saving…' : label}
        <ChevronDown size={12} aria-hidden className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul
          role="menu"
          className="absolute right-0 z-50 mt-1 min-w-[10.5rem] rounded-xl border border-app-border bg-app-surface py-1 shadow-lg"
        >
          <li>
            <button
              type="button"
              role="menuitem"
              className="w-full px-3 py-2 text-left text-sm text-app-text transition hover:bg-app-muted"
              onClick={() => void markEaten()}
            >
              Ate as planned
            </button>
          </li>
        </ul>
      )}
      {error && <p className="absolute right-0 top-full z-50 mt-1 w-48 text-right text-xs text-red-600">{error}</p>}
    </div>
  );
}
