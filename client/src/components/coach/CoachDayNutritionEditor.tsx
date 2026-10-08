import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';
import { CopyPlus, LayoutTemplate, X } from 'lucide-react';
import { api, formatDayAbbrev, formatDayNumber, isToday } from '../../services/api';
import type { Meal, NutritionPlanTemplateSummary, PlanPeriodInfo } from '../../types';
import { MealPlanner, type MealPlannerHandle } from '../nutrition/MealPlanner';
import { PlanPeriodBanner } from '../nutrition/PlanPeriodBanner';
import { WeekDateStrip } from '../nutrition/WeekDateStrip';
import { AddFoodsPanel } from '../nutrition/weekly/AddFoodsPanel';
import { CopyDayForward } from '../nutrition/weekly/CopyDayForward';
import { EditMealPlanDrawer } from '../nutrition/EditMealPlanDrawer';
import { AiFoodLookupDrawer } from '../nutrition/AiFoodLookupDrawer';
import type { MacroTotals } from '../nutrition/MacroSummaryFooter';
import { Button } from '../ui/Button';
import {
  APPLY_NUTRITION_PLAN_HINT,
  assignedNutritionPlan,
  NO_NUTRITION_PLAN_ASSIGNED,
  useNutritionPlanPicker
} from '../../utils/nutritionPlanPicker';

function formatDayLine(label: string, calories: number, protein: number, carbs: number, fat: number) {
  return `${label}: ${Math.round(calories)} kcal · ${Math.round(protein)}g protein · ${Math.round(carbs)}g carbs · ${Math.round(fat)}g fat`;
}

