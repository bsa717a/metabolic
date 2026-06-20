import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  OnboardingGoalSummary,
  OnboardingPersonalFields,
  OnboardingWeightFields
} from './OnboardingFields';
import { OnboardingPrimaryButton, OnboardingStepHeader } from './OnboardingUi';
import { OnboardingShell } from './OnboardingShell';
import { submitSetupForm, validateSetupForm } from './setupForm';
import type { SetupFormState } from '../../types/onboarding';
import { hasValidCurrentWeight } from '../../utils/onboardingWeight';

type NewUserOnboardingFlowProps = {
  form: SetupFormState;
  onChange: (key: keyof SetupFormState, value: string | boolean) => void;
  onComplete: () => void;
};

export function NewUserOnboardingFlow({ form, onChange, onComplete }: NewUserOnboardingFlowProps) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function validateBaselineStep() {
    if (!hasValidCurrentWeight(Number(form.weight))) {
      setError('Enter your current weight.');
      return false;
    }
    if (form.bodyFat.trim()) {
      const bodyFat = Number(form.bodyFat);
      if (!Number.isFinite(bodyFat) || bodyFat <= 0) {
        setError('Enter a valid current body fat percentage.');
        return false;
      }
    }
    setError('');
    return true;
  }

  function validateTargetStep() {
    if (!hasValidCurrentWeight(Number(form.goalWeight))) {
      setError('Enter your goal weight.');
      return false;
    }
    if (form.goalBodyFat.trim()) {
      const goalBodyFat = Number(form.goalBodyFat);
      if (!Number.isFinite(goalBodyFat) || goalBodyFat <= 0) {
        setError('Enter a valid goal body fat percentage.');
        return false;
      }
    }
    setError('');
    return true;
  }

  function validatePersonalizeStep() {
    const message = validateSetupForm(form, { requireGoalWeight: true, requireTimezone: true });
    if (message) {
      setError(message);
      return false;
    }
    setError('');
    return true;
  }

  async function handleFinish() {
    if (!validatePersonalizeStep()) return;

    setSubmitting(true);
    try {
      await submitSetupForm(form);
      onComplete();
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (step === 0) {
    return (
      <OnboardingShell footer="This is quick — just a baseline to get started.">
        <OnboardingStepHeader
          headline="Start where you are."
          subheadline="A quick baseline helps us build your starter plan."
        />

        <div className="space-y-5">
          <OnboardingWeightFields
            form={form}
            onChange={onChange}
            showGoalWeight={false}
            showGoalBodyFat={false}
          />

          {error ? <p className="text-sm text-red-500">{error}</p> : null}

          <OnboardingPrimaryButton
            onClick={() => {
              if (validateBaselineStep()) setStep(1);
            }}
          >
            Next: Set My Target →
          </OnboardingPrimaryButton>
        </div>
      </OnboardingShell>
    );
  }

  if (step === 1) {
    return (
      <OnboardingShell footer="You can adjust your targets anytime.">
        <OnboardingStepHeader
          headline="Choose the target."
          subheadline="We'll use this to shape the journey. You can adjust it later."
        />

        <div className="space-y-5">
          <OnboardingGoalSummary form={form} />

          <OnboardingWeightFields
            form={form}
            onChange={onChange}
            showCurrentWeight={false}
            showCurrentBodyFat={false}
          />

          {error ? <p className="text-sm text-red-500">{error}</p> : null}

          <OnboardingPrimaryButton
            onClick={() => {
              if (validateTargetStep()) setStep(2);
            }}
          >
            Next: Personalize It →
          </OnboardingPrimaryButton>
        </div>
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell footer="One last step, then your dashboard is ready.">
      <OnboardingStepHeader
        headline="Personalize the plan."
        subheadline="Final details help tune reminders, age-based calculations, and coach support."
      />

      <div className="space-y-5">
        <OnboardingPersonalFields form={form} onChange={onChange} />

        {error ? <p className="text-sm text-red-500">{error}</p> : null}

        <OnboardingPrimaryButton
          type="button"
          loading={submitting}
          loadingLabel="Creating your starter plan…"
          onClick={() => void handleFinish()}
        >
          Create My Starter Plan →
        </OnboardingPrimaryButton>
      </div>
    </OnboardingShell>
  );
}
