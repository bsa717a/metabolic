import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { OnboardingCoachPicker } from './OnboardingCoachPicker';
import { CoachOnboardingChat } from './CoachOnboardingChat';
import { OnboardingPrimaryButton, OnboardingStepHeader } from './OnboardingUi';
import { OnboardingShell } from './OnboardingShell';
import { submitSetupForm } from './setupForm';
import { ThemeToggle } from '../layout/ThemeToggle';
import { coachWelcomeGoalsFromForm } from '../virtualCoach/coachWelcomeMessage';
import { setPendingCoachWelcome } from '../virtualCoach/coachWelcomePending';
import { beginSignupCoachHomeExperience } from '../../utils/signupDashboardExperience';
import { getVirtualCoach, type VirtualCoachId } from '../../data/virtualCoaches';
import { detectedTimezone } from '../../utils/timezoneOptions';
import type { SetupFormState } from '../../types/onboarding';

type NewUserOnboardingFlowProps = {
  form: SetupFormState;
  onChange: (key: keyof SetupFormState, value: string | boolean) => void;
  onComplete: () => void;
  firstName?: string | null;
};

export function NewUserOnboardingFlow({
  form,
  onChange,
  onComplete,
  firstName
}: NewUserOnboardingFlowProps) {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<'pickCoach' | 'chat'>('pickCoach');
  const [selectedCoachId, setSelectedCoachId] = useState<VirtualCoachId | ''>(
    (form.selectedVirtualCoachId as VirtualCoachId) || ''
  );
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef(form);

  useEffect(() => {
    formRef.current = form;
  }, [form]);

  const coach = getVirtualCoach(selectedCoachId || form.selectedVirtualCoachId);

  function handleFormPatch(patch: Partial<SetupFormState>) {
    formRef.current = { ...formRef.current, ...patch };
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) {
        onChange(key as keyof SetupFormState, value as string | boolean);
      }
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError('');
    try {
      const latest = formRef.current;
      const timezone = latest.timezone.trim() || detectedTimezone();
      const coachId = latest.trackingOnly ? undefined : latest.selectedVirtualCoachId.trim() || undefined;

      await submitSetupForm({
        ...latest,
        timezone: timezone || latest.timezone,
        selectedVirtualCoachId: latest.trackingOnly ? '' : latest.selectedVirtualCoachId
      });

      if (coachId) {
        setPendingCoachWelcome({
          coachId,
          welcomeGoals: coachWelcomeGoalsFromForm(latest)
        });
      }

      beginSignupCoachHomeExperience();
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
      setError(err instanceof Error ? err.message : 'Setup failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (phase === 'pickCoach') {
    return (
      <OnboardingShell footer="You can switch coaches anytime from Virtual Coach.">
        <OnboardingStepHeader
          headline="Choose your virtual coach"
          subheadline="Tap a coach to read their bio, then choose them — they'll walk you through the rest."
        />

        <div className="space-y-5">
          <OnboardingCoachPicker
            selectedId={selectedCoachId || form.selectedVirtualCoachId}
            onSelect={(id: VirtualCoachId) => {
              setSelectedCoachId(id);
              formRef.current = { ...formRef.current, selectedVirtualCoachId: id };
              onChange('selectedVirtualCoachId', id);
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
        <OnboardingStepHeader
          headline="Coach not found"
          subheadline="Pick a coach again to continue setup."
        />
        <OnboardingPrimaryButton type="button" onClick={() => setPhase('pickCoach')}>
          Back to coaches
        </OnboardingPrimaryButton>
      </OnboardingShell>
    );
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center bg-app-bg px-4 py-3 text-app-text sm:py-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="mb-2 w-full max-w-xl">
        <p className="text-center text-sm text-app-text-muted">
          Chat with <span className="font-medium text-app-text">{coach.name}</span> to set up your plan
        </p>
      </div>

      <div className="w-full max-w-xl">
        <CoachOnboardingChat
          coach={coach}
          form={form}
          firstName={firstName}
          onFormPatch={handleFormPatch}
          onSubmit={handleSubmit}
          submitting={submitting}
        />
      </div>

      {error ? <p className="mt-3 max-w-xl text-center text-sm text-red-500">{error}</p> : null}
    </main>
  );
}
