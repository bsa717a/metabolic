import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import { detectedTimezone } from '../utils/timezoneOptions';
import { isMigratedOnboardingUser } from '../utils/onboardingWeight';
import { normalizeBirthDateKey, normalizeSetupGender } from '../utils/setupDraft';
import { LoadingOnboardingState } from '../components/onboarding/LoadingOnboardingState';
import { OnboardingErrorState } from '../components/onboarding/OnboardingErrorState';
import { MigrationConfirmationFlow } from '../components/onboarding/MigrationConfirmationFlow';
import { NewUserOnboardingFlow } from '../components/onboarding/NewUserOnboardingFlow';
import {
  applyDraftToForm,
  createEmptySetupForm
} from '../components/onboarding/setupForm';
import type { AppUser, UserAccountDetails } from '../types';
import type { SetupDraft, SetupFormState } from '../types/onboarding';

type FirstTimeSetupPageProps = {
  user?: AppUser | null;
  onComplete: () => void;
};

export function FirstTimeSetupPage({ user, onComplete }: FirstTimeSetupPageProps) {
  const [isCheckingProfile, setIsCheckingProfile] = useState(true);
  const [isMigratedUser, setIsMigratedUser] = useState(false);
  const [profileLoadError, setProfileLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<SetupFormState>(() => ({
    ...createEmptySetupForm(),
    gender: normalizeSetupGender(user?.gender),
    birthDate: normalizeBirthDateKey(user?.birthDate),
    timezone: user?.timezone?.trim() || detectedTimezone()
  }));

  const loadProfile = useCallback(async () => {
    if (!user?.id) {
      setProfileLoadError('Sign in to continue setup.');
      setIsCheckingProfile(false);
      return;
    }

    setIsCheckingProfile(true);
    setProfileLoadError(null);

    try {
      const [draft, profile] = await Promise.all([
        api<SetupDraft>('/api/onboarding/setup-draft'),
        api<UserAccountDetails>(`/api/users/${user.id}/profile`)
      ]);

      setForm((current) => applyDraftToForm(current, draft, profile, user));
      setIsMigratedUser(isMigratedOnboardingUser(draft));
    } catch (err) {
      setProfileLoadError(
        err instanceof Error ? err.message : 'Unable to load your profile details.'
      );
    } finally {
      setIsCheckingProfile(false);
    }
  }, [user]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  function handleChange(key: keyof SetupFormState, value: string | boolean) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  if (isCheckingProfile) {
    return <LoadingOnboardingState />;
  }

  if (profileLoadError) {
    return <OnboardingErrorState message={profileLoadError} onRetry={() => void loadProfile()} />;
  }

  if (isMigratedUser) {
    return (
      <MigrationConfirmationFlow form={form} onChange={handleChange} onComplete={onComplete} />
    );
  }

  return <NewUserOnboardingFlow form={form} onChange={handleChange} onComplete={onComplete} />;
}
