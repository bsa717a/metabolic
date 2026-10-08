import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BirthDateInput } from '../ui/BirthDateInput';
import { NumberInput } from '../ui/NumberInput';
import { ACTIVITY_LEVEL_OPTIONS } from '../../utils/activityLevel';
import { goalWeightNeedsEntry } from '../../utils/onboardingWeight';
import { resolveTimezone, timezoneOptions } from '../../utils/timezoneOptions';
import { getVirtualCoach, type VirtualCoachId } from '../../data/virtualCoaches';
import {
  OnboardingChecklist,
  OnboardingPrimaryButton,
  OnboardingStepHeader
} from './OnboardingUi';
import { OnboardingCoachPicker } from './OnboardingCoachPicker';
import { OnboardingShell } from './OnboardingShell';
import { onboardingCardClass, onboardingChecklistClass, onboardingFieldClass, onboardingInputClass } from './onboardingStyles';
import { submitSetupForm } from './setupForm';
import type { SetupFormState } from '../../types/onboarding';

type MigrationConfirmationFlowProps = {
  form: SetupFormState;
  onChange: (key: keyof SetupFormState, value: string | boolean) => void;
  onComplete: () => void;
  coachName?: string;
  hasStoredTimezone: boolean;
};

type MigrationStep =
  | 'welcome'
  | 'confirm'
  | 'timezone'
  | 'goalWeight'
  | 'birthDate'
  | 'activity'
  | 'virtualCoach'
  | 'textReminders'
  | 'done';

const choiceButtonClass =
  'rounded-full border border-app-border bg-app-bg px-3 py-2 text-left text-sm font-medium text-app-text transition hover:border-brand-green/50 hover:bg-brand-green/10';

function buildMigrationSteps(form: SetupFormState, hasStoredTimezone: boolean): MigrationStep[] {
  const steps: MigrationStep[] = ['welcome', 'confirm'];
  if (!hasStoredTimezone) steps.push('timezone');
  if (goalWeightNeedsEntry(form.weight, form.goalWeight)) steps.push('goalWeight');
  if (!form.birthDate.trim()) steps.push('birthDate');
  if (!form.activityLevel.trim()) steps.push('activity');
  steps.push('virtualCoach', 'textReminders', 'done');
  return steps;
}

function formatHeight(feet: string, inches: string) {
  if (!feet.trim() && !inches.trim()) return '';
  return `${feet.trim() || '0'}'${inches.trim() || '0'}"`;
}

function genderLabel(gender: SetupFormState['gender']) {
  if (gender === 'f') return 'Female';
  if (gender === 'm') return 'Male';
  return '';
}

function ConfirmRow({ label, value }: { label: string; value: string }) {
  if (!value.trim()) return null;
  return (
    <div className="flex items-start justify-between gap-4 border-b border-app-border/70 py-3 last:border-b-0">
      <dt className="text-sm text-app-text-muted">{label}</dt>
      <dd className="max-w-[60%] text-right text-sm font-medium text-app-text">{value}</dd>
    </div>
  );
}

