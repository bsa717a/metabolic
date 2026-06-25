import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import {
  OnboardingGoalSummary,
  OnboardingPersonalFields,
  OnboardingWeightFields
} from './OnboardingFields';
import { OnboardingPrimaryButton, OnboardingStepHeader } from './OnboardingUi';
import { OnboardingShell } from './OnboardingShell';
import { onboardingCardClass } from './onboardingStyles';
import { submitSetupForm, validateSetupForm } from './setupForm';
import type { SetupFormState } from '../../types/onboarding';
import { hasValidCurrentWeight } from '../../utils/onboardingWeight';

function ModeCard({
  title,
  description,
  recommended,
  onClick
}: {
  title: string;
  description: string;
  recommended?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${onboardingCardClass} flex w-full items-center justify-between gap-4 text-left transition hover:border-brand-green/60 hover:bg-app-muted/60`}
    >
      <span>
        <span className="flex items-center gap-2">
          <span className="font-semibold text-brand-navy dark:text-brand-off-white">{title}</span>
          {recommended ? (
            <span className="rounded-full bg-brand-green/15 px-2 py-0.5 text-xs font-medium text-brand-green">
              Recommended
            </span>
          ) : null}
        </span>
        <span className="mt-1 block text-sm text-app-text-muted">{description}</span>
      </span>
      <ArrowRight size={18} className="shrink-0 text-app-text-muted" aria-hidden />
    </button>
  );
}

type NewUserOnboardingFlowProps = {
  form: SetupFormState;
  onChange: (key: keyof SetupFormState, value: string | boolean) => void;
  onComplete: () => void;
};

export function NewUserOnboardingFlow({ form, onChange, onComplete }: NewUserOnboardingFlowProps) {
  const navigate = useNavigate();
  const [modeChosen, setModeChosen] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function validateBaselineStep() {
    if (!hasValidCurrentWeight(Number(form.weight))) {
      setError('Enter your current weight.');
      return false;
    }
    const feet = Number(form.heightFeet);
    if (!form.heightFeet.trim() || !Number.isInteger(feet) || feet < 1 || feet > 8) {
      setError('Enter your height.');
      return false;
    }
    if (form.heightInches.trim()) {
      const inches = Number(form.heightInches);
      if (!Number.isInteger(inches) || inches < 0 || inches > 11) {
        setError('Height inches must be a whole number from 0 to 11.');
        return false;
      }
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

  if (!modeChosen) {
    return (
      <OnboardingShell footer="You can switch to a coached plan anytime.">
        <OnboardingStepHeader
          headline="How do you want to start?"
          subheadline="Pick what fits you right now — you can change this later."
        />

        <div className="space-y-3">
          <ModeCard
            title="Get on a plan"
            description="A structured weekly plan with meals, targets, and coach support."
            recommended
            onClick={() => {
              onChange('trackingOnly', false);
              setModeChosen(true);
            }}
          />
          <ModeCard
            title="Just track my food"
            description="Log meals freely and set your own calorie and protein goals — no plan or coach."
            onClick={() => {
              onChange('trackingOnly', true);
              setModeChosen(true);
            }}
          />
        </div>
      </OnboardingShell>
    );
  }

  if (step === 0) {
    return (
      <OnboardingShell footer="This is quick — just a baseline to get started.">
        <OnboardingStepHeader
          headline="Start where you are."
          subheadline={
            form.trackingOnly
              ? 'A quick baseline helps us track your progress.'
              : 'A quick baseline helps us build your starter plan.'
          }
        />

        <div className="space-y-5">
          <OnboardingWeightFields
            form={form}
            onChange={onChange}
            showGoalWeight={false}
            showGoalBodyFat={false}
            showHeight
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
        headline={form.trackingOnly ? 'Personalize tracking.' : 'Personalize the plan.'}
        subheadline={
          form.trackingOnly
            ? 'Final details help tune reminders and age-based calculations.'
            : 'Final details help tune reminders, age-based calculations, and coach support.'
        }
      />

      <div className="space-y-5">
        <OnboardingPersonalFields form={form} onChange={onChange} showCoach={!form.trackingOnly} />

        {error ? <p className="text-sm text-red-500">{error}</p> : null}

        <OnboardingPrimaryButton
          type="button"
          loading={submitting}
          loadingLabel={form.trackingOnly ? 'Setting up tracking…' : 'Creating your starter plan…'}
          onClick={() => void handleFinish()}
        >
          {form.trackingOnly ? 'Start Tracking' : 'Create My Starter Plan →'}
        </OnboardingPrimaryButton>
      </div>
    </OnboardingShell>
  );
}
