import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, getWeekDates, startOfWeek } from '../../services/api';
import type { CoachClientPlanStatus, Meal, NutritionPlanTemplateSummary } from '../../types';
import { fetchCoachMealsForDates, type DayMeals } from '../../utils/planExportData';
import { AiFoodLookupDrawer } from '../nutrition/AiFoodLookupDrawer';
import { EditMealPlanDrawer } from '../nutrition/EditMealPlanDrawer';
import { MealPlanner } from '../nutrition/MealPlanner';
import { WeekDateStrip } from '../nutrition/WeekDateStrip';
import { CoachDayNutritionEditor } from './CoachDayNutritionEditor';
import { MacroOverridePanel } from './MacroOverridePanel';
import { Button } from '../ui/Button';

export function FoodPlanEditor({
  clientId,
  planDate,
  clientToday,
  onPlanDateChange,
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
  /** The client's today (YYYY-MM-DD) in the client's timezone. */
  clientToday: string;
  onPlanDateChange: (date: string) => void;
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
  const [templateId, setTemplateId] = useState('');
  const [setAsDefault, setSetAsDefault] = useState(true);
  const [logActualMealId, setLogActualMealId] = useState<string>();
  const [aiState, setAiState] = useState<{ mealId: string; itemType: 'PLANNED' | 'ACTUAL' }>();
  const [weekDays, setWeekDays] = useState<DayMeals[]>([]);
  const weekStart = startOfWeek(planDate);
  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart]);

  const loadWeekDays = useCallback(async () => {
    setWeekDays(await fetchCoachMealsForDates(clientId, weekDates));
  }, [clientId, weekDates]);

  const loadMeals = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    try {
      const data = await api<Meal[]>(`/api/coach/users/${clientId}/daily-logs/${planDate}/meals`);
      setMeals(data);
      void loadWeekDays();
    } catch (err) {
      // A note save refetches with silent: true. Keep the meals already on screen if that GET fails.
      if (!options?.silent) setMeals([]);
      onError(err instanceof Error ? err.message : 'Unable to load meals');
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, [clientId, loadWeekDays, onError, planDate]);

  useEffect(() => {
    void loadMeals();
  }, [loadMeals]);

  useEffect(() => {
    setTemplateId((current) => current || nutritionTemplates[0]?.id || '');
  }, [nutritionTemplates]);

  const dailyTotal = meals.reduce((sum, meal) => sum + Number(meal.plannedCalories), 0);

  async function applyTemplate() {
    if (!templateId) {
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
          body: JSON.stringify({ templateId, setAsDefault })
        }
      );
      await loadMeals();
      await onRefresh();
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
      <WeekDateStrip
        selectedDate={planDate}
        onSelectDate={onPlanDateChange}
        todayDate={clientToday}
        days={weekDays}
      />

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

      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[12rem] flex-1 text-sm">
          <span className="mb-1 block font-medium">Nutrition plan</span>
          <select
            className="w-full rounded-xl border border-app-border bg-app-surface px-3 py-2"
            value={templateId}
            onChange={(event) => setTemplateId(event.target.value)}
          >
            {nutritionTemplates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </label>
        <Button disabled={saving || !nutritionTemplates.length} onClick={() => void applyTemplate()}>
          Apply plan
        </Button>
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
        clientToday={clientToday}
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
