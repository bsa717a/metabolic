import type { SetupDraft } from '../types/onboarding';

export function hasValidCurrentWeight(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0;
}

export function isMigratedOnboardingUser(draft: Pick<SetupDraft, 'hasExistingWeight' | 'weight'>) {
  if (draft.hasExistingWeight) return true;
  return hasValidCurrentWeight(draft.weight);
}

/** Import often copies current weight into the goal. That is not a chosen target. */
export function goalWeightNeedsEntry(current: string, goal: string) {
  if (!hasValidCurrentWeight(goal)) return true;
  if (!hasValidCurrentWeight(current)) return false;
  return Number(current) === Number(goal);
}
