import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Pencil } from 'lucide-react';
import { api } from '../services/api';
import type { NutritionPlanTemplate, NutritionTemplateMeal } from '../types';
import { ACTIVITY_LEVEL_OPTIONS } from '../utils/activityLevel';
import {
  buildPlanCriteriaPayload,
  emptyPlanCriteriaDraft,
  planCriteriaDraftFromTemplate,
  type PlanCriteriaDraft,
  validatePlanCriteriaDraft
} from '../utils/planCriteria';
import { EditTemplateMealDrawer } from '../components/admin/EditTemplateMealDrawer';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';

function mealTotals(meal: NutritionTemplateMeal) {
  return meal.items.reduce(
    (sum, item) => ({
      calories: sum.calories + Number(item.calories),
      protein: sum.protein + Number(item.protein),
      carbs: sum.carbs + Number(item.carbs),
      fat: sum.fat + Number(item.fat)
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

export function AdminNutritionTemplateEditorPage() {
  const { id } = useParams<{ id: string }>();
  const [template, setTemplate] = useState<NutritionPlanTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [editMealId, setEditMealId] = useState<string>();
  const [draft, setDraft] = useState({
    name: '',
    description: '',
    visibility: 'GLOBAL' as 'GLOBAL' | 'USER',
    calorieTarget: 2200,
    proteinTarget: 190,
    carbTarget: 190,
    fatTarget: 70
  });
  const [criteriaDraft, setCriteriaDraft] = useState<PlanCriteriaDraft>(emptyPlanCriteriaDraft());

  function updateCriteriaDraft(patch: Partial<PlanCriteriaDraft>) {
    setCriteriaDraft((current) => ({ ...current, ...patch }));
  }

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const data = await api<NutritionPlanTemplate>(`/api/admin/nutrition-templates/${id}`);
      setTemplate(data);
      setDraft({
        name: data.name,
        description: data.description ?? '',
        visibility: data.visibility,
        calorieTarget: data.calorieTarget,
        proteinTarget: data.proteinTarget,
        carbTarget: data.carbTarget,
        fatTarget: data.fatTarget
      });
      setCriteriaDraft(planCriteriaDraftFromTemplate(data));
    } catch (err) {
      setTemplate(null);
      setError(err instanceof Error ? err.message : 'Unable to load plan');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveMetadata() {
    if (!id) return;
    const criteriaError = validatePlanCriteriaDraft(criteriaDraft, draft.visibility);
    if (criteriaError) {
      setError(criteriaError);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const updated = await api<NutritionPlanTemplate>(`/api/admin/nutrition-templates/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: draft.name.trim(),
          description: draft.description.trim() || null,
          visibility: draft.visibility,
          ...buildPlanCriteriaPayload(criteriaDraft),
          calorieTarget: draft.calorieTarget,
          proteinTarget: draft.proteinTarget,
          carbTarget: draft.carbTarget,
          fatTarget: draft.fatTarget
        })
      });
      setTemplate(updated);
      setCriteriaDraft(planCriteriaDraftFromTemplate(updated));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save plan');
    } finally {
      setSaving(false);
    }
  }

  const editMeal = template?.meals.find((meal) => meal.id === editMealId);
  const dayTotals = (template?.meals ?? []).reduce(
    (sum, meal) => {
      const totals = mealTotals(meal);
      return {
        calories: sum.calories + totals.calories,
        protein: sum.protein + totals.protein,
        carbs: sum.carbs + totals.carbs,
        fat: sum.fat + totals.fat
      };
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  return (
    <div className="space-y-6">
      <div>
        <Link to="/admin/nutrition-templates" className="text-sm text-slate-500 hover:text-slate-700">
          ← Nutrition Plans
        </Link>
        <h1 className="mt-2 text-3xl font-bold">{template?.name ?? 'Plan editor'}</h1>
        <p className="text-slate-500">Edit macro targets and planned meals for this plan.</p>
      </div>

      {loading && <p className="text-sm text-slate-500">Loading plan…</p>}
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p>{error}</p>
        </div>
      )}

      {template && (
        <>
          <Card>
            <h2 className="text-lg font-bold">Plan details</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-sm sm:col-span-2">
                <span className="mb-1 block font-medium text-slate-700">Name</span>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                />
              </label>
              <label className="text-sm sm:col-span-2">
                <span className="mb-1 block font-medium text-slate-700">Description</span>
                <textarea
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  rows={2}
                  value={draft.description}
                  onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700">Visibility</span>
                <select
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  value={draft.visibility}
                  onChange={(event) => setDraft({ ...draft, visibility: event.target.value as 'GLOBAL' | 'USER' })}
                >
                  <option value="GLOBAL">GLOBAL (users can select)</option>
                  <option value="USER">USER (hidden from users)</option>
                </select>
              </label>
              {(['calorieTarget', 'proteinTarget', 'carbTarget', 'fatTarget'] as const).map((field) => (
                <label key={field} className="text-sm">
                  <span className="mb-1 block font-medium capitalize text-slate-700">
                    {field.replace('Target', '').replace('calorie', 'Calories (kcal)').replace('protein', 'Protein (g)').replace('carb', 'Carbs (g)').replace('fat', 'Fat (g)')}
                  </span>
                  <input
                    type="number"
                    min={0}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                    value={draft[field]}
                    onChange={(event) => setDraft({ ...draft, [field]: Number(event.target.value) })}
                  />
                </label>
              ))}
            </div>
            <div className="mt-4">
              <Button type="button" disabled={saving} onClick={() => void saveMetadata()}>
                {saving ? 'Saving…' : 'Save details'}
              </Button>
            </div>
          </Card>

          <Card>
            <h2 className="text-lg font-bold">Plan criteria</h2>
            <p className="mt-1 text-sm text-slate-500">
              Users only see GLOBAL plans that match their gender, height, weight, and activity level.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700">Gender</span>
                <select
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  value={criteriaDraft.gender}
                  onChange={(event) => updateCriteriaDraft({ gender: event.target.value as PlanCriteriaDraft['gender'] })}
                >
                  <option value="">Select gender</option>
                  <option value="f">Female</option>
                  <option value="m">Male</option>
                </select>
              </label>
              <div className="text-sm sm:col-span-2">
                <span className="mb-1 block font-medium text-slate-700">Height range</span>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex items-center gap-2">
                    <span className="w-10 text-slate-500">Min</span>
                    <input
                      type="number"
                      min={0}
                      max={8}
                      placeholder="ft"
                      className="w-20 rounded-xl border border-slate-200 px-3 py-2"
                      value={criteriaDraft.heightMinFeet}
                      onChange={(event) => updateCriteriaDraft({ heightMinFeet: event.target.value })}
                    />
                    <input
                      type="number"
                      min={0}
                      max={11}
                      placeholder="in"
                      className="w-20 rounded-xl border border-slate-200 px-3 py-2"
                      value={criteriaDraft.heightMinInches}
                      onChange={(event) => updateCriteriaDraft({ heightMinInches: event.target.value })}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-10 text-slate-500">Max</span>
                    <input
                      type="number"
                      min={0}
                      max={8}
                      placeholder="ft"
                      className="w-20 rounded-xl border border-slate-200 px-3 py-2"
                      value={criteriaDraft.heightMaxFeet}
                      onChange={(event) => updateCriteriaDraft({ heightMaxFeet: event.target.value })}
                    />
                    <input
                      type="number"
                      min={0}
                      max={11}
                      placeholder="in"
                      className="w-20 rounded-xl border border-slate-200 px-3 py-2"
                      value={criteriaDraft.heightMaxInches}
                      onChange={(event) => updateCriteriaDraft({ heightMaxInches: event.target.value })}
                    />
                  </div>
                </div>
              </div>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700">Weight min (lbs)</span>
                <input
                  type="number"
                  min={0}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  value={criteriaDraft.weightMinLbs}
                  onChange={(event) => updateCriteriaDraft({ weightMinLbs: event.target.value })}
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700">Weight max (lbs)</span>
                <input
                  type="number"
                  min={0}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  value={criteriaDraft.weightMaxLbs}
                  onChange={(event) => updateCriteriaDraft({ weightMaxLbs: event.target.value })}
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700">Activity min</span>
                <select
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  value={criteriaDraft.activityLevelMin}
                  onChange={(event) => updateCriteriaDraft({ activityLevelMin: event.target.value })}
                >
                  <option value="">Select level</option>
                  {ACTIVITY_LEVEL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700">Activity max</span>
                <select
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  value={criteriaDraft.activityLevelMax}
                  onChange={(event) => updateCriteriaDraft({ activityLevelMax: event.target.value })}
                >
                  <option value="">Select level</option>
                  {ACTIVITY_LEVEL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </Card>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="font-semibold text-slate-900">Planned day totals</p>
            <p className="mt-1 text-sm text-slate-600">
              {Math.round(dayTotals.calories)} kcal · {Math.round(dayTotals.protein)}g protein · {Math.round(dayTotals.carbs)}g carbs ·{' '}
              {Math.round(dayTotals.fat)}g fat
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Targets: {Math.round(template.calorieTarget)} kcal · {Math.round(template.proteinTarget)}g protein
            </p>
          </div>

          <div className="space-y-4">
            {template.meals.map((meal) => {
              const totals = mealTotals(meal);
              return (
                <Card key={meal.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-bold">{meal.name}</h3>
                      {meal.plannedTime && <p className="text-sm text-slate-500">{meal.plannedTime}</p>}
                      <p className="mt-1 text-sm text-slate-600">
                        {Math.round(totals.calories)} kcal · {Math.round(totals.protein)}g P · {meal.items.length} items
                      </p>
                    </div>
                    <button
                      type="button"
                      className="grid h-9 w-9 place-items-center rounded-xl text-blue-600 hover:bg-blue-50"
                      title="Edit meal"
                      onClick={() => setEditMealId(meal.id)}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </div>
                  {meal.items.length > 0 && (
                    <ul className="mt-3 space-y-1 text-sm text-slate-600">
                      {meal.items.map((item) => (
                        <li key={item.id}>
                          {item.nameSnapshot} · {Math.round(Number(item.calories))} kcal
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}

      <EditTemplateMealDrawer
        open={Boolean(editMealId)}
        meal={editMeal}
        onClose={() => setEditMealId(undefined)}
        onSaved={() => void load()}
      />
    </div>
  );
}
