import { useEffect, useState } from 'react';
import type { AppUser } from '../types';
import { api } from '../services/api';
import {
  parseMealPlanLayout,
  readStoredMealPlanLayout,
  writeStoredMealPlanLayout,
  type MealPlanLayout
} from '../utils/mealPlanLayout';

export function useMealPlanLayout(user?: AppUser | null, onUserUpdated?: (user: AppUser) => void) {
  const serverLayout =
    user?.mealPlanLayout === 'horizontal' || user?.mealPlanLayout === 'vertical' ? user.mealPlanLayout : null;
  const [pending, setPending] = useState<MealPlanLayout | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const layout = pending ?? serverLayout ?? readStoredMealPlanLayout();

  useEffect(() => {
    if (serverLayout) writeStoredMealPlanLayout(serverLayout);
  }, [serverLayout]);

  async function updateLayout(next: MealPlanLayout) {
    const choice = parseMealPlanLayout(next);
    const previous = layout;
    setPending(choice);
    writeStoredMealPlanLayout(choice);
    setSaving(true);
    setError(null);
    try {
      const result = await api<{ user: AppUser }>('/api/me/meal-plan-layout', {
        method: 'PUT',
        body: JSON.stringify({ layout: choice })
      });
      onUserUpdated?.(result.user);
    } catch (err) {
      setPending(previous);
      writeStoredMealPlanLayout(previous);
      setError(err instanceof Error ? err.message : 'Could not save meal layout.');
    } finally {
      setSaving(false);
    }
  }

  return { layout, saving, error, updateLayout };
}
