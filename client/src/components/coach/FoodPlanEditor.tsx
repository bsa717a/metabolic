import { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/api';
import type { CoachClientPlanStatus, Meal, NutritionPlanTemplateSummary, PlanPeriodInfo } from '../../types';
import { AiFoodLookupDrawer } from '../nutrition/AiFoodLookupDrawer';
import { EditMealPlanDrawer } from '../nutrition/EditMealPlanDrawer';
import { MealPlanner } from '../nutrition/MealPlanner';
import { PlanPeriodBanner } from '../nutrition/PlanPeriodBanner';
import { CoachDayNutritionEditor } from './CoachDayNutritionEditor';
import { MacroOverridePanel } from './MacroOverridePanel';
import { Button } from '../ui/Button';
import {
  APPLY_NUTRITION_PLAN_HINT,
  assignedNutritionPlan,
  NO_NUTRITION_PLAN_ASSIGNED,
  useNutritionPlanPicker
} from '../../utils/nutritionPlanPicker';

export function FoodPlanEditor({
  clientId,
  planDate,
  nutritionTemplates,
  planStatus,
  saving,
  manualOpen,
  onManualOpenChange,
  onSavingChange,
  onError,
  onRefresh,
  onRefreshPlanStatus
}: {
  clientId: string;
  planDate: string;
  nutritionTemplates: NutritionPlanTemplateSummary[];
  planStatus: CoachClientPlanStatus | null;
  saving: boolean;
  manualOpen: boolean;
  onManualOpenChange: (open: boolean) => void;
  onSavingChange: (saving: boolean) => void;
  onError: (message: string) => void;
  onRefresh: () => Promise<void>;
  onRefreshPlanStatus: () => Promise<void>;
}) {
  const [meals, setMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(false);
  const [setAsDefault, setSetAsDefault] = useState(true);
  const [logActualMealId, setLogActualMealId] = useState<string>();
  const [aiState, setAiState] = useState<{ mealId: string; itemType: 'PLANNED' | 'ACTUAL' }>();

  const loadMeals = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    try {
      const data = await api<Meal[]>(`/api/coach/users/${clientId}/daily-logs/${planDate}/meals`, {
        cache: 'no-store'
      });
      setMeals(data);
    } catch (err) {
      // A note save refetches with silent: true. Keep the meals already on screen if that GET fails.
      if (!options?.silent) setMeals([]);
      onError(err instanceof Error ? err.message : 'Unable to load meals');
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, [clientId, onError, planDate]);

  useEffect(() => {
    void loadMeals();
  }, [loadMeals]);

  const dailyTotal = meals.reduce((sum, meal) => sum + Number(meal.plannedCalories), 0);
  const periodKey = `${clientId}:${planDate}`;
  const [planPeriodState, setPlanPeriodState] = useState<{ key: string; period: PlanPeriodInfo | null } | null>(null);
  const planPeriod = planPeriodState?.key === periodKey ? planPeriodState.period : null;
  const planPeriodLoaded = planPeriodState?.key === periodKey;

  const loadPlanPeriod = useCallback(async () => {
    const key = `${clientId}:${planDate}`;
    try {
      setPlanPeriodState({
        key,
        period: await api<PlanPeriodInfo>(`/api/coach/users/${clientId}/daily-logs/${planDate}/plan-period`, {
          cache: 'no-store'
        })
      });
    } catch {
      setPlanPeriodState({ key, period: null });
    }
  }, [clientId, planDate]);

  useEffect(() => {
    let cancelled = false;
    const key = `${clientId}:${planDate}`;
    api<PlanPeriodInfo>(`/api/coach/users/${clientId}/daily-logs/${planDate}/plan-period`, { cache: 'no-store' })
      .then((info) => {
        if (!cancelled) setPlanPeriodState({ key, period: info });
      })
      .catch(() => {
        if (!cancelled) setPlanPeriodState({ key, period: null });
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, planDate]);

  const assigned = assignedNutritionPlan(planPeriod);
  const { options, planId, onPlanIdChange, clearOverride } = useNutritionPlanPicker(
    nutritionTemplates,
    assigned,
    `${clientId}:${planDate}`
  );

  async function applyTemplate() {
    if (!planId) {
      onError('Choose a nutrition plan first.');
      return;
    }
    onSavingChange(true);
    onError('');
    try {
      await api<Meal[]>(
        `/api/coach/users/${clientId}/daily-logs/${planDate}/apply-template`,
        {
          method: 'POST',
          body: JSON.stringify({ templateId: planId, setAsDefault })
        }
      );
      clearOverride();
      await Promise.all([loadMeals(), loadPlanPeriod(), onRefreshPlanStatus()]);
      void onRefresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to apply nutrition plan');
    } finally {
      onSavingChange(false);
    }
  }

  const handleOverrideSaved = useCallback(async () => {
    await Promise.all([loadMeals(), onRefreshPlanStatus(), onRefresh()]);
  }, [loadMeals, onRefresh, onRefreshPlanStatus]);

  return (
    <div className="space-y-4">
      {planPeriod && (planPeriod.weekNumber != null || planPeriod.calorieTarget != null) ? (
        <PlanPeriodBanner planPeriod={planPeriod} viewedDate={planDate} />
      ) : null}
      {planStatus ? (
        <MacroOverridePanel
          key={`${planStatus.overrideTargets.calories}|${planStatus.overrideTargets.protein}|${planStatus.overrideTargets.carbs}|${planStatus.overrideTargets.fat}`}
          source={planStatus.targetSource}
          resolvedTargets={planStatus.resolvedTargets}
          overrideTargets={planStatus.overrideTargets}
          saving={saving}
          onSavingChange={onSavingChange}
          onError={onError}
          onSubmit={async (payload) => {
            await api<CoachClientPlanStatus>(`/api/coach/users/${clientId}/nutrition-targets`, {
              method: 'PUT',
              body: JSON.stringify({ ...payload, date: planDate })
            });
            await handleOverrideSaved();
          }}
        />
      ) : null}

      {planPeriodLoaded ? (
        assigned ? (
          <p className="text-sm text-app-text-muted">
            Plan <span className="font-medium text-app-text">{assigned.name}</span>
          </p>
        ) : (
          <p className="text-sm text-app-text-muted">
            <span className="font-medium text-app-text">{NO_NUTRITION_PLAN_ASSIGNED}</span>
          </p>
        )
      ) : null}

      <div className="space-y-2">
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[12rem] flex-1 text-sm">
            <span className="mb-1 block font-medium">Nutrition plan</span>
            <select
              className="w-full rounded-xl border border-app-border bg-app-surface px-3 py-2"
              value={planId}
              onChange={(event) => onPlanIdChange(event.target.value)}
            >
              <option value="">Choose a plan</option>
              {options.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>
          <Button disabled={saving || !planId} onClick={() => void applyTemplate()}>
            Apply plan
          </Button>
        </div>
        <p className="text-sm text-app-text-muted">{APPLY_NUTRITION_PLAN_HINT}</p>
      </div>

      {!nutritionTemplates.length && (
        <p className="text-sm text-app-text-muted">
          No plans match this client&apos;s current profile for a new assignment. If they already have a plan, it
          should appear above once synced. Otherwise update their profile or add a matching plan in admin.
        </p>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={setAsDefault} onChange={(event) => setSetAsDefault(event.target.checked)} />
        Set as the user&apos;s default going forward
      </label>

      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-app-text-muted">Daily total</span>
        <span className="font-bold tabular-nums">{Math.round(dailyTotal)} cal</span>
      </div>

      {loading ? (
        <p className="text-sm text-app-text-muted">Loading meals...</p>
      ) : meals.length === 0 ? (
        <p className="rounded-xl bg-app-muted p-4 text-sm text-app-text-muted">
          No meals planned for this day. Apply a plan to get started.
        </p>
      ) : (
        <MealPlanner
          meals={meals}
          selectedDate={planDate}
          allowClientNote
          onChange={() => loadMeals({ silent: true })}
          onLogActual={setLogActualMealId}
        />
      )}

      <EditMealPlanDrawer
        open={Boolean(logActualMealId)}
        meal={meals.find((meal) => meal.id === logActualMealId)}
        mode="ACTUAL"
        onClose={() => setLogActualMealId(undefined)}
        onSaved={() => loadMeals({ silent: true })}
        onAskAi={(mealId, mode) => {
          setLogActualMealId(undefined);
          setAiState({ mealId, itemType: mode });
        }}
      />
      <AiFoodLookupDrawer
        open={Boolean(aiState)}
        mealId={aiState?.mealId}
        itemType={aiState?.itemType ?? 'ACTUAL'}
        onClose={() => setAiState(undefined)}
        onSaved={() => loadMeals({ silent: true })}
      />

      <CoachDayNutritionEditor
        open={manualOpen}
        clientId={clientId}
        planDate={planDate}
        nutritionTemplates={nutritionTemplates}
        onClose={() => {
          onManualOpenChange(false);
          void loadMeals();
        }}
        onRefresh={onRefresh}
      />
    </div>
  );
}
