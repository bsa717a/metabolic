import { useEffect, useState } from 'react';
import { api } from '../services/api';
import type { AppUser } from '../types';

/** Home and /nutrition share this account setting. It is not stored in the browser. */
export function useNutritionMealsExpanded(
  mealsExpanded: boolean,
  onSaved?: (user: AppUser) => void
) {
  const [planExpanded, setPlanExpanded] = useState(mealsExpanded);
  const [planSaveError, setPlanSaveError] = useState('');

  useEffect(() => {
    setPlanExpanded(mealsExpanded);
  }, [mealsExpanded]);

  async function changePlanExpanded(next: boolean) {
    const previous = planExpanded;
    setPlanExpanded(next);
    setPlanSaveError('');
    try {
      const result = await api<{ user: AppUser }>('/api/me/nutrition-meals-expanded', {
        method: 'PUT',
        body: JSON.stringify({ expanded: next })
      });
      onSaved?.(result.user);
    } catch (err) {
      setPlanExpanded(previous);
      setPlanSaveError(err instanceof Error ? err.message : 'Could not save that choice.');
    }
  }

  return { planExpanded, planSaveError, changePlanExpanded };
}
