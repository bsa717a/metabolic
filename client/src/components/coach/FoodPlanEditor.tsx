import { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/api';
import type { Meal, NutritionPlanTemplateSummary } from '../../types';
import { CoachManualNutritionTemplateDrawer } from './CoachManualNutritionTemplateDrawer';
import { Button } from '../ui/Button';

function mealCalories(meal: Meal) {
  return Math.round(Number(meal.plannedCalories));
}

export function FoodPlanEditor({
  clientId,
  planDate,
  nutritionTemplates,
  saving,
  onSavingChange,
  onError,
  onRefresh
}: {
  clientId: string;
  planDate: string;
  nutritionTemplates: NutritionPlanTemplateSummary[];
  saving: boolean;
  onSavingChange: (saving: boolean) => void;
  onError: (message: string) => void;
  onRefresh: () => Promise<void>;
}) {
  const [meals, setMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(false);
  const [templateId, setTemplateId] = useState('');
  const [setAsDefault, setSetAsDefault] = useState(true);
  const [manualOpen, setManualOpen] = useState(false);

  const loadMeals = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<Meal[]>(`/api/coach/users/${clientId}/daily-logs/${planDate}/meals`);
      setMeals(data);
    } catch (err) {
      setMeals([]);
      onError(err instanceof Error ? err.message : 'Unable to load meals');
    } finally {
      setLoading(false);
    }
  }, [clientId, onError, planDate]);

  useEffect(() => {
    void loadMeals();
  }, [loadMeals]);

  useEffect(() => {
    setTemplateId((current) => current || nutritionTemplates[0]?.id || '');
  }, [nutritionTemplates]);

  const dailyTotal = meals.reduce((sum, meal) => sum + Number(meal.plannedCalories), 0);

  async function applyTemplate() {
    if (!templateId) {
      onError('Choose a nutrition template first.');
      return;
    }
    onSavingChange(true);
    onError('');
    try {
      const updated = await api<Meal[]>(
        `/api/coach/users/${clientId}/daily-logs/${planDate}/apply-template`,
        {
          method: 'POST',
          body: JSON.stringify({ templateId, setAsDefault })
        }
      );
      setMeals(updated);
      await onRefresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to apply nutrition template');
    } finally {
      onSavingChange(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[12rem] flex-1 text-sm">
          <span className="mb-1 block font-medium">Nutrition template</span>
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
          Apply template
        </Button>
        <Button variant="secondary" disabled={!templateId} onClick={() => setManualOpen(true)}>
          Edit manually
        </Button>
      </div>

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
          No meals planned for this day. Apply a template to get started.
        </p>
      ) : (
        <ul className="space-y-3">
          {meals.map((meal) => {
            const plannedItems = meal.items.filter((item) => item.type === 'PLANNED');
            return (
              <li key={meal.id} className="rounded-xl border border-app-border p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{meal.name}</p>
                  <span className="text-sm font-medium tabular-nums text-app-text-muted">{mealCalories(meal)} cal</span>
                </div>
                {plannedItems.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-sm text-app-text-muted">
                    {plannedItems.map((item) => (
                      <li key={item.id} className="flex justify-between gap-2">
                        <span className="truncate">{item.nameSnapshot}</span>
                        <span className="shrink-0 tabular-nums">
                          {item.quantity} {item.unit} · {Math.round(Number(item.calories))} cal
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-app-text-muted">No planned foods yet.</p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <CoachManualNutritionTemplateDrawer
        open={manualOpen}
        templateId={templateId}
        onClose={() => {
          setManualOpen(false);
          void loadMeals();
        }}
      />
    </div>
  );
}
