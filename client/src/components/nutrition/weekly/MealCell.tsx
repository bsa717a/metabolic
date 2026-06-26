import { useState } from 'react';
import { clsx } from 'clsx';
import type { Meal, MealItem } from '../../../types';
import { api } from '../../../services/api';
import {
  actualItemsOf,
  extraActualItemsOf,
  formatItemLine,
  isPlannedItemLogged,
  plannedItemsOf,
  statusDotClass,
  statusLabel
} from './weeklyHelpers';

function PlannedItemRow({
  item,
  logged,
  toggling,
  future,
  onToggle
}: {
  item: MealItem;
  logged: boolean;
  toggling: boolean;
  future: boolean;
  onToggle: (checked: boolean) => void;
}) {
  return (
    <div className="group flex items-center gap-1.5">
      {!future && (
        <input
          type="checkbox"
          className="h-3.5 w-3.5 shrink-0 cursor-pointer rounded border-app-border"
          checked={logged}
          disabled={toggling}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => onToggle(event.target.checked)}
          aria-label={`Log ${item.nameSnapshot} as eaten`}
        />
      )}
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-gold" />
      <span className={clsx('min-w-0 flex-1 truncate text-xs', logged && 'text-app-text-muted line-through')}>
        {formatItemLine(item)}
      </span>
    </div>
  );
}

export function MealCell({
  mealName,
  meal,
  future,
  selected,
  onSelect,
  onChange
}: {
  mealName: string;
  meal?: Meal;
  future: boolean;
  selected: boolean;
  onSelect: () => void;
  onChange: () => void | Promise<void>;
}) {
  const [pendingLogged, setPendingLogged] = useState<Record<string, boolean>>({});
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const planned = meal ? plannedItemsOf(meal) : [];
  const actuals = meal ? actualItemsOf(meal) : [];
  const extras = meal ? extraActualItemsOf(meal) : [];
  const isEmpty = planned.length === 0 && extras.length === 0;

  function itemLogged(item: MealItem) {
    if (item.id in pendingLogged) return pendingLogged[item.id];
    return isPlannedItemLogged(item, actuals);
  }

  async function toggle(item: MealItem, checked: boolean) {
    setToggleError(null);
    setTogglingId(item.id);
    setPendingLogged((prev) => ({ ...prev, [item.id]: checked }));
    try {
      await api(`/api/meal-items/${item.id}/set-logged`, { method: 'POST', body: JSON.stringify({ logged: checked }) });
      await onChange();
    } catch (error) {
      setToggleError(error instanceof Error ? error.message : 'Could not update this item.');
    } finally {
      setPendingLogged((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      setTogglingId(null);
    }
  }

  const plannedKcal = meal ? Math.round(Number(meal.plannedCalories)) : 0;
  const actualKcal = meal ? Math.round(Number(meal.actualCalories)) : 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
      className={clsx(
        'flex min-h-[5.5rem] w-full cursor-pointer flex-col rounded-2xl border bg-app-surface p-2 text-left transition',
        isEmpty ? 'border-dashed' : 'border-solid',
        selected
          ? 'border-brand-green ring-2 ring-brand-green/30'
          : 'border-app-border hover:border-app-text-muted/40'
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="truncate text-xs font-semibold text-app-text">{mealName}</span>
        {!isEmpty && (
          <span className="shrink-0 text-[0.7rem] tabular-nums text-app-text-muted">
            {actualKcal}/{plannedKcal}
          </span>
        )}
      </div>

      {isEmpty ? (
        <span className="mt-1 text-xs italic text-app-text-muted">+ add foods</span>
      ) : (
        <>
          {toggleError && <p className="mt-1 text-[0.65rem] text-red-600">{toggleError}</p>}
          <div className="mt-1 flex min-w-0 items-center gap-1">
            <span className={clsx('h-2 w-2 shrink-0 rounded-full', statusDotClass(meal!.status))} />
            <span className="truncate text-[0.7rem] font-medium text-app-text-muted">
              {statusLabel(meal!.status)}
            </span>
          </div>
          <div className="mt-1.5 flex flex-col gap-1">
            {planned.map((item) => (
              <PlannedItemRow
                key={item.id}
                item={item}
                future={future}
                logged={itemLogged(item)}
                toggling={togglingId === item.id}
                onToggle={(checked) => void toggle(item, checked)}
              />
            ))}
            {extras.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-1.5 rounded-lg bg-brand-gold/15 px-1.5 py-0.5 ring-1 ring-brand-gold/20"
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-gold" />
                <span className="min-w-0 flex-1 truncate text-xs font-medium">{formatItemLine(item)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
