import type { VirtualCoachId } from '../../data/virtualCoaches';
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

export function buildSetupPayload(form: SetupFormState) {
  const currentWeight = Number(form.weight);
  const resolvedGoalWeight = hasValidCurrentWeight(Number(form.goalWeight))
    ? Number(form.goalWeight)
    : currentWeight;
  const currentBodyFat = parseOptionalBodyFat(form.bodyFat);
  const targetBodyFat = parseOptionalBodyFat(form.goalBodyFat);
  const heightFeet = form.heightFeet.trim() ? Number(form.heightFeet) : undefined;
  const heightInches = form.heightInches.trim() ? Number(form.heightInches) : undefined;
  const timezone = form.timezone.trim() || detectedTimezone();

  return {
    weight: currentWeight,
    goalWeight: resolvedGoalWeight,
    ...(currentBodyFat !== undefined && !Number.isNaN(currentBodyFat) ? { bodyFat: currentBodyFat } : {}),
    ...(targetBodyFat !== undefined && !Number.isNaN(targetBodyFat) ? { goalBodyFat: targetBodyFat } : {}),
    ...(heightFeet !== undefined && Number.isFinite(heightFeet) ? { heightFeet } : {}),
    ...(heightInches !== undefined && Number.isFinite(heightInches) ? { heightInches } : {}),
    ...(form.occupation.trim() ? { occupation: form.occupation.trim() } : {}),
    ...(form.activityLevel ? { activityLevel: Number(form.activityLevel) } : {}),
    ...(form.trackingOnly ? {} : form.coachCode.trim() ? { coachCode: form.coachCode.trim() } : {}),
    ...(form.trackingOnly ? {} : form.wantsCoach ? { wantsCoach: true } : {}),
    ...(form.trackingOnly || form.coachCode.trim() || form.wantsCoach
      ? {}
      : form.selectedVirtualCoachId
        ? { selectedVirtualCoachId: form.selectedVirtualCoachId as VirtualCoachId }
        : {}),
    ...(form.trackingOnly ? { trackingOnly: true } : {}),
    ...(form.gender ? { gender: form.gender } : {}),
    ...(form.birthDate ? { birthDate: form.birthDate } : {}),
    ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
    // Only send when set — empty string would wipe allergies on migrated profiles.
    ...(form.foodAllergies.trim() ? { foodAllergies: form.foodAllergies.trim() } : {}),
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
    body: JSON.stringify(buildSetupPayload(form))
  });
}

export function createEmptySetupForm(): SetupFormState {
  return {
    weight: '',
    goalWeight: '',
    bodyFat: '',
    goalBodyFat: '',
    heightFeet: '',
    heightInches: '',
    occupation: '',
    activityLevel: '',
    coachCode: '',
    wantsCoach: false,
    selectedVirtualCoachId: '',
    trackingOnly: false,
    gender: '',
    birthDate: '',
    timezone: '',
    phone: '',
    foodAllergies: ''
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
  profile?: {
    gender?: string | null;
    birthDate?: string | null;
    timezone?: string | null;
    phone?: string | null;
  } | null,
  user?: {
    gender?: string | null;
    birthDate?: string | null;
    timezone?: string | null;
    phone?: string | null;
  } | null
): SetupFormState {
  const genderValue = normalizeSetupGender(draft.gender || profile?.gender || user?.gender);
  const birthDateValue = normalizeBirthDateKey(draft.birthDate || profile?.birthDate || user?.birthDate);
  const timezoneValue = draft.timezone || profile?.timezone || user?.timezone || form.timezone;
  const phoneValue = profile?.phone?.trim() || user?.phone?.trim() || form.phone;

  return {
    ...form,
    weight: draft.weight || form.weight,
    goalWeight: draft.goalWeight || form.goalWeight,
    bodyFat: draft.bodyFat || form.bodyFat,
    goalBodyFat: draft.goalBodyFat || form.goalBodyFat,
    gender: genderValue || form.gender,
    birthDate: birthDateValue || form.birthDate,
    timezone: timezoneValue,
    phone: phoneValue,
    wantsCoach: draft.wantsCoach ?? form.wantsCoach
  };
}
