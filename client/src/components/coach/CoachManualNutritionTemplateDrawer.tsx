import { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/api';
import type { NutritionPlanTemplate, NutritionTemplateMeal } from '../../types';
import { CoachEditTemplateMealDrawer } from './CoachEditTemplateMealDrawer';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';

function mealCalories(meal: NutritionTemplateMeal) {
  return Math.round(meal.items.reduce((sum, item) => sum + Number(item.calories), 0));
}

export function CoachManualNutritionTemplateDrawer({
  open,
  templateId,
  onClose
}: {
  open: boolean;
  templateId: string;
  onClose: () => void;
}) {
  const [template, setTemplate] = useState<NutritionPlanTemplate | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editMealId, setEditMealId] = useState<string>();

  const load = useCallback(async () => {
    if (!templateId) return;
    setLoading(true);
    setError('');
    try {
      const data = await api<NutritionPlanTemplate>(`/api/coach/nutrition-templates/${templateId}`);
      setTemplate(data);
    } catch (err) {
      setTemplate(null);
      setError(err instanceof Error ? err.message : 'Unable to load template');
    } finally {
      setLoading(false);
    }
  }, [templateId]);

  useEffect(() => {
    if (open) void load();
  }, [load, open]);

  const editMeal = template?.meals.find((meal) => meal.id === editMealId);

  return (
    <>
      <Drawer open={open} title={template ? `Edit template — ${template.name}` : 'Edit nutrition template'} onClose={onClose} panelClassName="max-w-lg">
        {loading ? (
          <p className="text-sm text-app-text-muted">Loading template...</p>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : template ? (
          <div className="space-y-4">
            <p className="text-sm text-app-text-muted">
              Edit the template meals below, then close and apply the template to update the client&apos;s day.
            </p>
            <ul className="space-y-2">
              {template.meals.map((meal) => (
                <li key={meal.id} className="flex items-center justify-between gap-3 rounded-xl border border-app-border p-3">
                  <div>
                    <p className="font-semibold">{meal.name}</p>
                    <p className="text-xs text-app-text-muted">
                      {mealCalories(meal)} cal · {meal.items.length} item{meal.items.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  <Button variant="secondary" onClick={() => setEditMealId(meal.id)}>
                    Edit
                  </Button>
                </li>
              ))}
            </ul>
            {!template.meals.length && (
              <p className="text-sm text-app-text-muted">This template has no meals yet.</p>
            )}
          </div>
        ) : null}
      </Drawer>

      <CoachEditTemplateMealDrawer
        open={Boolean(editMealId)}
        meal={editMeal}
        onClose={() => setEditMealId(undefined)}
        onSaved={() => void load()}
      />
    </>
  );
}
