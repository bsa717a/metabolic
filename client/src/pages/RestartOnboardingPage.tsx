import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { api } from '../services/api';
import { resolveTimezone } from '../utils/timezoneOptions';
import { normalizeSetupGender, normalizeBirthDateKey } from '../utils/setupDraft';
import { LoadingOnboardingState } from '../components/onboarding/LoadingOnboardingState';
import { OnboardingErrorState } from '../components/onboarding/OnboardingErrorState';
import { OnboardingCoachPicker } from '../components/onboarding/OnboardingCoachPicker';
import { CoachOnboardingChat } from '../components/onboarding/CoachOnboardingChat';
import { OnboardingShell } from '../components/onboarding/OnboardingShell';
import { OnboardingStepHeader } from '../components/onboarding/OnboardingUi';
import { submitSetupForm } from '../components/onboarding/setupForm';
import { ThemeToggle } from '../components/layout/ThemeToggle';
import { coachWelcomeGoalsFromForm } from '../components/virtualCoach/coachWelcomeMessage';
import { setPendingCoachWelcome } from '../components/virtualCoach/coachWelcomePending';
import { getVirtualCoach, type VirtualCoachId } from '../data/virtualCoaches';
import type { AppUser, UserAccountDetails } from '../types';
import type { SetupDraft, SetupFormState } from '../types/onboarding';

type RestartOnboardingPageProps = {
  user: AppUser | null;
  onComplete: () => void;
};

function buildInitialForm(
  user: AppUser | null,
  draft: SetupDraft | null,
  profile: UserAccountDetails | null
): SetupFormState {
  const genderValue = normalizeSetupGender(draft?.gender || profile?.gender || user?.gender) || '';
  const birthDateValue =
    normalizeBirthDateKey(draft?.birthDate || profile?.birthDate || user?.birthDate) || '';
  const timezoneValue = resolveTimezone(
    draft?.timezone || profile?.timezone || user?.timezone || ''
  );

  return {
    weight: draft?.weight || '',
    goalWeight: draft?.goalWeight || '',
    bodyFat: draft?.bodyFat || '',
    goalBodyFat: draft?.goalBodyFat || '',
    heightFeet: profile?.heightFeet != null ? String(profile.heightFeet) : '',
    heightInches: profile?.heightInches != null ? String(profile.heightInches) : '',
    occupation: profile?.occupation || '',
    activityLevel: profile?.activityLevel != null ? String(profile.activityLevel) : '',
    coachCode: user?.coachCode || '',
    wantsCoach: draft?.wantsCoach || false,
    selectedVirtualCoachId: user?.selectedVirtualCoachId || '',
    trackingOnly: false,
    gender: genderValue as '' | 'm' | 'f',
    birthDate: birthDateValue,
    timezone: timezoneValue,
    phone: profile?.phone || user?.phone || '',
    foodAllergies: profile?.foodAllergies || ''
  };
}

