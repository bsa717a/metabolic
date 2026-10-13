import { useCallback, useEffect, useState } from 'react';
import { TodayNutrition } from '../components/dashboard/TodayNutrition';
import { api, todayKey } from '../services/api';
import type { AppUser, Meal } from '../types';
import { useNutritionMealsExpanded } from '../hooks/useNutritionMealsExpanded';
import { useWakeLock } from '../hooks/useWakeLock';

export function NutritionLogPage({
  mealsExpanded = false,
  onMealsExpandedSaved
}: {
  mealsExpanded?: boolean;
  onMealsExpandedSaved?: (user: AppUser) => void;
}) {
  useWakeLock(true);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { planExpanded, planSaveError, changePlanExpanded } = useNutritionMealsExpanded(
    mealsExpanded,
    onMealsExpandedSaved
  );

  const load = useCallback(async () => {
    const date = todayKey();
    try {
      await api(`/api/daily-logs/${date}/ensure`, { method: 'POST' });
      const data = await api<Meal[]>(`/api/daily-logs/${date}/meals`);
      setMeals(data);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load meals.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    function refresh() {
      void load();
    }
    window.addEventListener('nutrition-meals-updated', refresh);
    return () => window.removeEventListener('nutrition-meals-updated', refresh);
  }, [load]);

  if (loading) return <p className="text-app-text-muted">Loading nutrition...</p>;
  if (error) {
    return <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</div>;
  }

  return (
    <TodayNutrition
      meals={meals}
      allMeals={meals}
      onChange={() => void load()}
      showPlanToggle
      planExpanded={planExpanded}
      onPlanExpandedChange={(next) => void changePlanExpanded(next)}
      planSaveError={planSaveError}
    />
  );
}
