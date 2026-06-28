import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { api } from '../../services/api';
import type { Meal, NutritionPlanTemplate, NutritionPlanTemplateSummary } from '../../types';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';

function formatMacros(template: NutritionPlanTemplateSummary) {
  return `${Math.round(template.calorieTarget)} kcal · ${Math.round(template.proteinTarget)}g protein · ${Math.round(template.carbTarget)}g carbs · ${Math.round(template.fatTarget)}g fat`;
}

function formatItemMacros(item: { calories: number; protein: number; carbs: number; fat: number }) {
  return `${Math.round(item.calories)} kcal · ${Math.round(item.protein)}g P · ${Math.round(item.carbs)}g C · ${Math.round(item.fat)}g F`;
}

function matchesSearch(template: NutritionPlanTemplateSummary, query: string) {
  const haystack = [
    template.name,
    template.description ?? '',
    formatMacros(template),
    String(template.mealCount),
    String(template.itemCount),
    template.visibility
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(query);
}

export function ApplyTemplateModal({
  open,
  selectedDate,
  meals,
  onClose,
  onApplied
}: {
  open: boolean;
  selectedDate: string;
  meals: Meal[];
  onClose: () => void;
  onApplied: () => void;
}) {
  const [templates, setTemplates] = useState<NutritionPlanTemplateSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [setAsDefault, setSetAsDefault] = useState(true);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [templateDetails, setTemplateDetails] = useState<Record<string, NutritionPlanTemplate>>({});
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);

  const hasActuals = meals.some((meal) => meal.items.some((item) => item.type === 'ACTUAL'));
  const applying = applyingId !== null;
  const filteredTemplates = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return templates;
    return templates.filter((template) => matchesSearch(template, query));
  }, [templates, searchQuery]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError('');
    setSearchQuery('');
    setSelectedId(null);
    setTemplateDetails({});
    setDetailErrors({});
    api<NutritionPlanTemplateSummary[]>('/api/nutrition-templates')
      .then(setTemplates)
      .catch((err) => {
        setTemplates([]);
        setError(err instanceof Error ? err.message : 'Unable to load plans');
      })
      .finally(() => setLoading(false));
  }, [open]);

  async function loadTemplateDetail(templateId: string) {
    if (templateDetails[templateId]) return;
    setLoadingDetailId(templateId);
    try {
      const detail = await api<NutritionPlanTemplate>(`/api/nutrition-templates/${templateId}`);
      setTemplateDetails((current) => ({ ...current, [templateId]: detail }));
      setDetailErrors((current) => {
        const next = { ...current };
        delete next[templateId];
        return next;
      });
    } catch (err) {
      setDetailErrors((current) => ({
        ...current,
        [templateId]: err instanceof Error ? err.message : 'Unable to load plan details'
      }));
    } finally {
      setLoadingDetailId((current) => (current === templateId ? null : current));
    }
  }

  async function selectTemplate(templateId: string) {
    setError('');
    if (selectedId === templateId) {
      setSelectedId(null);
      return;
    }
    setSelectedId(templateId);
    await loadTemplateDetail(templateId);
  }

  async function apply(templateId: string) {
    if (applying) return;
    setApplyingId(templateId);
    setError('');
    try {
      await api(`/api/daily-logs/${selectedDate}/apply-template`, {
        method: 'POST',
        body: JSON.stringify({ templateId, setAsDefault })
      });
      onApplied();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to apply plan');
    } finally {
      setApplyingId(null);
    }
  }

  return (
    <Drawer open={open} title="Use nutrition plan" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-500">
          Apply a plan to <strong>{selectedDate}</strong>. This replaces planned meals and macro targets for that day.
        </p>

        {hasActuals && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            This day has logged meals. Applying a plan will remove existing planned and logged items for this day.
          </div>
        )}

        {loading && <p className="text-sm text-slate-500">Loading plans…</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        {!loading && templates.length === 0 && !error && (
          <p className="text-sm text-slate-500">No plans available. Ask an admin to create one.</p>
        )}

        {!loading && templates.length > 0 && (
          <>
            <div className="relative">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                aria-hidden
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search plans…"
                aria-label="Search plans"
                disabled={applying}
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:opacity-60"
              />
            </div>
            {filteredTemplates.length === 0 && (
              <p className="text-sm text-slate-500">No plans match your search.</p>
            )}
            <ul className="space-y-2">
              {filteredTemplates.map((template) => {
                const selected = selectedId === template.id;
                const detail = templateDetails[template.id];
                const loadingDetail = loadingDetailId === template.id;
                const detailError = detailErrors[template.id];
                return (
                  <li
                    key={template.id}
                    className={`rounded-2xl border transition ${
                      selected ? 'border-blue-300 bg-blue-50 ring-1 ring-blue-200' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <button
                      type="button"
                      className="flex w-full items-start justify-between gap-3 p-4 text-left"
                      disabled={applying}
                      onClick={() => void selectTemplate(template.id)}
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900">{template.name}</p>
                        {template.description && <p className="mt-1 text-sm text-slate-500">{template.description}</p>}
                        <p className="mt-2 text-xs text-slate-500">{formatMacros(template)}</p>
                        <p className="text-xs text-slate-400">
                          {template.mealCount} meals · {template.itemCount} food items
                        </p>
                      </div>
                      <ChevronDown
                        size={18}
                        className={`shrink-0 text-slate-400 transition-transform ${selected ? 'rotate-180' : ''}`}
                        aria-hidden
                      />
                    </button>
                    {selected && (
                      <div className="border-t border-blue-200/80 px-4 pb-4 pt-3">
                        {loadingDetail && <p className="text-sm text-slate-500">Loading meals…</p>}
                        {!loadingDetail && detail && detail.meals.length > 0 && (
                          <ul className="space-y-3">
                            {detail.meals.map((meal) => (
                              <li key={meal.id} className="rounded-xl bg-white/80 px-3 py-2 ring-1 ring-blue-100">
                                <p className="text-sm font-medium text-slate-900">
                                  {meal.mealNumber}. {meal.name}
                                  {meal.plannedTime ? ` · ${meal.plannedTime}` : ''}
                                </p>
                                {meal.items.length > 0 ? (
                                  <ul className="mt-2 space-y-1">
                                    {meal.items.map((item) => (
                                      <li key={item.id} className="text-sm text-slate-600">
                                        <span className="font-medium text-slate-800">{item.nameSnapshot}</span>
                                        <span className="text-slate-500"> · {formatItemMacros(item)}</span>
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="mt-1 text-sm text-slate-500">No foods planned</p>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                        {!loadingDetail && detail && detail.meals.length === 0 && (
                          <p className="text-sm text-slate-500">This plan has no meals yet.</p>
                        )}
                        {!loadingDetail && !detail && detailError && (
                          <p className="text-sm text-amber-700">Could not load preview. You can still apply this plan.</p>
                        )}
                        {!loadingDetail && (
                          <Button
                            type="button"
                            className="mt-3 px-3 py-1.5 text-xs"
                            disabled={applying}
                            onClick={() => void apply(template.id)}
                          >
                            {applyingId === template.id ? 'Applying…' : 'Apply'}
                          </Button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={setAsDefault}
            disabled={applying}
            onChange={(event) => setSetAsDefault(event.target.checked)}
          />
          <span>Use as my default plan for future days</span>
        </label>
      </div>
    </Drawer>
  );
}