function MacroTotalsBlock({
  label,
  totals,
  variant,
  layout
}: {
  label: string;
  totals: MacroTotals;
  variant: 'gold' | 'green';
  layout: 'horizontal' | 'vertical';
}) {
  const shellClass =
    variant === 'gold'
      ? 'rounded-2xl bg-brand-gold/10 text-app-text ring-1 ring-brand-gold/20'
      : 'rounded-2xl bg-brand-green/10 text-app-text ring-1 ring-brand-green/20';

  if (layout === 'horizontal') {
    return (
      <div className={`p-3 text-sm ${shellClass}`}>
        {formatDayLine(label, totals.calories, totals.protein, totals.carbs, totals.fat)}
      </div>
    );
  }

  const rows = [
    { name: 'Calories', value: `${Math.round(totals.calories)} kcal` },
    { name: 'Protein', value: `${Math.round(totals.protein)}g` },
    { name: 'Carbs', value: `${Math.round(totals.carbs)}g` },
    { name: 'Fat', value: `${Math.round(totals.fat)}g` }
  ];

  return (
    <div className={`p-3 ${shellClass}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-app-text-muted">{label}</p>
      <dl className="mt-2 space-y-2">
        {rows.map((row) => (
          <div key={row.name} className="flex items-baseline justify-between gap-3 text-sm">
            <dt className="text-app-text-muted">{row.name}</dt>
            <dd className="font-bold tabular-nums text-app-text">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function DayTotalsPanel({
  planned,
  actual,
  layout,
  selectedDate,
  pinWhileScrolling = false
}: {
  planned: MacroTotals;
  actual: MacroTotals;
  layout: 'horizontal' | 'vertical';
  selectedDate: string;
  pinWhileScrolling?: boolean;
}) {
  return (
    <div
      className={clsx(
        'rounded-2xl border border-app-border bg-app-surface p-4 shadow-sm',
        pinWhileScrolling &&
          'sticky top-4 z-10 self-start lg:top-6 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto'
      )}
    >
      <p className="font-semibold text-app-text">Day totals</p>
      {!isToday(selectedDate) && <p className="text-sm text-app-text-muted">{selectedDate}</p>}
      <div className={layout === 'vertical' ? 'mt-3 space-y-3' : 'mt-3 grid gap-3 sm:grid-cols-2'}>
        <MacroTotalsBlock label="Planned" totals={planned} variant="gold" layout={layout} />
        <MacroTotalsBlock label="Actual" totals={actual} variant="green" layout={layout} />
      </div>
    </div>
  );
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
  const [setAsDefault, setSetAsDefault] = useState(true);
  const [applyingTemplate, setApplyingTemplate] = useState(false);
  const [selectedDate, setSelectedDate] = useState(planDate);
  const [planPeriodState, setPlanPeriodState] = useState<{ key: string; period: PlanPeriodInfo | null } | null>(null);
  const [editingPlan, setEditingPlan] = useState(false);
  const [savingDay, setSavingDay] = useState(false);
  const [draftPlannedTotals, setDraftPlannedTotals] = useState<MacroTotals | null>(null);
  const plannerRef = useRef<MealPlannerHandle>(null);

  const handleDraftPlannedTotalsChange = useCallback((totals: MacroTotals) => {
    setDraftPlannedTotals(totals);
  }, []);

  useEffect(() => {
    if (!editingPlan) setDraftPlannedTotals(null);
  }, [editingPlan]);

  const loadGeneration = useRef(0);

  const reloadMeals = useCallback(async () => {
    const generation = ++loadGeneration.current;
    try {
      const data = await api<Meal[]>(`/api/coach/users/${clientId}/daily-logs/${selectedDate}/meals`);
      if (generation !== loadGeneration.current) return;
      setMeals(data);
      setLoadError(null);
    } catch (error) {
      if (generation !== loadGeneration.current) return;
      setLoadError(error instanceof Error ? error.message : 'Could not load meals.');
    }
  }, [clientId, selectedDate]);

  useEffect(() => {
    if (!open) setSelectedDate(planDate);
  }, [open, planDate]);

  const periodKey = `${clientId}:${selectedDate}`;
  const planPeriod = planPeriodState?.key === periodKey ? planPeriodState.period : null;
  const planPeriodLoaded = planPeriodState?.key === periodKey;

  const loadPlanPeriod = useCallback(async () => {
    const key = `${clientId}:${selectedDate}`;
    try {
      setPlanPeriodState({
        key,
        period: await api<PlanPeriodInfo>(`/api/coach/users/${clientId}/daily-logs/${selectedDate}/plan-period`)
      });
    } catch {
      setPlanPeriodState({ key, period: null });
    }
  }, [clientId, selectedDate]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const key = `${clientId}:${selectedDate}`;
    api<PlanPeriodInfo>(`/api/coach/users/${clientId}/daily-logs/${selectedDate}/plan-period`)
      .then((info) => {
        if (!cancelled) setPlanPeriodState({ key, period: info });
      })
      .catch(() => {
        if (!cancelled) setPlanPeriodState({ key, period: null });
      });
    return () => {
      cancelled = true;
    };
  }, [open, clientId, selectedDate]);

  useEffect(() => {
    if (!open) return;
    void reloadMeals();
    setSelectedMealId(undefined);
    setLogActualMealId(undefined);
    setAiState(undefined);
    setTemplateOpen(false);
    setEditingPlan(false);
    setDraftPlannedTotals(null);
  }, [open, reloadMeals]);

  const assignedPlan = assignedNutritionPlan(planPeriod);
  const { options: planOptions, planId, onPlanIdChange, clearOverride } = useNutritionPlanPicker(
    nutritionTemplates,
    assignedPlan,
    `${clientId}:${selectedDate}`
  );

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

  const plannedTotals = useMemo<MacroTotals>(() => {
    if (editingPlan && draftPlannedTotals) return draftPlannedTotals;
    return {
      calories: dayTotals.plannedCalories,
      protein: dayTotals.plannedProtein,
      carbs: dayTotals.plannedCarbs,
      fat: dayTotals.plannedFat
    };
  }, [dayTotals, draftPlannedTotals, editingPlan]);

  const actualTotals = useMemo<MacroTotals>(
    () => ({
      calories: dayTotals.actualCalories,
      protein: dayTotals.actualProtein,
      carbs: dayTotals.actualCarbs,
      fat: dayTotals.actualFat
    }),
    [dayTotals]
  );

  function confirmDiscardIfDirty() {
    if (!plannerRef.current?.isEditing()) return true;
    return plannerRef.current.cancelAll();
  }

  function openAiFromDrawer(mealId: string, mode: 'PLANNED' | 'ACTUAL') {
    if (!confirmDiscardIfDirty()) return;
    setLogActualMealId(undefined);
    setAiState({ mealId, itemType: mode });
  }

  async function handleCopyDay() {
    if (copyingDay) return;
    if (!confirmDiscardIfDirty()) return;
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
    if (!planId || applyingTemplate) return;
    setApplyingTemplate(true);
    setLoadError(null);
    try {
      await api(`/api/coach/users/${clientId}/daily-logs/${selectedDate}/apply-template`, {
        method: 'POST',
        body: JSON.stringify({ templateId: planId, setAsDefault })
      });
      clearOverride();
      await Promise.all([reloadMeals(), loadPlanPeriod(), onRefresh()]);
      setTemplateOpen(false);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not apply plan.');
    } finally {
      setApplyingTemplate(false);
    }
  }

  const dayLabel = `${formatDayAbbrev(selectedDate)} ${formatDayNumber(selectedDate)}`;

  async function handleClose() {
    if (!confirmDiscardIfDirty()) return;
    await onRefresh();
    onClose();
  }

  function handleSelectDate(nextDate: string) {
    if (nextDate === selectedDate) return;
    if (!confirmDiscardIfDirty()) return;
    setSelectedDate(nextDate);
  }

  function openTemplates() {
    if (!confirmDiscardIfDirty()) return;
    setTemplateOpen(true);
  }

  async function handleSaveDay() {
    if (!plannerRef.current || savingDay) return;
    setSavingDay(true);
    try {
      await plannerRef.current.saveAll();
    } finally {
      setSavingDay(false);
    }
  }

  function handleCancelDay() {
    plannerRef.current?.cancelAll();
  }

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-app-bg">
      <header className="shrink-0 border-b border-app-border bg-app-surface px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-3xl font-bold text-app-text">Edit nutrition plan</h2>
            <p className="text-sm text-app-text-muted">
              {editingPlan
                ? 'Editing all meals for this day. Save anywhere to save the whole page.'
                : 'Plan and track meals for this client.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {editingPlan ? (
              <>
                <Button type="button" variant="secondary" onClick={handleCancelDay} disabled={savingDay}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleSaveDay()}
                  disabled={savingDay}
                >
                  {savingDay ? 'Saving…' : 'Save day'}
                </Button>
              </>
            ) : (
              <>
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
                <Button type="button" variant="secondary" onClick={openTemplates}>
                  <LayoutTemplate className="mr-1 inline h-4 w-4" />
                  Plans
                </Button>
              </>
            )}
            <Button type="button" variant="secondary" aria-label="Close editor" onClick={() => void handleClose()}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-7xl space-y-4">
          {planPeriod && (planPeriod.weekNumber != null || planPeriod.calorieTarget != null) ? (
            <PlanPeriodBanner planPeriod={planPeriod} viewedDate={selectedDate} />
          ) : null}
          <WeekDateStrip selectedDate={selectedDate} onSelectDate={handleSelectDate} />

          {planPeriodLoaded ? (
            assignedPlan ? (
              <p className="text-sm text-app-text-muted">
                Plan <span className="font-medium text-app-text">{assignedPlan.name}</span>
              </p>
            ) : (
              <p className="text-sm text-app-text-muted">
                <span className="font-medium text-app-text">{NO_NUTRITION_PLAN_ASSIGNED}</span>
              </p>
            )
          ) : null}

          {loadError && <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{loadError}</div>}

          {meals.length === 0 ? (
            <p className="rounded-2xl bg-app-muted p-4 text-sm text-app-text-muted">
              No meals planned for this day. Apply a plan first, then edit manually.
            </p>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
              <div className="min-w-0 space-y-4">
                <MealPlanner
                  ref={plannerRef}
                  meals={meals}
                  selectedDate={selectedDate}
                  onChange={() => void reloadMeals()}
                  onLogActual={(mealId) => {
                    if (!confirmDiscardIfDirty()) return;
                    setLogActualMealId(mealId);
                  }}
                  selectedMealId={effectiveSelectedMealId}
                  onSelectMeal={setSelectedMealId}
                  multiMealEdit
                  allowClientNote
                  onEditingChange={setEditingPlan}
                  onDraftPlannedTotalsChange={handleDraftPlannedTotalsChange}
                />

                {!editingPlan && (
                  <DayTotalsPanel
                    planned={plannedTotals}
                    actual={actualTotals}
                    layout="horizontal"
                    selectedDate={selectedDate}
                  />
                )}
              </div>

              <div>
                {editingPlan ? (
                  <DayTotalsPanel
                    planned={plannedTotals}
                    actual={actualTotals}
                    layout="vertical"
                    selectedDate={selectedDate}
                    pinWhileScrolling
                  />
                ) : (
                  <AddFoodsPanel
                    selectedMeal={daySelectedMeal}
                    selectedLabel={daySelectedMeal?.name}
                    itemType="PLANNED"
                    pinWhileScrolling={false}
                    onChange={() => void reloadMeals()}
                  />
                )}
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
            <p className="mt-1 text-sm text-app-text-muted">{APPLY_NUTRITION_PLAN_HINT}</p>
            <label className="mt-4 block text-sm">
              <span className="mb-1 block font-medium">Plan</span>
              <select
                className="w-full rounded-xl border border-app-border bg-app-surface px-3 py-2"
                value={planId}
                onChange={(event) => onPlanIdChange(event.target.value)}
                disabled={applyingTemplate}
              >
                <option value="">Choose a plan</option>
                {planOptions.map((template) => (
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
              <Button type="button" disabled={applyingTemplate || !planId} onClick={() => void handleApplyTemplate()}>
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
