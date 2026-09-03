import type { VirtualCoach } from '../../data/virtualCoaches';
import { ACTIVITY_LEVEL_OPTIONS } from '../../utils/activityLevel';
import { hasValidCurrentWeight } from '../../utils/onboardingWeight';
import { detectedTimezone } from '../../utils/timezoneOptions';
import { displayToIso } from '../ui/BirthDateInput';
import type { SetupFormState } from '../../types/onboarding';

export type CoachOnboardingStage =
  | 'intro'
  | 'trackingMode'
  | 'weight'
  | 'goalWeight'
  | 'height'
  | 'activity'
  | 'bodyFatAsk'
  | 'bodyFatKnowHow'
  | 'bodyFatHow'
  | 'bodyFatCurrent'
  | 'bodyFatGoal'
  | 'gender'
  | 'birthDate'
  | 'allergiesAsk'
  | 'allergiesDetail'
  | 'planReveal'
  | 'smsAsk'
  | 'timezone'
  | 'phone'
  | 'realCoachAsk'
  | 'realCoachCode'
  | 'readyToSubmit';

export type CoachOnboardingQuickReply = {
  label: string;
  mobileLabel?: string;
  value: string;
};

export type CoachOnboardingTurn = {
  stage: CoachOnboardingStage;
  assistantMessage: string;
  quickReplies?: CoachOnboardingQuickReply[];
};

export type CoachOnboardingAdvance = {
  formPatch?: Partial<SetupFormState>;
  next: CoachOnboardingTurn;
  error?: string;
  /** When true, caller should submit setup with the patched form. */
  submit?: boolean;
};

const BODY_FAT_HOW = [
  "Here's the easiest ways to get a number:",
  "1) Body-fat scale — step on barefoot (same time of day, before eating is best). It estimates body fat % for you.",
  "2) Tape + online calculator — measure your waist (at the navel) and neck (below the Adam's apple). For women, also measure hips at the widest point. Plug those into a Navy / waist-neck body-fat calculator online and it'll give you a %.",
  "3) Skinfold calipers — pinch a few standard sites and look up the % on a caliper chart (or have a trainer do it).",
  "A close estimate is fine — we can update it later. Want to enter a number now, or skip?"
].join('\n\n');

function yesNoReplies(): CoachOnboardingQuickReply[] {
  return [
    { label: 'Yes', value: 'yes' },
    { label: 'No', value: 'no' }
  ];
}

function normalizeChoice(text: string) {
  return text.trim().toLowerCase();
}

function isValidTimezone(value: string) {
  const trimmed = value.trim();
  if (!trimmed || !trimmed.includes('/')) return false;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: trimmed });
    return true;
  } catch {
    return false;
  }
}

