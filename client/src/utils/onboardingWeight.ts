import type { SetupDraft } from '../types/onboarding';

export function hasValidCurrentWeight(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0;
}

export function isMigratedOnboardingUser(draft: Pick<SetupDraft, 'hasExistingWeight' | 'weight'>) {
  if (draft.hasExistingWeight) return true;
  return hasValidCurrentWeight(draft.weight);
}