export function RestartOnboardingPage({ user, onComplete }: RestartOnboardingPageProps) {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'pickCoach' | 'chat'>('pickCoach');
  const [form, setForm] = useState<SetupFormState | null>(null);
  const [selectedCoachId, setSelectedCoachId] = useState<VirtualCoachId | ''>('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<SetupFormState | null>(null);

  const loadUserData = useCallback(async () => {
    if (!user?.id) {
      setLoadError('Sign in to restart onboarding.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setLoadError(null);

    try {
      const [draft, profile] = await Promise.all([
        api<SetupDraft>('/api/onboarding/setup-draft'),
        api<UserAccountDetails>(`/api/users/${user.id}/profile`)
      ]);

      const initialForm = buildInitialForm(user, draft, profile);
      setForm(initialForm);
      formRef.current = initialForm;

      const coachId = (user.selectedVirtualCoachId as VirtualCoachId) || '';
      setSelectedCoachId(coachId);
      if (coachId) {
        setPhase('chat');
      }
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'Unable to load your profile details.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadUserData();
  }, [loadUserData]);

  useEffect(() => {
    if (form) {
      formRef.current = form;
    }
  }, [form]);

  function handleFormPatch(patch: Partial<SetupFormState>) {
    setForm((current) => {
      if (!current) return current;
      const updated = { ...current, ...patch };
      formRef.current = updated;
      return updated;
    });
  }

  function handleChange(key: keyof SetupFormState, value: string | boolean) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }

  async function handleSubmit() {
    if (!formRef.current) return;

    setSubmitting(true);
    setError('');
    try {
      const latest = formRef.current;
      const timezone = resolveTimezone(latest.timezone);
      const coachId = latest.selectedVirtualCoachId.trim() || undefined;

      await submitSetupForm({
        ...latest,
        timezone: timezone || latest.timezone,
        selectedVirtualCoachId: latest.selectedVirtualCoachId
      });

      if (coachId) {
        setPendingCoachWelcome({
          coachId,
          welcomeGoals: coachWelcomeGoalsFromForm(latest)
        });
      }

      onComplete();
      navigate('/', {
        replace: true,
        state: coachId
          ? {
              showCoachWelcome: true,
              coachId,
              welcomeGoals: coachWelcomeGoalsFromForm(latest)
            }
          : undefined
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setSubmitting(false);
    }
  }

  function handleBack() {
    navigate(-1);
  }

  if (isLoading) {
    return <LoadingOnboardingState />;
  }

  if (loadError) {
    return (
      <OnboardingErrorState message={loadError} onRetry={() => void loadUserData()} />
    );
  }

  if (!form) {
    return (
      <OnboardingErrorState
        message="Unable to load your profile."
        onRetry={() => void loadUserData()}
      />
    );
  }

  const coach = getVirtualCoach(selectedCoachId || form.selectedVirtualCoachId);

  if (phase === 'pickCoach') {
    return (
      <OnboardingShell footer="You can switch coaches anytime from Virtual Coach.">
        <div className="mb-4">
          <button
            type="button"
            onClick={handleBack}
            className="flex items-center gap-1 text-sm text-app-text-muted transition hover:text-app-text"
          >
            <ArrowLeft size={16} />
            Back
          </button>
        </div>
        <OnboardingStepHeader
          headline="Choose your guide"
          subheadline="Pick a virtual coach to walk you through updating your goals and preferences."
        />

        <div className="space-y-5">
          <OnboardingCoachPicker
            selectedId={selectedCoachId || form.selectedVirtualCoachId}
            onSelect={(id: VirtualCoachId) => {
              setSelectedCoachId(id);
              handleChange('selectedVirtualCoachId', id);
              setError('');
              setPhase('chat');
            }}
          />

          {error ? <p className="text-sm text-red-500">{error}</p> : null}
        </div>
      </OnboardingShell>
    );
  }

  if (!coach) {
    return (
      <OnboardingShell>
        <div className="mb-4">
          <button
            type="button"
            onClick={handleBack}
            className="flex items-center gap-1 text-sm text-app-text-muted transition hover:text-app-text"
          >
            <ArrowLeft size={16} />
            Back
          </button>
        </div>
        <OnboardingStepHeader
          headline="Coach not found"
          subheadline="Pick a coach to continue."
        />
        <button
          type="button"
          className="mt-4 rounded-xl bg-brand-navy px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-navy/90 dark:bg-brand-green dark:text-brand-navy"
          onClick={() => setPhase('pickCoach')}
        >
          Back to coaches
        </button>
      </OnboardingShell>
    );
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center bg-app-bg px-4 py-3 text-app-text sm:py-4">
      <div className="absolute left-4 top-4">
        <button
          type="button"
          onClick={handleBack}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-app-text-muted transition hover:bg-app-muted hover:text-app-text"
        >
          <ArrowLeft size={16} />
          Back
        </button>
      </div>
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="mb-2 w-full max-w-xl pt-8">
        <p className="text-center text-sm text-app-text-muted">
          Updating your plan with{' '}
          <span className="font-medium text-app-text">{coach.name}</span>
        </p>
      </div>

      <div className="w-full max-w-xl">
        <CoachOnboardingChat
          coach={coach}
          form={form}
          firstName={user?.firstName}
          onFormPatch={handleFormPatch}
          onSubmit={handleSubmit}
          submitting={submitting}
        />
      </div>

      {error ? (
        <p className="mt-3 max-w-xl text-center text-sm text-red-500">{error}</p>
      ) : null}
    </main>
  );
}
