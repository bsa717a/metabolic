import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CopyPlus, LayoutTemplate, X } from 'lucide-react';
import { api, formatDayAbbrev, formatDayNumber, isToday } from '../../services/api';
import type { Meal, NutritionPlanTemplateSummary } from '../../types';
import { MealPlanner } from '../nutrition/MealPlanner';
import { WeekDateStrip } from '../nutrition/WeekDateStrip';
import { AddFoodsPanel } from '../nutrition/weekly/AddFoodsPanel';
import { CopyDayForward } from '../nutrition/weekly/CopyDayForward';
import { EditMealPlanDrawer } from '../nutrition/EditMealPlanDrawer';
import { AiFoodLookupDrawer } from '../nutrition/AiFoodLookupDrawer';
import { Button } from '../ui/Button';

function formatDayLine(label: string, calories: number, protein: number, carbs: number, fat: number) {
  return `${label}: ${Math.round(calories)} kcal · ${Math.round(protein)}g protein · ${Math.round(carbs)}g carbs · ${Math.round(fat)}g fat`;
}

export function CoachDayNutritionEditor({
  open,
  clientId,
  planDate,
  nutritionTemplates,
  onClose,
  onRefresh
}: {
  open: boolean;
  clientId: string;
  planDate: string;
  nutritionTemplates: NutritionPlanTemplateSummary[];
  onClose: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [meals, setMeals] = useState<Meal[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [logActualMealId, setLogActualMealId] = useState<string>();
  const [aiState, setAiState] = useState<{ mealId: string; itemType: 'PLANNED' | 'ACTUAL' }>();
  const [selectedMealId, setSelectedMealId] = useState<string>();
  const [copyingDay, setCopyingDay] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateId, setTemplateId] = useState('');
  const [setAsDefault, setSetAsDefault] = useState(true);
  const [applyingTemplate, setApplyingTemplate] = useState(false);
  const [selectedDate, setSelectedDate] = useState(planDate);

  const reloadMeals = useCallback(async () => {
    try {
      const data = await api<Meal[]>(`/api/coach/users/${clientId}/daily-logs/${selectedDate}/meals`);
      setMeals(data);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load meals.');
    }
  }, [clientId, selectedDate]);

  useEffect(() => {
    if (open) setSelectedDate(planDate);
  }, [open, planDate]);

  useEffect(() => {
    if (!open) return;
    void reloadMeals();
    setSelectedMealId(undefined);
    setLogActualMealId(undefined);
    setAiState(undefined);
    setTemplateOpen(false);
  }, [open, reloadMeals]);

  useEffect(() => {
    setTemplateId((current) => current || nutritionTemplates[0]?.id || '');
  }, [nutritionTemplates, open]);

  const effectiveSelectedMealId =
    selectedMealId && meals.some((meal) => meal.id === selectedMealId) ? selectedMealId : meals[0]?.id;
  const daySelectedMeal = meals.find((meal) => meal.id === effectiveSelectedMealId);
  const logActualMeal = meals.find((meal) => meal.id === logActualMealId);

  const dayTotals = meals.reduce(
    (sum, meal) => ({
      plannedCalories: sum.plannedCalories + Number(meal.plannedCalories),
      plannedProtein: sum.plannedProtein + Number(meal.plannedProtein),
      plannedCarbs: sum.plannedCarbs + Number(meal.plannedCarbs),
      plannedFat: sum.plannedFat + Number(meal.plannedFat),
      actualCalories: sum.actualCalories + Number(meal.actualCalories),
      actualProtein: sum.actualProtein + Number(meal.actualProtein),
      actualCarbs: sum.actualCarbs + Number(meal.actualCarbs),
      actualFat: sum.actualFat + Number(meal.actualFat)
    }),
    {
      plannedCalories: 0,
      plannedProtein: 0,
      plannedCarbs: 0,
      plannedFat: 0,
      actualCalories: 0,
      actualProtein: 0,
      actualCarbs: 0,
      actualFat: 0
    }
  );

  const defaultTemplateName = useMemo(() => {
    const match = nutritionTemplates.find((template) => template.id === templateId);
    return match?.name;
  }, [nutritionTemplates, templateId]);

  function openAiFromDrawer(mealId: string, mode: 'PLANNED' | 'ACTUAL') {
    setLogActualMealId(undefined);
    setAiState({ mealId, itemType: mode });
  }

  async function handleCopyDay() {
    if (copyingDay) return;
    if (!window.confirm("Copy the previous day's plan into this day? Planned foods will be added to each meal.")) return;
    setCopyingDay(true);
    try {
      await api(`/api/coach/users/${clientId}/daily-logs/${selectedDate}/copy-from-previous-day`, { method: 'POST' });
      await reloadMeals();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not copy the previous day.');
    } finally {
      setCopyingDay(false);
    }
  }

  async function handleApplyTemplate() {
    if (!templateId || applyingTemplate) return;
    setApplyingTemplate(true);
    setLoadError(null);
    try {
      await api(`/api/coach/users/${clientId}/daily-logs/${selectedDate}/apply-template`, {
        method: 'POST',
        body: JSON.stringify({ templateId, setAsDefault })
      });
      await reloadMeals();
      await onRefresh();
      setTemplateOpen(false);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not apply plan.');
    } finally {
      setApplyingTemplate(false);
    }
  }

  const dayLabel = `${formatDayAbbrev(selectedDate)} ${formatDayNumber(selectedDate)}`;

  async function handleClose() {
    await onRefresh();
    onClose();
  }

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-app-bg">
      <header className="shrink-0 border-b border-app-border bg-app-surface px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-app-text">Edit nutrition plan</h2>
            <p className="text-sm text-app-text-muted">Plan and track meals for this client.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => void handleCopyDay()}
              disabled={copyingDay}
            >
              <CopyPlus className="mr-1 inline h-4 w-4" />
              Copy day
            </Button>
            <CopyDayForward
              variant="button"
              date={selectedDate}
              dayLabel={dayLabel}
              disabled={!meals.length}
              apiUrl={`/api/coach/users/${clientId}/daily-logs/${selectedDate}/copy-to-dates`}
              onCopied={() => void reloadMeals()}
            />
            <Button type="button" variant="secondary" onClick={() => setTemplateOpen(true)}>
              <LayoutTemplate className="mr-1 inline h-4 w-4" />
              Plans
            </Button>
            <button
              type="button"
              aria-label="Close editor"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-app-border text-app-text-muted transition hover:bg-app-muted hover:text-app-text"
              onClick={() => void handleClose()}
            >
              <X size={18} />
            </button>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-7xl space-y-4">
          <WeekDateStrip selectedDate={selectedDate} onSelectDate={setSelectedDate} />

          {defaultTemplateName && (
            <p className="text-sm text-app-text-muted">
              Default plan: <span className="font-medium text-app-text">{defaultTemplateName}</span>
            </p>
          )}

          {loadError && <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{loadError}</div>}

          {meals.length === 0 ? (
            <p className="rounded-2xl bg-app-muted p-4 text-sm text-app-text-muted">
              No meals planned for this day. Apply a plan first, then edit manually.
            </p>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
              <div className="min-w-0 space-y-4">
                <MealPlanner
                  meals={meals}
                  selectedDate={selectedDate}
                  onChange={() => void reloadMeals()}
                  onLogActual={(mealId) => setLogActualMealId(mealId)}
                  selectedMealId={effectiveSelectedMealId}
                  onSelectMeal={setSelectedMealId}
                />

                <div className="rounded-2xl border border-app-border bg-app-surface p-4">
                  <p className="font-semibold text-app-text">Day totals</p>
                  {!isToday(selectedDate) && <p className="text-sm text-app-text-muted">{selectedDate}</p>}
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-brand-gold/10 p-3 text-sm text-app-text ring-1 ring-brand-gold/20">
                      {formatDayLine(
                        'Planned',
                        dayTotals.plannedCalories,
                        dayTotals.plannedProtein,
                        dayTotals.plannedCarbs,
                        dayTotals.plannedFat
                      )}
                    </div>
                    <div className="rounded-2xl bg-brand-green/10 p-3 text-sm text-app-text ring-1 ring-brand-green/20">
                      {formatDayLine(
                        'Actual',
                        dayTotals.actualCalories,
                        dayTotals.actualProtein,
                        dayTotals.actualCarbs,
                        dayTotals.actualFat
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <AddFoodsPanel
                  selectedMeal={daySelectedMeal}
                  selectedLabel={daySelectedMeal?.name}
                  itemType="PLANNED"
                  pinWhileScrolling={false}
                  onChange={() => void reloadMeals()}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {templateOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/40" onClick={() => setTemplateOpen(false)} />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-app-border bg-app-surface p-6 shadow-xl">
            <h3 className="text-lg font-bold text-app-text">Apply nutrition plan</h3>
            <p className="mt-1 text-sm text-app-text-muted">
              Replace planned meals for <strong>{selectedDate}</strong>.
            </p>
            <label className="mt-4 block text-sm">
              <span className="mb-1 block font-medium">Plan</span>
              <select
                className="w-full rounded-xl border border-app-border bg-app-surface px-3 py-2"
                value={templateId}
                onChange={(event) => setTemplateId(event.target.value)}
                disabled={applyingTemplate}
              >
                {nutritionTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={setAsDefault}
                onChange={(event) => setSetAsDefault(event.target.checked)}
                disabled={applyingTemplate}
              />
              Set as the user&apos;s default going forward
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="secondary" disabled={applyingTemplate} onClick={() => setTemplateOpen(false)}>
                Cancel
              </Button>
              <Button type="button" disabled={applyingTemplate || !templateId} onClick={() => void handleApplyTemplate()}>
                {applyingTemplate ? 'Applying…' : 'Apply plan'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <EditMealPlanDrawer
        open={Boolean(logActualMealId)}
        meal={logActualMeal}
        mode="ACTUAL"
        onClose={() => setLogActualMealId(undefined)}
        onSaved={() => void reloadMeals()}
        onAskAi={openAiFromDrawer}
      />

      <AiFoodLookupDrawer
        open={Boolean(aiState)}
        mealId={aiState?.mealId}
        itemType={aiState?.itemType ?? 'ACTUAL'}
        onClose={() => setAiState(undefined)}
        onSaved={() => void reloadMeals()}
      />
    </div>,
    document.body
  );
}
