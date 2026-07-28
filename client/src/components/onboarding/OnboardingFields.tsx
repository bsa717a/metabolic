import { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { BirthDateInput } from '../ui/BirthDateInput';
import { NumberInput } from '../ui/NumberInput';
import { ACTIVITY_LEVEL_OPTIONS } from '../../utils/activityLevel';
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
  showGoalBodyFat = true,
  showHeight = false
}: {
  form: SetupFormState;
  onChange: (key: FieldKey, value: string | boolean) => void;
  showCurrentWeight?: boolean;
  showGoalWeight?: boolean;
  showCurrentBodyFat?: boolean;
  showGoalBodyFat?: boolean;
  showHeight?: boolean;
}) {
  const showWeightRow = showCurrentWeight || showGoalWeight;
  const showBodyFatRow = showCurrentBodyFat || showGoalBodyFat;
  const [showBodyFatHelp, setShowBodyFatHelp] = useState(false);

  return (
    <div className="space-y-4">
      {showWeightRow ? (
        <div className={showCurrentWeight && showGoalWeight ? 'grid gap-4 sm:grid-cols-2' : undefined}>
          {showCurrentWeight ? (
            <div>
              <label htmlFor="current-weight" className="mb-2 block text-sm font-medium text-app-text">
                Current weight (lbs)
              </label>
              <NumberInput
                id="current-weight"
                className={onboardingInputClass}
                value={form.weight}
                onChange={(value) => onChange('weight', value)}
                placeholder="180"
                inputMode="decimal"
                min={1}
                step={0.1}
              />
            </div>
          ) : null}
          {showGoalWeight ? (
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
          ) : null}
        </div>
      ) : null}

      {showHeight ? (
        <div>
          <label htmlFor="height-feet" className="mb-2 block text-sm font-medium text-app-text">
            Height
          </label>
          <div className="grid grid-cols-2 gap-4">
            <NumberInput
              id="height-feet"
              className={onboardingInputClass}
              value={form.heightFeet}
              onChange={(value) => onChange('heightFeet', value)}
              placeholder="Feet"
              inputMode="numeric"
              integer
              min={0}
              max={8}
              step={1}
              aria-label="Height in feet"
            />
            <NumberInput
              id="height-inches"
              className={onboardingInputClass}
              value={form.heightInches}
              onChange={(value) => onChange('heightInches', value)}
              placeholder="Inches"
              inputMode="numeric"
              integer
              min={0}
              max={11}
              step={1}
              aria-label="Height in inches"
            />
          </div>
        </div>
      ) : null}

      {showBodyFatRow ? (
        <div className={showCurrentBodyFat && showGoalBodyFat ? 'grid gap-4 sm:grid-cols-2' : undefined}>
          {showCurrentBodyFat ? (
            <div>
              <div className="mb-2 flex items-center gap-1.5">
                <label htmlFor="current-body-fat" className="block text-sm font-medium text-app-text">
                  Current body fat (%)
                </label>
                <button
                  type="button"
                  onClick={() => setShowBodyFatHelp((open) => !open)}
                  className="text-app-text-muted transition hover:text-app-text"
                  aria-label="How to measure body fat"
                  aria-expanded={showBodyFatHelp}
                >
                  <HelpCircle size={15} aria-hidden />
                </button>
              </div>
              <NumberInput
                id="current-body-fat"
                className={onboardingInputClass}
                value={form.bodyFat}
                onChange={(value) => onChange('bodyFat', value)}
                placeholder="35"
                inputMode="decimal"
                min={1}
                max={75}
                step={0.1}
              />
              {showBodyFatHelp ? (
                <p className="mt-2 text-xs leading-relaxed text-app-text-muted">
                  Not sure? Estimate it with a body-fat scale, skinfold calipers, or a waist- and
                  neck-based body-fat calculator. It&apos;s optional — leave it blank for now and you
                  can update it later.
                </p>
              ) : null}
            </div>
          ) : null}
          {showGoalBodyFat ? (
            <div>
              <label htmlFor="goal-body-fat" className="mb-2 block text-sm font-medium text-app-text">
                Goal body fat (%)
              </label>
              <NumberInput
                id="goal-body-fat"
                className={onboardingInputClass}
                value={form.goalBodyFat}
                onChange={(value) => onChange('goalBodyFat', value)}
                placeholder="18"
                inputMode="decimal"
                min={1}
                max={75}
                step={0.1}
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
  const [showActivityHelp, setShowActivityHelp] = useState(false);
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

      <div>
        <label htmlFor="phone" className="mb-2 block text-sm font-medium text-app-text">
          Mobile phone
        </label>
        <input
          id="phone"
          className={onboardingInputClass}
          value={form.phone}
          onChange={(e) => onChange('phone', e.target.value)}
          placeholder="Optional — for text reminders from your coach"
          inputMode="tel"
          autoComplete="tel"
        />
      </div>

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

      <div className={onboardingCardClass}>
        <div className="mb-3 flex items-center gap-1.5">
          <p className="text-sm font-semibold text-app-text">Daily activity</p>
          <button
            type="button"
            onClick={() => setShowActivityHelp((open) => !open)}
            className="text-app-text-muted transition hover:text-app-text"
            aria-label="Why we ask about your activity"
            aria-expanded={showActivityHelp}
          >
            <HelpCircle size={15} aria-hidden />
          </button>
        </div>
        {showActivityHelp ? (
          <p className="mb-3 text-xs leading-relaxed text-app-text-muted">
            This helps us gauge how active your typical day is so we can pick targets and a plan that
            fit your routine.
          </p>
        ) : null}
        <label htmlFor="activity-level" className="mb-1 block text-sm font-medium text-app-text">
          How active are you day to day?
        </label>
        <select
          id="activity-level"
          className={onboardingFieldClass}
          value={form.activityLevel}
          onChange={(e) => onChange('activityLevel', e.target.value)}
        >
          <option value="">Select…</option>
          {ACTIVITY_LEVEL_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
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

export function OnboardingGoalSummary({
  form,
  onChange
}: {
  form: SetupFormState;
  onChange: (key: FieldKey, value: string | boolean) => void;
}) {
  return (
    <div className={`${onboardingCardClass} text-sm text-app-text`}>
      <p className="font-medium text-app-text-muted">Your journey</p>
      <div className="mt-3 space-y-4">
        <div>
          <p className="mb-2 text-sm font-medium text-app-text">Weight (lbs)</p>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <NumberInput
              className={onboardingInputClass}
              value={form.weight}
              onChange={(value) => onChange('weight', value)}
              placeholder="Current"
              inputMode="decimal"
              min={1}
              step={0.1}
              aria-label="Current weight in pounds"
            />
            <span className="text-app-text-muted" aria-hidden>
              →
            </span>
            <NumberInput
              className={onboardingInputClass}
              value={form.goalWeight}
              onChange={(value) => onChange('goalWeight', value)}
              placeholder="Goal"
              inputMode="decimal"
              min={1}
              step={0.1}
              aria-label="Goal weight in pounds"
            />
          </div>
        </div>

        <div>
          <label htmlFor="target-height-feet" className="mb-2 block text-sm font-medium text-app-text">
            Height
          </label>
          <div className="grid grid-cols-2 gap-3">
            <NumberInput
              id="target-height-feet"
              className={onboardingInputClass}
              value={form.heightFeet}
              onChange={(value) => onChange('heightFeet', value)}
              placeholder="Feet"
              inputMode="numeric"
              integer
              min={1}
              max={8}
              step={1}
              aria-label="Height in feet"
            />
            <NumberInput
              id="target-height-inches"
              className={onboardingInputClass}
              value={form.heightInches}
              onChange={(value) => onChange('heightInches', value)}
              placeholder="Inches"
              inputMode="numeric"
              integer
              min={0}
              max={11}
              step={1}
              aria-label="Height in inches"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