export function MigrationConfirmationFlow({
  form,
  onChange,
  onComplete,
  coachName = '',
  hasStoredTimezone
}: MigrationConfirmationFlowProps) {
  const navigate = useNavigate();
  const [steps] = useState(() => buildMigrationSteps(form, hasStoredTimezone));
  const [index, setIndex] = useState(0);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const step = steps[index] ?? 'done';
  const virtualCoach = getVirtualCoach(form.selectedVirtualCoachId);

  function goNext() {
    setError('');
    setIndex((current) => Math.min(current + 1, steps.length - 1));
  }

  function goBack() {
    setError('');
    setIndex((current) => Math.max(current - 1, 0));
  }

  async function handleFinish() {
    setError('');
    setSubmitting(true);
    try {
      await submitSetupForm(form, {
        requireGoalWeight: true,
        requireTimezone: true,
        preserveAssignedCoach: true
      });
      onComplete();
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save your info');
    } finally {
      setSubmitting(false);
    }
  }

  const backButton =
    index > 0 ? (
      <button
        type="button"
        className="text-sm font-medium text-app-text-muted underline-offset-2 hover:text-app-text hover:underline"
        onClick={goBack}
      >
        Back
      </button>
    ) : null;

  if (step === 'welcome') {
    return (
      <OnboardingShell footer="Nothing lost. Just upgraded.">
        <OnboardingStepHeader
          headline="Your progress moved with you."
          subheadline="We brought over your profile and history from the previous system. Take a quick look, confirm anything that changed, and you're ready to go."
        />

        <div className={onboardingChecklistClass}>
          <OnboardingChecklist
            items={['Profile details imported', 'Starting metrics imported', 'Previous progress saved']}
          />
        </div>

        <div className="mt-6">
          <OnboardingPrimaryButton onClick={goNext}>Review My Info →</OnboardingPrimaryButton>
        </div>
      </OnboardingShell>
    );
  }

  if (step === 'confirm') {
    const height = formatHeight(form.heightFeet, form.heightInches);
    const activity = ACTIVITY_LEVEL_OPTIONS.find((option) => String(option.value) === form.activityLevel);
    const showGoal = form.goalWeight.trim() && !goalWeightNeedsEntry(form.weight, form.goalWeight);

    return (
      <OnboardingShell footer="This is what we imported. Your program, coach, meals, and workouts stay put.">
        <OnboardingStepHeader
          headline="Confirm your info"
          subheadline="Here's what came over with you. We'll only ask about anything that's still missing."
        />

        <dl className={onboardingCardClass}>
          <ConfirmRow label="Current weight" value={form.weight.trim() ? `${form.weight.trim()} lb` : ''} />
          {showGoal ? <ConfirmRow label="Goal weight" value={`${form.goalWeight.trim()} lb`} /> : null}
          <ConfirmRow label="Height" value={height} />
          <ConfirmRow label="Gender" value={genderLabel(form.gender)} />
          <ConfirmRow label="Body fat" value={form.bodyFat.trim() ? `${form.bodyFat.trim()}%` : ''} />
          <ConfirmRow label="Mobile phone" value={form.phone.trim()} />
          <ConfirmRow label="Coach" value={coachName.trim()} />
          <ConfirmRow label="Food notes" value={form.foodAllergies.trim()} />
          <ConfirmRow label="Diet notes" value={form.dietaryPreferences.trim()} />
          {form.birthDate.trim() ? <ConfirmRow label="Birth date" value={form.birthDate.trim()} /> : null}
          {activity ? <ConfirmRow label="Day-to-day activity" value={activity.label} /> : null}
          {hasStoredTimezone ? <ConfirmRow label="Timezone" value={form.timezone.trim()} /> : null}
        </dl>

        <div className="mt-6 space-y-3">
          {error ? <p className="text-sm text-red-500">{error}</p> : null}
          <OnboardingPrimaryButton onClick={goNext}>Looks Good →</OnboardingPrimaryButton>
          {backButton}
        </div>
      </OnboardingShell>
    );
  }

  if (step === 'timezone') {
    const zone = resolveTimezone(form.timezone);
    return (
      <OnboardingShell footer="We use your timezone to schedule meal reminders and daily check-ins at the right time for you.">
        <OnboardingStepHeader
          headline="Your timezone"
          subheadline={`I've got your timezone as ${zone} — this is used for meal reminders and scheduling. Is that right?`}
        />

        <div className="space-y-4">
          <select
            id="timezone"
            aria-label="Your timezone"
            className={onboardingInputClass}
            value={zone}
            onChange={(event) => onChange('timezone', event.target.value)}
          >
            {timezoneOptions(zone).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>

          {error ? <p className="text-sm text-red-500">{error}</p> : null}

          <OnboardingPrimaryButton
            onClick={() => {
              onChange('timezone', zone);
              goNext();
            }}
          >
            {`Yes — ${zone}`}
          </OnboardingPrimaryButton>
          {backButton}
        </div>
      </OnboardingShell>
    );
  }

  if (step === 'goalWeight') {
    return (
      <OnboardingShell footer="Your current weight stays on your imported program. This only sets the goal.">
        <OnboardingStepHeader
          headline="What's your goal weight?"
          subheadline="The import copied your current weight into the goal. Enter the weight you're aiming for."
        />

        <div className="space-y-4">
          <div>
            <label htmlFor="goal-weight" className="mb-2 block text-sm font-medium text-app-text">
              Goal weight (lbs)
            </label>
            <NumberInput
              id="goal-weight"
              className={onboardingInputClass}
              value={form.goalWeight}
              onChange={(value) => onChange('goalWeight', value)}
              placeholder="165"
              inputMode="decimal"
              min={1}
              step={0.1}
            />
          </div>

          {error ? <p className="text-sm text-red-500">{error}</p> : null}

          <OnboardingPrimaryButton
            onClick={() => {
              if (goalWeightNeedsEntry(form.weight, form.goalWeight) && !form.goalWeight.trim()) {
                setError('Enter your goal weight.');
                return;
              }
              if (!Number(form.goalWeight) || Number(form.goalWeight) <= 0) {
                setError('Enter your goal weight.');
                return;
              }
              goNext();
            }}
          >
            Continue →
          </OnboardingPrimaryButton>
          {backButton}
        </div>
      </OnboardingShell>
    );
  }

  if (step === 'birthDate') {
    return (
      <OnboardingShell footer="Used for age-based calculations. You can skip this.">
        <OnboardingStepHeader
          headline="What's your birth date?"
          subheadline="Use MM/DD/YYYY."
        />

        <div className="space-y-4">
          <BirthDateInput
            id="birth-date"
            value={form.birthDate}
            onChange={(value) => onChange('birthDate', value)}
            fieldClass={onboardingFieldClass}
          />

          {error ? <p className="text-sm text-red-500">{error}</p> : null}

          <OnboardingPrimaryButton
            onClick={() => {
              if (!form.birthDate.trim()) {
                setError('Use MM/DD/YYYY, or skip.');
                return;
              }
              goNext();
            }}
          >
            Continue →
          </OnboardingPrimaryButton>
          <button
            type="button"
            className="w-full text-center text-sm font-medium text-app-text-muted underline-offset-2 hover:text-app-text hover:underline"
            onClick={() => {
              onChange('birthDate', '');
              goNext();
            }}
          >
            Skip
          </button>
          {backButton}
        </div>
      </OnboardingShell>
    );
  }

  if (step === 'activity') {
    return (
      <OnboardingShell footer="This helps us gauge how active your typical day is.">
        <OnboardingStepHeader
          headline="How active are you day to day?"
          subheadline="How active are you day to day, outside of workouts? This helps me size targets that fit your routine."
        />

        <div className="flex flex-col gap-2">
          {ACTIVITY_LEVEL_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={choiceButtonClass}
              onClick={() => {
                onChange('activityLevel', String(option.value));
                goNext();
              }}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="mt-4">{backButton}</div>
      </OnboardingShell>
    );
  }

  if (step === 'virtualCoach') {
    return (
      <OnboardingShell footer="You can switch coaches anytime from Virtual Coach.">
        <OnboardingStepHeader
          headline="Choose your virtual coach"
          subheadline="Tap a coach to read their bio, then choose them. This is optional — your imported plan stays as it is."
        />

        <div className="space-y-5">
          <OnboardingCoachPicker
            selectedId={form.selectedVirtualCoachId}
            onSelect={(id: VirtualCoachId) => {
              onChange('selectedVirtualCoachId', id);
              goNext();
            }}
          />

          {form.selectedVirtualCoachId ? (
            <OnboardingPrimaryButton onClick={goNext}>Continue →</OnboardingPrimaryButton>
          ) : null}

          <button
            type="button"
            className="w-full text-center text-sm font-medium text-app-text-muted underline-offset-2 hover:text-app-text hover:underline"
            onClick={goNext}
          >
            Skip for now
          </button>
          {backButton}
        </div>
      </OnboardingShell>
    );
  }

  if (step === 'textReminders') {
    const coachLabel = virtualCoach?.name;
    const prompt = coachLabel
      ? `Want text reminders from me (${coachLabel})? If yes, I'll confirm your timezone and phone number.`
      : `Want text reminders? If yes, I'll use the timezone and mobile number you already confirmed.`;

    return (
      <OnboardingShell footer="Optional. You can turn text reminders on or off later.">
        <OnboardingStepHeader headline="Text reminders" subheadline={prompt} />

        <div className="flex flex-col gap-2">
          <button
            type="button"
            className={choiceButtonClass}
            onClick={() => {
              onChange('textReminders', 'yes');
              goNext();
            }}
          >
            Yes
          </button>
          <button
            type="button"
            className={choiceButtonClass}
            onClick={() => {
              onChange('textReminders', 'no');
              goNext();
            }}
          >
            No
          </button>
          <button
            type="button"
            className="mt-2 w-full text-center text-sm font-medium text-app-text-muted underline-offset-2 hover:text-app-text hover:underline"
            onClick={goNext}
          >
            Skip for now
          </button>
          {backButton}
        </div>
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell footer="Your imported data is ready to go.">
      <OnboardingStepHeader
        headline="You're all set."
        subheadline="Your imported program stays in place. Your profile is confirmed and you can pick up where you left off."
      />

      <div className={onboardingChecklistClass}>
        <OnboardingChecklist
          items={['Plan history is intact', 'Goals are confirmed', 'Coach support can continue']}
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
        {backButton}
      </div>
    </OnboardingShell>
  );
}
