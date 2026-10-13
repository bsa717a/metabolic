import type { VirtualCoachId } from '../../data/virtualCoaches';
import { api } from '../../services/api';
import { resolveTimezone } from '../../utils/timezoneOptions';
import { hasValidCurrentWeight } from '../../utils/onboardingWeight';
import { normalizeBirthDateKey, normalizeSetupGender } from '../../utils/setupDraft';
import { getPendingCoachInvite, clearPendingCoachInvite } from '../../utils/pendingCoachInvite';
import type { SetupFormState } from '../../types/onboarding';

type SubmitOptions = {
  requireGoalWeight?: boolean;
  requireTimezone?: boolean;
  /** Imported users already have a coach. Never send a code that would replace them. */
  preserveAssignedCoach?: boolean;
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
  if (requireTimezone && !resolveTimezone(form.timezone)) {
    return 'We need your timezone to schedule reminders at the right time. Please select one above.';
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
  const heightFeet = form.heightFeet.trim() ? Number(form.heightFeet) : undefined;
  const heightInches = form.heightInches.trim() ? Number(form.heightInches) : undefined;
  const timezone = resolveTimezone(form.timezone);

  const keepAssignedCoach = options.preserveAssignedCoach === true;

  return {
    weight: currentWeight,
    goalWeight: resolvedGoalWeight,
    ...(currentBodyFat !== undefined && !Number.isNaN(currentBodyFat) ? { bodyFat: currentBodyFat } : {}),
    ...(targetBodyFat !== undefined && !Number.isNaN(targetBodyFat) ? { goalBodyFat: targetBodyFat } : {}),
    ...(heightFeet !== undefined && Number.isFinite(heightFeet) ? { heightFeet } : {}),
    ...(heightInches !== undefined && Number.isFinite(heightInches) ? { heightInches } : {}),
    ...(form.occupation.trim() ? { occupation: form.occupation.trim() } : {}),
    ...(form.activityLevel ? { activityLevel: Number(form.activityLevel) } : {}),
    ...(!keepAssignedCoach && form.coachCode.trim() ? { coachCode: form.coachCode.trim() } : {}),
    ...(!keepAssignedCoach && form.wantsCoach ? { wantsCoach: true } : {}),
    ...(form.selectedVirtualCoachId
      ? { selectedVirtualCoachId: form.selectedVirtualCoachId as VirtualCoachId }
      : {}),
    ...(!keepAssignedCoach && form.trackingOnly && !form.coachCode.trim() ? { trackingOnly: true } : {}),
    ...(form.gender ? { gender: form.gender } : {}),
    ...(form.birthDate ? { birthDate: form.birthDate } : {}),
    ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
    // Only send when set — a blank field must not wipe imported food notes.
    ...(form.foodAllergies.trim() ? { foodAllergies: form.foodAllergies.trim() } : {}),
    ...(form.dietaryPreferences.trim()
      ? { dietaryPreferences: form.dietaryPreferences.trim() }
      : {}),
    ...(form.textReminders === 'yes'
      ? { textReminders: true }
      : form.textReminders === 'no'
        ? { textReminders: false }
        : {}),
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

  clearPendingCoachInvite();
}

export function createEmptySetupForm(): SetupFormState {
  const pendingInvite = getPendingCoachInvite();
  return {
    weight: '',
    goalWeight: '',
    bodyFat: '',
    goalBodyFat: '',
    heightFeet: '',
    heightInches: '',
    occupation: '',
    activityLevel: '',
    coachCode: pendingInvite || '',
    wantsCoach: false,
    selectedVirtualCoachId: '',
    trackingOnly: false,
    gender: '',
    birthDate: '',
    timezone: '',
    phone: '',
    foodAllergies: '',
    dietaryPreferences: '',
    textReminders: ''
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
    heightFeet: string;
    heightInches: string;
    foodAllergies: string;
    dietaryPreferences: string;
    activityLevel: string;
    phone: string;
    occupation: string;
  }>,
  profile?: {
    gender?: string | null;
    birthDate?: string | null;
    timezone?: string | null;
    phone?: string | null;
    heightFeet?: number | null;
    heightInches?: number | null;
    foodAllergies?: string | null;
    dietaryPreferences?: string | null;
    activityLevel?: number | null;
    occupation?: string | null;
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
  const timezoneValue = resolveTimezone(
    draft.timezone || profile?.timezone || user?.timezone || form.timezone
  );
  const phoneValue = draft.phone?.trim() || profile?.phone?.trim() || user?.phone?.trim() || form.phone;
  const heightFeet =
    draft.heightFeet ||
    (profile?.heightFeet != null ? String(profile.heightFeet) : '') ||
    form.heightFeet;
  const heightInches =
    draft.heightInches ||
    (profile?.heightInches != null ? String(profile.heightInches) : '') ||
    form.heightInches;
  const activityLevel =
    draft.activityLevel ||
    (profile?.activityLevel != null ? String(profile.activityLevel) : '') ||
    form.activityLevel;

  return {
    ...form,
    weight: draft.weight || form.weight,
    goalWeight: draft.goalWeight || form.goalWeight,
    bodyFat: draft.bodyFat || form.bodyFat,
    goalBodyFat: draft.goalBodyFat || form.goalBodyFat,
    heightFeet,
    heightInches,
    occupation: draft.occupation?.trim() || profile?.occupation?.trim() || form.occupation,
    activityLevel,
    foodAllergies: draft.foodAllergies?.trim() || profile?.foodAllergies?.trim() || form.foodAllergies,
    dietaryPreferences:
      draft.dietaryPreferences?.trim() || profile?.dietaryPreferences?.trim() || form.dietaryPreferences,
    gender: genderValue || form.gender,
    birthDate: birthDateValue || form.birthDate,
    timezone: timezoneValue,
    phone: phoneValue,
    wantsCoach: draft.wantsCoach ?? form.wantsCoach
  };
}
