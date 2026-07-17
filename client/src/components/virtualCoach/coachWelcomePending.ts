import type { CoachWelcomeGoals } from './coachWelcomeMessage';

const STORAGE_KEY = 'metabolic:pendingCoachWelcome';

export type PendingCoachWelcome = {
  coachId: string;
  welcomeGoals?: CoachWelcomeGoals;
};

export function setPendingCoachWelcome(pending: PendingCoachWelcome) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
}

export function readPendingCoachWelcome(): PendingCoachWelcome | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PendingCoachWelcome;
    if (!parsed?.coachId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingCoachWelcome() {
  sessionStorage.removeItem(STORAGE_KEY);
}

export function consumePendingCoachWelcome(): PendingCoachWelcome | null {
  const pending = readPendingCoachWelcome();
  if (pending) clearPendingCoachWelcome();
  return pending;
}
