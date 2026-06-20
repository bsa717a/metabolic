import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  OnboardingChecklist,
  OnboardingPrimaryButton,
  OnboardingStepHeader
} from './OnboardingUi';
import { OnboardingPersonalFields, OnboardingWeightFields } from './OnboardingFields';
import { OnboardingShell } from './OnboardingShell';
import { onboardingChecklistClass } from './onboardingStyles';
import { submitSetupForm, validateSetupForm } from './setupForm';
import type { SetupFormState } from '../../types/onboarding';

type MigrationConfirmationFlowProps = {
  form: SetupFormState;
  onChange: (key: keyof SetupFormState, value: string | boolean) => void;
  onComplete: () => void;
};

export function MigrationConfirmationFlow({
  form,
  onChange,
  onComplete
}: MigrationConfirmationFlowProps) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function validateConfirmStep() {
    const message = validateSetupForm(form, {
      requireGoalWeight: false,
      requireTimezone: false
    });
    if (message) {
      setError(message);
      return false;
    }
    setError('');
    return true;
  }

  function handleConfirmNext() {
    if (!validateConfirmStep()) return;
    setStep(2);
  }

  function handleSkipConfirm() {
    if (!validateConfirmStep()) return;
    setStep(2);
  }

  async function handleFinish() {
    setError('');
    setSubmitting(true);
    try {
      await submitSetupForm(form, { requireGoalWeight: false, requireTimezone: false });
      onComplete();
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save your info');
    } finally {
      setSubmitting(false);
    }
  }

  if (step === 0) {
    return (
      <OnboardingShell footer="Nothing lost. Just upgraded.">
        <OnboardingStepHeader
          headline="Your progress moved with you."
          subheadline="We brought over your profile and history from the previous system. Take a quick look, confirm anything that changed, and you're ready to go."
        />

        <div className={onboardingChecklistClass}>
          <OnboardingChecklist
            items={[
              'Profile details imported',
              'Starting metrics imported',
              'Previous progress saved'
            ]}
          />
        </div>

        <div className="mt-6">
          <OnboardingPrimaryButton onClick={() => setStep(1)}>Review My Info →</OnboardingPrimaryButton>
        </div>
      </OnboardingShell>
    );
  }

  if (step === 1) {
    return (
      <OnboardingShell footer="Update anything that changed, or leave it as-is and continue.">
        <OnboardingStepHeader
          headline="Confirm your info"
          subheadline="This is what we imported. Update anything that changed, or leave it as-is and continue."
        />

        <div className="space-y-5">
          <OnboardingWeightFields form={form} onChange={onChange} />
          <OnboardingPersonalFields form={form} onChange={onChange} />

          {error ? <p className="text-sm text-red-500">{error}</p> : null}

          <OnboardingPrimaryButton onClick={handleConfirmNext}>Looks Good →</OnboardingPrimaryButton>

          <button
            type="button"
            className="w-full text-center text-sm font-medium text-app-text-muted underline-offset-2 hover:text-app-text hover:underline"
            onClick={handleSkipConfirm}
          >
            I&apos;ll update this later
          </button>
        </div>
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell footer="Your imported data is ready to go.">
      <OnboardingStepHeader
        headline="You're all set."
        subheadline="Your imported data is ready, your profile is confirmed, and your starter plan can continue from here."
      />

      <div className={onboardingChecklistClass}>
        <OnboardingChecklist
          items={[
            'Plan history is intact',
            'Goals are confirmed',
            'Coach support can continue'
          ]}
        />
      </div>

      <div className="mt-6 space-y-3">
        {error ? <p className="text-sm text-red-500">{error}</p> : null}
        <OnboardingPrimaryButton
          loading={submitting}
          loadingLabel="Saving your info…"
          onClick={() => void handleFinish()}
        >
          Go to My Dashboard →
        </OnboardingPrimaryButton>
      </div>
    </OnboardingShell>
  );
}
