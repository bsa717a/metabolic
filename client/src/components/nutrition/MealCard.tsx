import { useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { ChevronDown } from 'lucide-react';
import type { Meal } from '../../types';
import { api, isFuture } from '../../services/api';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { MealCardEditor, type MealMacroTargets } from './MealCardEditor';
import { MealMacroDetailsDrawer } from './MealMacroDetailsDrawer';
import { PlannedItemChecklist } from './PlannedItemChecklist';
import { DeleteMealScopeModal } from './DeleteMealScopeModal';

function formatPlannedTime(plannedTime?: string | null) {
  if (!plannedTime) return null;
  const match = plannedTime.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return plannedTime;
  const [, hour, minute] = match;
  return new Date(2000, 0, 1, Number(hour), Number(minute))
    .toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    .replace(' AM', 'am')
    .replace(' PM', 'pm');
}

function ActionsDropdown({
  future,
  onLogActual,
  onMarkEaten,
  onCopyFromYesterday,
  onAiSuggestions,
  onSwapMeal,
  onSaveAsPlan,
  onViewMacroDetails,
  onDeleteMeal,
}: {
  future: boolean;
  onLogActual: () => void;
  onMarkEaten: () => void;
  onCopyFromYesterday: () => void;
  onAiSuggestions: () => void;
  onSwapMeal: () => void;
  onSaveAsPlan: () => void;
  onViewMacroDetails: () => void;
  onDeleteMeal: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function action(fn: () => void) {
    setOpen(false);
    fn();
  }

  const items: { label: string; onClick: () => void; danger?: boolean }[] = [
    ...(!future
      ? [
          { label: 'Log actual intake', onClick: () => action(onLogActual) },
          { label: 'Mark as eaten', onClick: () => action(onMarkEaten) },
        ]
      : []),
    { label: 'Copy from yesterday', onClick: () => action(onCopyFromYesterday) },
    { label: 'AI Suggestions', onClick: () => action(onAiSuggestions) },
    { label: 'Swap this meal', onClick: () => action(onSwapMeal) },
    { label: 'Save as plan', onClick: () => action(onSaveAsPlan) },
    { label: 'View macro details', onClick: () => action(onViewMacroDetails) },
    { label: 'Delete meal', onClick: () => action(onDeleteMeal), danger: true },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Meal actions"
        aria-expanded={open}
        className="inline-flex h-9 items-center gap-1 rounded-xl px-3 text-sm text-app-text-muted transition hover:bg-app-muted hover:text-app-text"
        onClick={() => setOpen((v) => !v)}
      >
        Actions <ChevronDown size={14} />
      </button>
      {open && (
        <ul className="absolute right-0 z-50 mt-1 min-w-[200px] rounded-xl border border-app-border bg-app-surface py-1 shadow-lg">
          {items.map((item) => (
            <li key={item.label}>
              <button
                type="button"
                className={`w-full px-4 py-2 text-left text-sm transition ${
                  item.danger ? 'text-red-600 hover:bg-red-50' : 'text-app-text hover:bg-app-muted'
                }`}
                onClick={item.onClick}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MealCard({
  meal,
  selectedDate,
  onChange,
  isEditing,
  onEnterEditMode,
  onExitEditMode,
  onLogActual,
  onAiSuggestions,
  onSwapMeal,
  selected = false,
  onSelect,
  onBuildMeal,
  macroTargets,
  dailyTargets,
}: {
  meal: Meal;
  selectedDate: string;
  onChange: () => void | Promise<void>;
  isEditing: boolean;
  onEnterEditMode: (mealId: string) => void;
  onExitEditMode: () => void;
  onLogActual: (mealId: string) => void;
  onAiSuggestions: (meal: Meal) => void;
  onSwapMeal: (meal: Meal) => void;
  selected?: boolean;
  onSelect?: (mealId: string) => void;
  onBuildMeal?: () => void;
  macroTargets?: MealMacroTargets;
  dailyTargets?: MealMacroTargets | null;
}) {
  const future = isFuture(selectedDate);
  const plannedItems = (meal.items ?? []).filter((item) => item.type === 'PLANNED');
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleteScopeOpen, setDeleteScopeOpen] = useState(false);
  const [deletingMeal, setDeletingMeal] = useState(false);
  const [macroDetailsOpen, setMacroDetailsOpen] = useState(false);
  const plannedTime = formatPlannedTime(meal.plannedTime);

  async function markPlannedAsEaten() {
    setToggleError(null);
    try {
      await api(`/api/meals/${meal.id}/mark-eaten-as-planned`, { method: 'POST' });
      await onChange();
    } catch (error) {
      setToggleError(error instanceof Error ? error.message : 'Could not mark planned as eaten.');
    }
  }

  async function copyFromYesterday() {
    setActionError(null);
    try {
      await api(`/api/meals/${meal.id}/copy-from-previous-day`, { method: 'POST' });
      await onChange();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not copy from yesterday.');
    }
  }

  async function saveAsPlan() {
    setActionError(null);
    if (!window.confirm("Apply this meal's plan to the next 14 days? Days where you've already logged food are left alone.")) {
      return;
    }
    try {
      await api(`/api/meals/${meal.id}/apply-forward`, { method: 'POST' });
      await onChange();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not save plan forward.');
    }
  }

  function openDeleteMealScope() {
    setActionError(null);
    if (!plannedItems.length) {
      setActionError('This meal has no planned foods to delete.');
      return;
    }
    setDeleteScopeOpen(true);
  }

  async function deleteMealPlan(scope: 'today' | 'forward') {
    setActionError(null);
    setDeletingMeal(true);
    try {
      await api(`/api/meals/${meal.id}/clear-planned`, {
        method: 'POST',
        body: JSON.stringify({ applyForward: scope === 'forward' })
      });
      setDeleteScopeOpen(false);
      await onChange();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not delete meal plan.');
      await onChange();
    } finally {
      setDeletingMeal(false);
    }
  }

  const [editorKey, setEditorKey] = useState(0);

  async function refreshAfterSaveFailure() {
    await onChange();
    setEditorKey((key) => key + 1);
  }

  return (
    <div onClick={() => onSelect?.(meal.id)}>
      <Card
        className={clsx(
          onSelect && 'cursor-pointer',
          selected && 'border-brand-green ring-2 ring-brand-green/30'
        )}
      >
      {isEditing ? (
        <MealCardEditor
          key={editorKey}
          meal={meal}
          macroTargets={macroTargets}
          dailyTargets={dailyTargets}
          onSaved={() => {
            onExitEditMode();
            void onChange();
          }}
          onCancel={onExitEditMode}
          onRefresh={refreshAfterSaveFailure}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-app-text-muted">Meal {meal.mealNumber}</p>
              <h3 className="text-lg font-bold">
                {plannedTime ? `${meal.name} — ${plannedTime}` : meal.name}
              </h3>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-1">
              {onBuildMeal && (
                <button
                  type="button"
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-brand-green px-3 text-sm font-semibold text-white transition hover:bg-brand-deep"
                  onClick={onBuildMeal}
                >
                  🃏 Build
                </button>
              )}
              <button
                type="button"
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100"
                onClick={() => onEnterEditMode(meal.id)}
              >
                Edit plan
              </button>
              <ActionsDropdown
                future={future}
                onLogActual={() => onLogActual(meal.id)}
                onMarkEaten={() => void markPlannedAsEaten()}
                onCopyFromYesterday={() => void copyFromYesterday()}
                onAiSuggestions={() => onAiSuggestions(meal)}
                onSwapMeal={() => onSwapMeal(meal)}
                onSaveAsPlan={() => void saveAsPlan()}
                onViewMacroDetails={() => setMacroDetailsOpen(true)}
                onDeleteMeal={openDeleteMealScope}
              />
              {(() => {
                const displayStatus = meal.status === 'SKIPPED' ? 'PLANNED' : meal.status;
                return (
                  <Badge tone={displayStatus.includes('EATEN') || displayStatus === 'MODIFIED' ? 'green' : 'slate'}>
                    {displayStatus.replaceAll('_', ' ')}
                  </Badge>
                );
              })()}
            </div>
          </div>

          {toggleError && <p className="mt-2 text-sm text-red-600">{toggleError}</p>}
          {actionError && <p className="mt-2 text-sm text-red-600">{actionError}</p>}

          <p className="mt-2 text-sm text-app-text-muted">
            {Math.round(Number(meal.actualCalories))} / {Math.round(Number(meal.plannedCalories))} kcal
            {plannedItems.length > 0 && ` · ${plannedItems.length} item${plannedItems.length === 1 ? '' : 's'}`}
          </p>
          <div className="mt-3">
            <PlannedItemChecklist meal={meal} onChange={onChange} allowLogging={!future} />
          </div>
        </>
      )}
      </Card>

      <MealMacroDetailsDrawer open={macroDetailsOpen} meal={meal} onClose={() => setMacroDetailsOpen(false)} />
      <DeleteMealScopeModal
        open={deleteScopeOpen}
        mealName={meal.name}
        saving={deletingMeal}
        onClose={() => {
          if (!deletingMeal) setDeleteScopeOpen(false);
        }}
        onConfirm={deleteMealPlan}
      />
    </div>
  );
}
