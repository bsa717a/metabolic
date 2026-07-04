import { useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft } from 'lucide-react';
import type { Meal } from '../../types';
import { api } from '../../services/api';
import { Drawer } from '../ui/Drawer';
import type { MealRecommendationsPayload, RecommendedMeal } from '../../utils/mealCards';

export function MealSuggestionsDrawer({
  open,
  date,
  meal,
  onClose,
  onSaved
}: {
  open: boolean;
  date: string;
  meal: Meal | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [craving, setCraving] = useState('');
  const [recs, setRecs] = useState<MealRecommendationsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<RecommendedMeal | null>(null);
  const [saving, setSaving] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    if (!open || !meal) return;
    setCraving('');
    setRecs(null);
    setError(null);
    setChosen(null);
    void loadRecommendations('');
  }, [open, date, meal?.id, meal?.mealNumber]);

  async function loadRecommendations(cravingValue: string) {
    if (!meal) return;
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    setChosen(null);
    try {
      const params = new URLSearchParams({ mealNumber: String(meal.mealNumber) });
      if (cravingValue.trim()) params.set('craving', cravingValue.trim());
      const result = await api<MealRecommendationsPayload>(`/api/daily-logs/${date}/meal-recommendations?${params}`);
      if (id !== requestId.current) return;
      setRecs(result);
    } catch (err) {
      if (id !== requestId.current) return;
      setRecs(null);
      setError(err instanceof Error ? err.message : 'Could not get suggestions.');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }

  async function saveRecommendation(option: RecommendedMeal) {
    if (!meal) return;
    setSaving(true);
    setError(null);
    try {
      await api(`/api/daily-logs/${date}/meal-recommendation`, {
        method: 'POST',
        body: JSON.stringify({
          mealNumber: meal.mealNumber,
          suggestion: { name: option.name, description: option.description, items: option.items }
        })
      });
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that meal.');
    } finally {
      setSaving(false);
    }
  }

  const targetCalories = recs?.targetCalories ?? Math.round(Number(meal?.plannedCalories ?? 0));

  return (
    <Drawer
      open={open}
      title="AI Suggestions"
      onClose={onClose}
      headerActions={
        chosen ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-sm font-semibold text-brand-green"
            onClick={() => setChosen(null)}
          >
            <ChevronLeft size={16} />
            Back
          </button>
        ) : undefined
      }
    >
      {meal && (
        <div className="space-y-4">
          <p className="text-sm text-app-text-muted">
            Complete meal ideas for <span className="font-semibold text-app-text">{meal.name}</span>
            {targetCalories > 0 && (
              <>
                {' '}
                — about <span className="font-semibold text-app-text">{targetCalories} kcal</span> per meal
              </>
            )}
            .
          </p>

          {!chosen && (
            <input
              type="text"
              value={craving}
              onChange={(e) => setCraving(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void loadRecommendations(craving)}
              placeholder='Optional: what sounds good? ("something spicy", "no fish tonight")'
              className="w-full rounded-xl border border-app-border bg-app-surface px-3.5 py-2.5 text-sm text-app-text placeholder:text-app-text-muted focus:border-brand-green focus:outline-none"
            />
          )}

          {loading && (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-24 animate-pulse rounded-2xl bg-app-muted" />
              ))}
              <p className="text-center text-xs text-app-text-muted">Cooking up ideas…</p>
            </div>
          )}

          {error && (
            <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
              <button type="button" onClick={() => void loadRecommendations(craving)} className="ml-2 font-bold underline">
                Try again
              </button>
            </div>
          )}

          {!loading && !chosen && recs && (
            <>
              {recs.options.map((option) => (
                <button
                  key={option.name}
                  type="button"
                  onClick={() => setChosen(option)}
                  className="w-full rounded-2xl border-2 border-app-border bg-app-surface px-4 py-3 text-left transition hover:border-brand-green-light"
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-bold text-app-text">{option.name}</span>
                    <span className="shrink-0 text-xs font-semibold text-app-text-muted">
                      {option.totals.calories} kcal · {Math.round(option.totals.protein)}p · {Math.round(option.totals.carbs)}c ·{' '}
                      {Math.round(option.totals.fat)}f
                    </span>
                  </span>
                  <span className="mt-0.5 block text-xs text-app-text-muted">{option.description}</span>
                  <span className="mt-1.5 flex flex-wrap gap-1.5">
                    {option.bloodSugarStable && (
                      <span className="rounded-full bg-brand-green/15 px-2 py-0.5 text-[10px] font-bold text-brand-deep">Stable blood sugar</span>
                    )}
                    {option.withinBand ? (
                      <span className="rounded-full bg-brand-green/15 px-2 py-0.5 text-[10px] font-bold text-brand-deep">On target</span>
                    ) : (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">Near target</span>
                    )}
                  </span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => void loadRecommendations(craving)}
                className="w-full rounded-xl border border-app-border bg-app-surface px-4 py-2.5 text-sm font-semibold text-app-text transition hover:bg-app-muted"
              >
                Show me different ones
              </button>
            </>
          )}

          {chosen && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-app-border bg-app-surface p-4">
                <p className="text-lg font-bold text-app-text">{chosen.name}</p>
                <p className="mt-1 text-sm text-app-text-muted">{chosen.description}</p>
                <ul className="mt-3 divide-y divide-app-muted">
                  {chosen.items.map((item) => (
                    <li key={item.name} className="flex items-baseline gap-2 py-1.5 text-sm">
                      <Check size={14} className="shrink-0 self-center text-brand-green" strokeWidth={3} />
                      <span className="min-w-0 flex-1 text-app-text">{item.name}</span>
                      <span className="shrink-0 text-xs font-semibold text-brand-green">
                        {item.quantity} {item.unit}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-sm font-semibold text-app-text">
                  {chosen.totals.calories} kcal · {Math.round(chosen.totals.protein)}g protein · {Math.round(chosen.totals.carbs)}g carbs ·{' '}
                  {Math.round(chosen.totals.fat)}g fat
                </p>
                {targetCalories > 0 && (
                  <p className="mt-1 text-xs text-app-text-muted">Target {targetCalories} kcal (±10%)</p>
                )}
              </div>
              <p className="text-center text-xs text-app-text-muted">
                Saving replaces this meal&apos;s plan from today forward. Days where you&apos;ve already logged food are left alone.
              </p>
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveRecommendation(chosen)}
                className="w-full rounded-xl bg-brand-green px-6 py-3 text-sm font-bold text-white transition hover:bg-brand-deep disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Use this meal'}
              </button>
            </div>
          )}

          {!chosen && (
            <p className="text-center text-xs text-app-text-muted">
              AI-estimated portions and macros — double-check ingredients if you have allergies.
            </p>
          )}
        </div>
      )}
    </Drawer>
  );
}
