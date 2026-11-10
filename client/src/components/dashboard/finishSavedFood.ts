import { api } from '../../services/api';

export type SavedFoodStep = 'apply-forward' | 'refresh';

// Retry only unfinished work after the item POST has succeeded.
export async function finishSavedFood(
  mealId: string,
  step: SavedFoodStep,
  refresh: () => void | Promise<void>
): Promise<{ step: SavedFoodStep; message: string } | null> {
  if (step === 'apply-forward') {
    try {
      await api(`/api/meals/${mealId}/apply-forward`, { method: 'POST' });
    } catch {
      return { step, message: 'Food saved for today, but updating future days failed. Retry the future-day update; do not add the food again.' };
    }
  }
  try {
    await refresh();
    return null;
  } catch {
    return { step: 'refresh', message: 'Food saved, but the dashboard could not refresh. Retry the refresh; do not add the food again.' };
  }
}
