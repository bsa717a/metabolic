import { useEffect, useState } from 'react';
import { api } from '../services/api';
import type { UserNutritionTargets } from '../types';
import { NOT_MEDICAL_ADVICE } from '../content/nutritionSources';
import { NutritionTargetCalculationExplainer } from '../components/nutrition/NutritionTargetCalculationExplainer';

/**
 * Full-page view of the existing "How are these calculated?" section, opened
 * from meal-plan targets so the formula and its citations are one tap away.
 */
export function NutritionSourcesPage() {
  const [targets, setTargets] = useState<UserNutritionTargets | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await api<UserNutritionTargets>('/api/nutrition-targets');
        if (!cancelled) setTargets(data);
      } catch {
        if (!cancelled) setTargets(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-3xl font-bold">Sources & methodology</h1>
        <p className="mt-2 text-sm text-app-text-muted">
          This is the same “How are these calculated?” section from your targets, with the sources for that formula.
        </p>
      </div>
      <p className="rounded-xl border border-app-border bg-app-muted px-3 py-2 text-sm text-app-text">{NOT_MEDICAL_ADVICE}</p>
      {loading ? (
        <p className="text-sm text-app-text-muted">Loading your calculation…</p>
      ) : (
        <NutritionTargetCalculationExplainer
          breakdown={targets?.formulaBreakdown ?? null}
          source={targets?.source ?? null}
          startExpanded
        />
      )}
    </div>
  );
}
