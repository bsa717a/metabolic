import { startOfUtcDay, startOfUtcWeek } from '../utils/dates.js';

export type MaterializeAction = 'skip' | 'routine' | 'template';

/** Current week (Monday, in the user's today) and later. Earlier weeks stay as logged. */
export function isInExerciseApplyWindow(date: Date, today: Date) {
  return startOfUtcDay(date) >= startOfUtcWeek(today);
}

/**
 * What to write onto a day that the client or coach is opening.
 *
 * Existing daily logs (imported clients, or any day that already has meals) never
 * went through exercise seeding, so a saved routine stayed invisible and the week
 * looked like rest. Opening the day applies that routine, or the resolved default
 * template when there is no routine.
 *
 * Days that already have exercises, were edited by hand, or were initialized stay
 * as they are. Weeks before the current one stay as logged. Empty days are not
 * filled by copying the previous workout, which would invent a plan.
 */
export function materializeAction(input: {
  initialized: boolean;
  manuallyEdited: boolean;
  scheduledCount: number;
  hasRoutine: boolean;
  hasResolvedTemplate: boolean;
  inApplyWindow: boolean;
}): MaterializeAction {
  if (!input.inApplyWindow) return 'skip';
  if (input.initialized || input.manuallyEdited || input.scheduledCount > 0) return 'skip';
  if (input.hasRoutine) return 'routine';
  if (input.hasResolvedTemplate) return 'template';
  return 'skip';
}
