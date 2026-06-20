import { BirthDateInput } from '../ui/BirthDateInput';
import { detectedTimezone, timezoneOptions } from '../../utils/timezoneOptions';
import type { SetupFormState } from '../../types/onboarding';
import { onboardingCardClass, onboardingFieldClass, onboardingInputClass } from './onboardingStyles';

type FieldKey = keyof SetupFormState;

export function OnboardingWeightFields({
  form,
  onChange,
  showCurrentWeight = true,
  showGoalWeight = true,
  showCurrentBodyFat = true,
  showGoalBodyFat = true
}: {
  form: SetupFormState;
  onChange: (key: FieldKey, value: string | boolean) => void;
  showCurrentWeight?: boolean;
  showGoalWeight?: boolean;
  showCurrentBodyFat?: boolean;
  showGoalBodyFat?: boolean;
}) {
  const showWeightRow = showCurrentWeight || showGoalWeight;
  const showBodyFatRow = showCurrentBodyFat || showGoalBodyFat;

  return (
    <div className="space-y-4">
      {showWeightRow ? (
        <div className={showCurrentWeight && showGoalWeight ? 'grid gap-4 sm:grid-cols-2' : undefined}>
          {showCurrentWeight ? (
            <div>
              <label htmlFor="current-weight" className="mb-2 block text-sm font-medium text-app-text">
                Current weight (lbs)
              </label>
              <input
                id="current-weight"
                className={onboardingInputClass}
                value={form.weight}
                onChange={(e) => onChange('weight', e.target.value)}
                placeholder="180"
                inputMode="decimal"
                type="number"
                min="1"
                step="0.1"
              />
            </div>
          ) : null}
          {showGoalWeight ? (
            <div>
              <label htmlFor="goal-weight" className="mb-2 block text-sm font-medium text-app-text">
                Goal weight (lbs)
              </label>
              <input
                id="goal-weight"
                className={onboardingInputClass}
                value={form.goalWeight}
                onChange={(e) => onChange('goalWeight', e.target.value)}
                placeholder="165"
                inputMode="decimal"
                type="number"
                min="1"
                step="0.1"
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {showBodyFatRow ? (
        <div className={showCurrentBodyFat && showGoalBodyFat ? 'grid gap-4 sm:grid-cols-2' : undefined}>
          {showCurrentBodyFat ? (
            <div>
              <label htmlFor="current-body-fat" className="mb-2 block text-sm font-medium text-app-text">
                Current body fat (%)
              </label>
              <input
                id="current-body-fat"
                className={onboardingInputClass}
                value={form.bodyFat}
                onChange={(e) => onChange('bodyFat', e.target.value)}
                placeholder="35"
                inputMode="decimal"
                type="number"
                min="1"
                max="75"
                step="0.1"
              />
            </div>
          ) : null}
          {showGoalBodyFat ? (
            <div>
              <label htmlFor="goal-body-fat" className="mb-2 block text-sm font-medium text-app-text">
                Goal body fat (%)
              </label>
              <input
                id="goal-body-fat"
                className={onboardingInputClass}
                value={form.goalBodyFat}
                onChange={(e) => onChange('goalBodyFat', e.target.value)}
                placeholder="18"
                inputMode="decimal"
                type="number"
                min="1"
                max="75"
                step="0.1"
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function OnboardingPersonalFields({
  form,
  onChange,
  showTimezone = true,
  showCoach = true
}: {
  form: SetupFormState;
  onChange: (key: FieldKey, value: string | boolean) => void;
  showTimezone?: boolean;
  showCoach?: boolean;
}) {
  return (
    <div className="space-y-4">
      {showTimezone ? (
        <div>
          <label htmlFor="timezone" className="mb-2 block text-sm font-medium text-app-text">
            Timezone
          </label>
          <select
            id="timezone"
            className={onboardingInputClass}
            value={form.timezone}
            onChange={(e) => onChange('timezone', e.target.value)}
          >
            <option value="">Select timezone</option>
            {timezoneOptions(form.timezone || detectedTimezone()).map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className={onboardingCardClass}>
        <p className="text-sm font-semibold text-app-text">Personal details</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 sm:items-start">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-app-text">Gender</span>
            <select
              id="gender"
              className={onboardingFieldClass}
              value={form.gender}
              onChange={(e) => onChange('gender', e.target.value)}
            >
              <option value="">Prefer not to say yet</option>
              <option value="f">Female</option>
              <option value="m">Male</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-app-text">Birth date</span>
            <BirthDateInput
              key={form.birthDate || 'empty'}
              id="birth-date"
              value={form.birthDate}
              onChange={(value) => onChange('birthDate', value)}
              fieldClass={onboardingFieldClass}
            />
          </label>
        </div>
      </div>

      {showCoach ? (
        <div className={onboardingCardClass}>
          <p className="text-sm font-semibold text-app-text">Coach support</p>
          <p className="mt-1 text-sm text-app-text-muted">
            Optional. A coach can personalize your plan whenever you&apos;re ready.
          </p>
          <label htmlFor="coach-code" className="mt-3 block text-sm font-medium text-app-text">
            Coach initials or code
          </label>
          <input
            id="coach-code"
            className={`${onboardingInputClass} mt-2 uppercase`}
            value={form.coachCode}
            onChange={(e) => onChange('coachCode', e.target.value.toUpperCase())}
            placeholder="DF"
            maxLength={20}
          />
          <label className="mt-3 flex items-start gap-3 text-sm text-app-text">
            <input
              className="mt-1"
              type="checkbox"
              checked={form.wantsCoach}
              onChange={(e) => onChange('wantsCoach', e.target.checked)}
            />
            <span>I&apos;d like to work with a real coach.</span>
          </label>
        </div>
      ) : null}
    </div>
  );
}

export function OnboardingGoalSummary({ form }: { form: SetupFormState }) {
  const hasBodyFat = Boolean(form.bodyFat.trim() && form.goalBodyFat.trim());
  if (!form.weight.trim() && !form.goalWeight.trim()) return null;

  return (
    <div className={`${onboardingCardClass} text-sm text-app-text`}>
      <p className="font-medium text-app-text-muted">Your journey</p>
      <div className="mt-3 space-y-2">
        {form.weight && form.goalWeight ? (
          <p>
            <span className="text-app-text-muted">Weight:</span> {form.weight} lbs → {form.goalWeight} lbs
          </p>
        ) : null}
        {hasBodyFat ? (
          <p>
            <span className="text-app-text-muted">Body fat:</span> {form.bodyFat}% → {form.goalBodyFat}%
          </p>
        ) : null}
      </div>
    </div>
  );
}
