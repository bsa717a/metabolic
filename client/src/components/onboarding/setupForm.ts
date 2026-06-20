import { api } from '../../services/api';
import { detectedTimezone } from '../../utils/timezoneOptions';
import { hasValidCurrentWeight } from '../../utils/onboardingWeight';
import { normalizeBirthDateKey, normalizeSetupGender } from '../../utils/setupDraft';
import type { SetupFormState } from '../../types/onboarding';

type SubmitOptions = {
  requireGoalWeight?: boolean;
  requireTimezone?: boolean;
};

function parseOptionalBodyFat(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric) || numeric <= 0) return NaN;
  return numeric;
}

export function validateSetupForm(form: SetupFormState, options: SubmitOptions = {}) {
  const { requireGoalWeight = true, requireTimezone = true } = options;
  const currentWeight = Number(form.weight);
  const targetWeight = Number(form.goalWeight);
  const currentBodyFat = parseOptionalBodyFat(form.bodyFat);
  const targetBodyFat = parseOptionalBodyFat(form.goalBodyFat);

  if (!hasValidCurrentWeight(currentWeight)) {
    return 'Please confirm your current weight so we can keep your plan accurate.';
  }
  if (requireGoalWeight && !hasValidCurrentWeight(targetWeight)) {
    return 'Enter your goal weight.';
  }
  if (currentBodyFat !== undefined && Number.isNaN(currentBodyFat)) {
    return 'Enter a valid current body fat percentage.';
  }
  if (targetBodyFat !== undefined && Number.isNaN(targetBodyFat)) {
    return 'Enter a valid goal body fat percentage.';
  }
  if (requireTimezone && !form.timezone.trim() && !detectedTimezone()) {
    return 'Select your timezone.';
  }

  return null;
}

export function buildSetupPayload(form: SetupFormState, options: SubmitOptions = {}) {
  const currentWeight = Number(form.weight);
  const resolvedGoalWeight = hasValidCurrentWeight(Number(form.goalWeight))
    ? Number(form.goalWeight)
    : currentWeight;
  const currentBodyFat = parseOptionalBodyFat(form.bodyFat);
  const targetBodyFat = parseOptionalBodyFat(form.goalBodyFat);
  const timezone = form.timezone.trim() || detectedTimezone();

  return {
    weight: currentWeight,
    goalWeight: resolvedGoalWeight,
    ...(currentBodyFat !== undefined && !Number.isNaN(currentBodyFat) ? { bodyFat: currentBodyFat } : {}),
    ...(targetBodyFat !== undefined && !Number.isNaN(targetBodyFat) ? { goalBodyFat: targetBodyFat } : {}),
    ...(form.coachCode.trim() ? { coachCode: form.coachCode.trim() } : {}),
    ...(form.wantsCoach ? { wantsCoach: true } : {}),
    ...(form.gender ? { gender: form.gender } : {}),
    ...(form.birthDate ? { birthDate: form.birthDate } : {}),
    timezone
  };
}

export async function submitSetupForm(form: SetupFormState, options: SubmitOptions = {}) {
  const validationError = validateSetupForm(form, options);
  if (validationError) {
    throw new Error(validationError);
  }

  await api('/api/onboarding/setup', {
    method: 'POST',
    body: JSON.stringify(buildSetupPayload(form, options))
  });
}

export function createEmptySetupForm(): SetupFormState {
  return {
    weight: '',
    goalWeight: '',
    bodyFat: '',
    goalBodyFat: '',
    coachCode: '',
    wantsCoach: false,
    gender: '',
    birthDate: '',
    timezone: ''
  };
}

export function applyDraftToForm(
  form: SetupFormState,
  draft: Partial<{
    weight: string;
    goalWeight: string;
    bodyFat: string;
    goalBodyFat: string;
    gender: string;
    birthDate: string;
    timezone: string;
    wantsCoach: boolean;
  }>,
  profile?: { gender?: string | null; birthDate?: string | null; timezone?: string | null } | null,
  user?: { gender?: string | null; birthDate?: string | null; timezone?: string | null } | null
): SetupFormState {
  const genderValue = normalizeSetupGender(draft.gender || profile?.gender || user?.gender);
  const birthDateValue = normalizeBirthDateKey(draft.birthDate || profile?.birthDate || user?.birthDate);
  const timezoneValue = draft.timezone || profile?.timezone || user?.timezone || form.timezone;

  return {
    ...form,
    weight: draft.weight || form.weight,
    goalWeight: draft.goalWeight || form.goalWeight,
    bodyFat: draft.bodyFat || form.bodyFat,
    goalBodyFat: draft.goalBodyFat || form.goalBodyFat,
    gender: genderValue || form.gender,
    birthDate: birthDateValue || form.birthDate,
    timezone: timezoneValue,
    wantsCoach: draft.wantsCoach ?? form.wantsCoach
  };
}
