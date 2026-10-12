import { useCallback, useEffect, useState } from 'react';
import { TodayNutrition } from '../components/dashboard/TodayNutrition';
import { api, todayKey } from '../services/api';
import type { AppUser, Meal } from '../types';
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
  const [planExpanded, setPlanExpanded] = useState(mealsExpanded);
  const [planSaveError, setPlanSaveError] = useState('');

  useEffect(() => {
    setPlanExpanded(mealsExpanded);
  }, [mealsExpanded]);

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

  async function changePlanExpanded(next: boolean) {
    const previous = planExpanded;
    setPlanExpanded(next);
    setPlanSaveError('');
    try {
      const result = await api<{ user: AppUser }>('/api/me/nutrition-meals-expanded', {
        method: 'PUT',
        body: JSON.stringify({ expanded: next })
      });
      onMealsExpandedSaved?.(result.user);
    } catch (err) {
      setPlanExpanded(previous);
      setPlanSaveError(err instanceof Error ? err.message : 'Could not save that choice.');
    }
  }

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