function isNegatedChoice(text: string) {
  return /\b(don'?t|do not|no|not|never|without)\b/.test(normalizeChoice(text));
}

function isYes(text: string) {
  const value = normalizeChoice(text);
  return value === 'yes' || value === 'y';
}

function isNo(text: string) {
  const value = normalizeChoice(text);
  return value === 'no' || value === 'n';
}

function parseWeightLbs(text: string): number | null {
  const match = text.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const value = Number(match[1]);
  if (!hasValidCurrentWeight(value)) return null;
  return value;
}

function parseHeight(text: string): { feet: string; inches: string } | null {
  const cleaned = text.trim().toLowerCase().replace(/feet|foot|ft/g, "'").replace(/inches|inch|in/g, '');
  const feetInches = cleaned.match(/^(\d)\s*['′]?\s*[-\s]?\s*(\d{1,2})\s*["″']?$/);
  if (feetInches) {
    const feet = Number(feetInches[1]);
    const inches = Number(feetInches[2]);
    if (feet >= 1 && feet <= 8 && inches >= 0 && inches <= 11) {
      return { feet: String(feet), inches: String(inches) };
    }
  }

  const spaced = cleaned.match(/^(\d)\s+(\d{1,2})$/);
  if (spaced) {
    const feet = Number(spaced[1]);
    const inches = Number(spaced[2]);
    if (feet >= 1 && feet <= 8 && inches >= 0 && inches <= 11) {
      return { feet: String(feet), inches: String(inches) };
    }
  }

  const totalInches = cleaned.match(/^(\d{2,3})\s*(?:")?$/);
  if (totalInches) {
    const total = Number(totalInches[1]);
    if (total >= 36 && total <= 96) {
      return { feet: String(Math.floor(total / 12)), inches: String(total % 12) };
    }
  }

  return null;
}

function parseBodyFat(text: string): number | null {
  const cleaned = text
    .trim()
    .toLowerCase()
    .replace(/percent(?:age)?/g, '')
    .replace(/%/g, '')
    .replace(/\bbf\b/g, '')
    .trim();

  const direct = cleaned.match(/^(\d+(?:\.\d+)?)$/);
  const embedded = cleaned.match(/(\d+(?:\.\d+)?)/);
  const match = direct ?? embedded;
  if (!match) return null;

  const value = Number(match[1]);
  if (!Number.isFinite(value) || value < 1 || value > 75) return null;
  return value;
}

function parseBirthDate(text: string): string | null {
  const trimmed = text.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 8) {
    const display = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    return displayToIso(display);
  }
  const slash = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const display = `${slash[1].padStart(2, '0')}/${slash[2].padStart(2, '0')}/${slash[3]}`;
    return displayToIso(display);
  }
  return null;
}

function isSkip(text: string) {
  const value = normalizeChoice(text);
  return value === 'skip' || value === 'later' || value === 'prefer not to say' || value === 'prefer not to say yet';
}

function isNoAllergies(text: string) {
  const value = normalizeChoice(text);
  if (isNo(text) || isSkip(text)) return true;
  if (value === 'none' || value === 'n/a' || value === 'na' || value === 'nope' || value === 'nah') {
    return true;
  }
  if (
    value.includes('no allerg') ||
    value.includes('not allergic') ||
    value === 'no food allergies' ||
    value.includes('no thanks')
  ) {
    return true;
  }
  if (value === 'nothing' || value.includes('nothing to avoid') || value.includes('no restrictions')) {
    return true;
  }
  // "no" / "no thanks" style denials — not "no peanuts"
  if (/^(no|nah|nope)(\s+(thanks|thank you|i'?m good|need))?\.?$/.test(value)) return true;
  if (/\b(don'?t|do not)\s+have\s+(any\s+)?(food\s+)?allerg/.test(value)) return true;
  return false;
}

export function buildIntroTurn(coach: VirtualCoach, firstName?: string | null): CoachOnboardingTurn {
  const name = firstName?.trim() ? `, ${firstName.trim()}` : '';
  return {
    stage: 'intro',
    assistantMessage: [
      `Hey${name}! ${coach.bio}`,
      `I'll walk you through a few quick details so we can shape your Metabolic plan together: weight, height, activity, allergies, and a couple personal basics. Then I'll show you what we're aiming for and we can set up texting if you want.`,
      `Ready?`
    ].join('\n\n'),
    quickReplies: [{ label: "Let's go", value: 'continue' }]
  };
}

function trackingModeTurn(): CoachOnboardingTurn {
  return {
    stage: 'trackingMode',
    assistantMessage: `First up — how do you want to work with me?\n\nA coached plan gives you structured meals, targets, and support from me. Or you can just track food on your own with no plan.`,
    quickReplies: [
      { label: 'Get on a plan', mobileLabel: 'Plan', value: 'plan' },
      { label: 'Just track my food', mobileLabel: 'Track', value: 'track' }
    ]
  };
}

function weightTurn(): CoachOnboardingTurn {
  return {
    stage: 'weight',
    assistantMessage: `What's your current weight in pounds?`
  };
}

function goalWeightTurn(): CoachOnboardingTurn {
  return {
    stage: 'goalWeight',
    assistantMessage: `And what's your goal weight?`
  };
}

function heightTurn(): CoachOnboardingTurn {
  return {
    stage: 'height',
    assistantMessage: `What's your height? You can type it like 5'10 or 5 10.`
  };
}

function activityTurn(): CoachOnboardingTurn {
  return {
    stage: 'activity',
    assistantMessage: `How active are you day to day, outside of workouts? This helps me size targets that fit your routine.`,
    quickReplies: ACTIVITY_LEVEL_OPTIONS.map((option) => ({
      label: option.label,
      mobileLabel: String(option.value),
      value: String(option.value)
    }))
  };
}

function bodyFatAskTurn(): CoachOnboardingTurn {
  return {
    stage: 'bodyFatAsk',
    assistantMessage: `Do you want to add body fat percentage? It's optional, but it helps us track lean mass more accurately.`,
    quickReplies: yesNoReplies()
  };
}

function bodyFatKnowHowTurn(): CoachOnboardingTurn {
  return {
    stage: 'bodyFatKnowHow',
    assistantMessage: `Do you know how to get your body fat percentage?`,
    quickReplies: yesNoReplies()
  };
}

function bodyFatHowTurn(): CoachOnboardingTurn {
  return {
    stage: 'bodyFatHow',
    assistantMessage: BODY_FAT_HOW,
    quickReplies: [
      { label: 'Got it — enter mine', mobileLabel: 'Enter', value: 'enter' },
      { label: 'Skip for now', mobileLabel: 'Skip', value: 'skip' }
    ]
  };
}

function bodyFatCurrentTurn(): CoachOnboardingTurn {
  return {
    stage: 'bodyFatCurrent',
    assistantMessage: `What's your current body fat percentage? Just the number is fine — like 25 (no % needed).`,
    quickReplies: [{ label: 'Skip', value: 'skip' }]
  };
}

function bodyFatGoalTurn(currentBodyFat?: number): CoachOnboardingTurn {
  const ack =
    currentBodyFat != null
      ? `Got it — current body fat is ${currentBodyFat}%.\n\n`
      : '';
  return {
    stage: 'bodyFatGoal',
    assistantMessage: `${ack}Any goal body fat percentage? Just the number is fine (no % needed).`,
    quickReplies: [{ label: 'Skip', value: 'skip' }]
  };
}

function genderTurn(ack?: string): CoachOnboardingTurn {
  return {
    stage: 'gender',
    assistantMessage: [
      ack,
      `What's your gender? This helps with age- and sex-based calculations.`
    ]
      .filter(Boolean)
      .join('\n\n'),
    quickReplies: [
      { label: 'Female', value: 'f' },
      { label: 'Male', value: 'm' },
      { label: 'Prefer not to say', mobileLabel: 'Skip', value: 'skip' }
    ]
  };
}

function birthDateTurn(): CoachOnboardingTurn {
  return {
    stage: 'birthDate',
    assistantMessage: `What's your birth date? Use MM/DD/YYYY.`,
    quickReplies: [{ label: 'Skip', value: 'skip' }]
  };
}

function allergiesAskTurn(ack?: string): CoachOnboardingTurn {
  return {
    stage: 'allergiesAsk',
    assistantMessage: [ack, `Any food allergies I should know about?`]
      .filter(Boolean)
      .join('\n\n'),
    quickReplies: yesNoReplies()
  };
}

function allergiesDetailTurn(): CoachOnboardingTurn {
  return {
    stage: 'allergiesDetail',
    assistantMessage: `What are they? List anything you need to avoid — for example peanuts, shellfish, dairy.`,
    quickReplies: [
      { label: 'None / skip', mobileLabel: 'None', value: 'none' }
    ]
  };
}

function planRevealTurn(form: SetupFormState, ack?: string): CoachOnboardingTurn {
  const weightLine =
    form.weight && form.goalWeight
      ? `From what you've shared, our focus is to move from ${form.weight} lb toward ${form.goalWeight} lb.`
      : `I've got your details.`;

  const bodyFatLine =
    form.bodyFat && form.goalBodyFat
      ? `Body fat: ${form.bodyFat}% → ${form.goalBodyFat}%.`
      : form.bodyFat
        ? `Current body fat: ${form.bodyFat}%.`
        : '';

  const allergiesLine = form.foodAllergies.trim()
    ? `I'll keep you clear of: ${form.foodAllergies.trim()}.`
    : '';

  const activity = ACTIVITY_LEVEL_OPTIONS.find((option) => String(option.value) === form.activityLevel);
  const activityLine = activity ? `You described your day-to-day activity as: ${activity.label}.` : '';

  const planLine = form.trackingOnly
    ? `You're set to track food your way — no structured meal plan. You can switch to a coached plan anytime.`
    : `I'll build your starter plan with meals, targets, and coaching support so we can work that plan together.`;

  return {
    stage: 'planReveal',
    assistantMessage: [ack, weightLine, bodyFatLine, allergiesLine, activityLine, planLine, `Sound good?`]
      .filter(Boolean)
      .join('\n\n'),
    quickReplies: [{ label: 'Sounds good', value: 'continue' }]
  };
}

function smsAskTurn(coach: VirtualCoach): CoachOnboardingTurn {
  return {
    stage: 'smsAsk',
    assistantMessage: `Want text reminders from me (${coach.name})? If yes, I'll confirm your timezone and phone number.`,
    quickReplies: yesNoReplies()
  };
}

function timezoneTurn(currentTimezone: string): CoachOnboardingTurn {
  const detected = currentTimezone.trim() || detectedTimezone() || 'America/Denver';
  return {
    stage: 'timezone',
    assistantMessage: `Is your timezone ${detected}? If not, type the correct one (for example America/Denver).`,
    quickReplies: [
      { label: `Yes — ${detected}`, mobileLabel: 'Yes', value: `yes:${detected}` },
      { label: "I'll type it", mobileLabel: 'Type', value: 'type' }
    ]
  };
}

function phoneTurn(): CoachOnboardingTurn {
  return {
    stage: 'phone',
    assistantMessage: `What's the best mobile number for texts? Include country code if you're outside the US.`,
    quickReplies: [{ label: 'Skip', value: 'skip' }]
  };
}

function realCoachAskTurn(): CoachOnboardingTurn {
  return {
    stage: 'realCoachAsk',
    assistantMessage: `Do you also work with a real Metabolic coach? You can keep chatting with me either way.`,
    quickReplies: [
      { label: 'I have a coach code', mobileLabel: 'Code', value: 'code' },
      { label: "I'd like a real coach", mobileLabel: 'Request', value: 'request' },
      { label: 'No thanks', mobileLabel: 'No', value: 'skip' }
    ]
  };
}

function realCoachCodeTurn(): CoachOnboardingTurn {
  return {
    stage: 'realCoachCode',
    assistantMessage: `What's their coach code or initials?`,
    quickReplies: [{ label: 'Skip', value: 'skip' }]
  };
}

function parseCoachCode(text: string): string | null {
  const normalized = text.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (normalized.length < 2 || normalized.length > 20) return null;
  return normalized;
}

function readyToSubmitTurn(
  trackingOnly: boolean,
  realCoachNote?: string
): CoachOnboardingTurn {
  const planLine = trackingOnly
    ? `All set — I'll finish setting up tracking for you now.`
    : `All set — I'll create your starter plan now.`;
  return {
    stage: 'readyToSubmit',
    assistantMessage: [planLine, realCoachNote].filter(Boolean).join('\n\n'),
    quickReplies: [
      {
        label: trackingOnly ? 'Start tracking' : 'Create my plan',
        mobileLabel: trackingOnly ? 'Start' : 'Create',
        value: 'submit'
      }
    ]
  };
}

export function advanceCoachOnboarding(
  stage: CoachOnboardingStage,
  rawInput: string,
  form: SetupFormState,
  coach: VirtualCoach
): CoachOnboardingAdvance {
  const input = rawInput.trim();

  switch (stage) {
    case 'intro':
      return { next: trackingModeTurn() };

    case 'trackingMode': {
      const value = normalizeChoice(input);
      const wantsTrack =
        value === 'track' ||
        value.includes('track') ||
        value.includes('log food') ||
        value.includes('just food') ||
        (value.includes('plan') && isNegatedChoice(value));
      const wantsPlan = value === 'plan' || (value.includes('plan') && !isNegatedChoice(value));

      if (wantsTrack && !wantsPlan) {
        return {
          formPatch: { trackingOnly: true },
          next: weightTurn()
        };
      }
      if (wantsPlan) {
        return {
          formPatch: { trackingOnly: false },
          next: weightTurn()
        };
      }
      if (wantsTrack) {
        return {
          formPatch: { trackingOnly: true },
          next: weightTurn()
        };
      }
      return {
        error: 'Pick a plan or tracking to continue.',
        next: trackingModeTurn()
      };
    }

    case 'weight': {
      const weight = parseWeightLbs(input);
      if (weight == null) {
        return { error: 'Enter a valid current weight in pounds.', next: weightTurn() };
      }
      return {
        formPatch: { weight: String(weight) },
        next: goalWeightTurn()
      };
    }

    case 'goalWeight': {
      const goalWeight = parseWeightLbs(input);
      if (goalWeight == null) {
        return { error: 'Enter a valid goal weight in pounds.', next: goalWeightTurn() };
      }
      return {
        formPatch: { goalWeight: String(goalWeight) },
        next: heightTurn()
      };
    }

    case 'height': {
      const height = parseHeight(input);
      if (!height) {
        return {
          error: `I couldn't read that height. Try 5'10 or 5 10.`,
          next: heightTurn()
        };
      }
      return {
        formPatch: { heightFeet: height.feet, heightInches: height.inches },
        next: activityTurn()
      };
    }

    case 'activity': {
      const match = ACTIVITY_LEVEL_OPTIONS.find(
        (option) =>
          String(option.value) === input.trim() ||
          option.label.toLowerCase() === normalizeChoice(input) ||
          normalizeChoice(input).startsWith(`${option.value}`)
      );
      if (!match) {
        return { error: 'Pick an activity level from the buttons.', next: activityTurn() };
      }
      return {
        formPatch: { activityLevel: String(match.value) },
        next: bodyFatAskTurn()
      };
    }

    case 'bodyFatAsk': {
      if (isYes(input)) {
        return { next: bodyFatKnowHowTurn() };
      }
      if (isNo(input)) {
        return {
          formPatch: { bodyFat: '', goalBodyFat: '' },
          next: genderTurn()
        };
      }
      return { error: 'Tap Yes or No.', next: bodyFatAskTurn() };
    }

    case 'bodyFatKnowHow': {
      if (isYes(input)) {
        return { next: bodyFatCurrentTurn() };
      }
      if (isNo(input)) {
        return { next: bodyFatHowTurn() };
      }
      return { error: 'Tap Yes or No.', next: bodyFatKnowHowTurn() };
    }

    case 'bodyFatHow': {
      if (isSkip(input) || normalizeChoice(input) === 'skip') {
        return {
          formPatch: { bodyFat: '', goalBodyFat: '' },
          next: genderTurn()
        };
      }
      const howBodyFat = parseBodyFat(input);
      if (howBodyFat != null) {
        return {
          formPatch: { bodyFat: String(howBodyFat) },
          next: bodyFatGoalTurn(howBodyFat)
        };
      }
      if (
        normalizeChoice(input) === 'enter' ||
        normalizeChoice(input).includes('number') ||
        normalizeChoice(input).includes('got it')
      ) {
        return { next: bodyFatCurrentTurn() };
      }
      return { error: 'Choose enter or skip, or type a number like 25.', next: bodyFatHowTurn() };
    }

    case 'bodyFatCurrent': {
      if (isSkip(input)) {
        return {
          formPatch: { bodyFat: '', goalBodyFat: '' },
          next: genderTurn()
        };
      }
      const bodyFat = parseBodyFat(input);
      if (bodyFat == null) {
        return {
          error: 'I need a number between 1 and 75 (for example 25). No % needed.',
          next: bodyFatCurrentTurn()
        };
      }
      return {
        formPatch: { bodyFat: String(bodyFat) },
        next: bodyFatGoalTurn(bodyFat)
      };
    }

    case 'bodyFatGoal': {
      if (isSkip(input)) {
        return {
          formPatch: { goalBodyFat: '' },
          next: genderTurn('No problem — we can set a body fat goal later.')
        };
      }
      const goalBodyFat = parseBodyFat(input);
      if (goalBodyFat == null) {
        const current = parseBodyFat(form.bodyFat);
        return {
          error: 'I need a number between 1 and 75 (for example 18). No % needed.',
          next: bodyFatGoalTurn(current ?? undefined)
        };
      }
      return {
        formPatch: { goalBodyFat: String(goalBodyFat) },
        next: genderTurn(`Got it — goal body fat is ${goalBodyFat}%.`)
      };
    }

    case 'gender': {
      const value = normalizeChoice(input);
      if (value === 'f' || value === 'female') {
        return { formPatch: { gender: 'f' }, next: birthDateTurn() };
      }
      if (value === 'm' || value === 'male') {
        return { formPatch: { gender: 'm' }, next: birthDateTurn() };
      }
      if (isSkip(input) || value.includes('prefer')) {
        return { formPatch: { gender: '' }, next: birthDateTurn() };
      }
      return { error: 'Pick one of the options.', next: genderTurn() };
    }

    case 'birthDate': {
      if (isSkip(input)) {
        return {
          formPatch: { birthDate: '' },
          next: allergiesAskTurn()
        };
      }
      const birthDate = parseBirthDate(input);
      if (!birthDate) {
        return {
          error: 'Use MM/DD/YYYY, or skip.',
          next: birthDateTurn()
        };
      }
      return {
        formPatch: { birthDate },
        next: allergiesAskTurn()
      };
    }

    case 'allergiesAsk': {
      if (isNoAllergies(input)) {
        return {
          formPatch: { foodAllergies: '' },
          next: planRevealTurn({ ...form, foodAllergies: '' }, 'No food allergies — noted.')
        };
      }
      if (isYes(input)) {
        return { next: allergiesDetailTurn() };
      }
      // Free-text allergy list typed instead of Yes/No (denials already handled above)
      if (input.length >= 2 && !isNegatedChoice(input)) {
        const patched = { ...form, foodAllergies: input };
        return {
          formPatch: { foodAllergies: input },
          next: planRevealTurn(patched, `Got it — I'll avoid: ${input}.`)
        };
      }
      return { error: 'Tap Yes or No, or type any allergies.', next: allergiesAskTurn() };
    }

    case 'allergiesDetail': {
      if (isNoAllergies(input)) {
        return {
          formPatch: { foodAllergies: '' },
          next: planRevealTurn({ ...form, foodAllergies: '' }, 'No food allergies — noted.')
        };
      }
      if (input.length < 2) {
        return {
          error: 'Tell me what to avoid, or tap None / skip.',
          next: allergiesDetailTurn()
        };
      }
      const patched = { ...form, foodAllergies: input };
      return {
        formPatch: { foodAllergies: input },
        next: planRevealTurn(patched, `Got it — I'll avoid: ${input}.`)
      };
    }

    case 'planReveal':
      return { next: smsAskTurn(coach) };

    case 'smsAsk': {
      if (isYes(input)) {
        const timezone = form.timezone.trim() || detectedTimezone();
        return {
          formPatch: { timezone },
          next: timezoneTurn(timezone)
        };
      }
      if (isNo(input)) {
        const timezone = form.timezone.trim() || detectedTimezone();
        return {
          formPatch: { timezone, phone: '' },
          next: realCoachAskTurn()
        };
      }
      return { error: 'Tap Yes or No.', next: smsAskTurn(coach) };
    }

    case 'timezone': {
      if (normalizeChoice(input) === 'type') {
        return {
          next: {
            stage: 'timezone',
            assistantMessage: `Type your timezone (for example America/Chicago or America/Los_Angeles).`,
            quickReplies: [{ label: `Use ${detectedTimezone() || 'detected'}`, mobileLabel: 'Detected', value: `yes:${detectedTimezone()}` }]
          }
        };
      }
      if (input.toLowerCase().startsWith('yes:')) {
        const timezone = input.slice(4).trim() || detectedTimezone();
        if (!isValidTimezone(timezone)) {
          return {
            error: 'That timezone looks invalid. Try America/Denver.',
            next: timezoneTurn(form.timezone || detectedTimezone())
          };
        }
        return {
          formPatch: { timezone },
          next: phoneTurn()
        };
      }
      if (isValidTimezone(input)) {
        return {
          formPatch: { timezone: input.trim() },
          next: phoneTurn()
        };
      }
      return {
        error: 'Confirm with the button or type a timezone like America/Denver.',
        next: timezoneTurn(form.timezone || detectedTimezone())
      };
    }

    case 'phone': {
      if (isSkip(input)) {
        return {
          formPatch: { phone: '' },
          next: realCoachAskTurn()
        };
      }
      const digits = input.replace(/\D/g, '');
      if (digits.length < 10) {
        return {
          error: 'Enter a valid mobile number, or skip.',
          next: phoneTurn()
        };
      }
      return {
        formPatch: { phone: input.trim() },
        next: realCoachAskTurn()
      };
    }

    case 'realCoachAsk': {
      const value = normalizeChoice(input);
      if (
        isYes(input) ||
        value === 'code' ||
        value.includes('coach code') ||
        value.includes('initials') ||
        value.includes('work with a real')
      ) {
        return { next: realCoachCodeTurn() };
      }
      if (value === 'request' || value.includes('like a real') || value.includes('want a real')) {
        return {
          formPatch: { wantsCoach: true, coachCode: '' },
          next: readyToSubmitTurn(
            form.trackingOnly,
            "I'll also put in a request for a real coach. You can keep chatting with me either way."
          )
        };
      }
      if (isSkip(input) || isNo(input) || value.includes('no thanks')) {
        return {
          formPatch: { wantsCoach: false, coachCode: '' },
          next: readyToSubmitTurn(form.trackingOnly)
        };
      }
      const typedCode = parseCoachCode(input);
      if (typedCode) {
        return {
          formPatch: { coachCode: typedCode, wantsCoach: false },
          next: readyToSubmitTurn(
            form.trackingOnly,
            `Got it — I'll use coach code ${typedCode} to connect you with a real coach.`
          )
        };
      }
      return {
        error: 'Pick one of the options, or type a coach code.',
        next: realCoachAskTurn()
      };
    }

    case 'realCoachCode': {
      if (isSkip(input)) {
        return {
          formPatch: { coachCode: '', wantsCoach: false },
          next: readyToSubmitTurn(form.trackingOnly)
        };
      }
      const coachCode = parseCoachCode(input);
      if (!coachCode) {
        return {
          error: 'Enter a short coach code or initials, or skip.',
          next: realCoachCodeTurn()
        };
      }
      return {
        formPatch: { coachCode, wantsCoach: false },
        next: readyToSubmitTurn(
          form.trackingOnly,
          `Got it — I'll use coach code ${coachCode} to connect you with a real coach.`
        )
      };
    }

    case 'readyToSubmit': {
      const value = normalizeChoice(input);
      if (
        value === 'submit' ||
        value.includes('create') ||
        value.includes('start tracking') ||
        value === 'yes' ||
        value === 'ready' ||
        value.includes('sounds good')
      ) {
        return {
          submit: true,
          next: readyToSubmitTurn(form.trackingOnly)
        };
      }
      return {
        error: form.trackingOnly
          ? 'Tap Start tracking when you are ready.'
          : 'Tap Create my plan when you are ready.',
        next: readyToSubmitTurn(form.trackingOnly)
      };
    }

    default:
      return { next: buildIntroTurn(coach) };
  }
}
