import type { UserAccountDetails } from '../../types';

export type ProfileDraft = {
  gender: 'm' | 'f' | '';
  birthDate: string;
  heightFeet: string;
  heightInches: string;
  occupation: string;
  activityLevel: string;
  medicalConditions: string;
  exerciseRestrictions: string;
  foodAllergies: string;
  dietaryPreferences: string;
  clientNotes: string;
};

export function emptyProfileDraft(): ProfileDraft {
  return {
    gender: '',
    birthDate: '',
    heightFeet: '',
    heightInches: '',
    occupation: '',
    activityLevel: '',
    medicalConditions: '',
    exerciseRestrictions: '',
    foodAllergies: '',
    dietaryPreferences: '',
    clientNotes: ''
  };
}

export function profileToDraft(profile: UserAccountDetails): ProfileDraft {
  return {
    gender: profile.gender === 'm' || profile.gender === 'f' ? profile.gender : '',
    birthDate: profile.birthDate ?? '',
    heightFeet: profile.heightFeet != null ? String(profile.heightFeet) : '',
    heightInches: profile.heightInches != null ? String(profile.heightInches) : '',
    occupation: profile.occupation ?? '',
    activityLevel: profile.activityLevel != null ? String(profile.activityLevel) : '',
    medicalConditions: profile.medicalConditions ?? '',
    exerciseRestrictions: profile.exerciseRestrictions ?? '',
    foodAllergies: profile.foodAllergies ?? '',
    dietaryPreferences: profile.dietaryPreferences ?? '',
    clientNotes: profile.clientNotes ?? ''
  };
}

export function buildProfilePayload(draft: ProfileDraft, canEditClientNotes: boolean) {
  const payload: Record<string, string | number | null> = {
    gender: draft.gender || null,
    birthDate: draft.birthDate || null,
    medicalConditions: draft.medicalConditions.trim() || null,
    exerciseRestrictions: draft.exerciseRestrictions.trim() || null,
    foodAllergies: draft.foodAllergies.trim() || null,
    dietaryPreferences: draft.dietaryPreferences.trim() || null,
    occupation: draft.occupation.trim() || null,
    activityLevel: draft.activityLevel ? Number(draft.activityLevel) : null
  };

  if (!draft.heightFeet.trim() && !draft.heightInches.trim()) {
    payload.heightFeet = null;
    payload.heightInches = null;
  } else {
    const feet = Number(draft.heightFeet);
    const inches = Number(draft.heightInches || '0');
    if (!Number.isInteger(feet) || feet < 0 || feet > 8) {
      throw new Error('Enter a valid height in feet (0-8).');
    }
    if (!Number.isInteger(inches) || inches < 0 || inches > 11) {
      throw new Error('Enter a valid height in inches (0-11).');
    }
    payload.heightFeet = feet;
    payload.heightInches = inches;
  }

  if (canEditClientNotes) {
    payload.clientNotes = draft.clientNotes.trim() || null;
  }

  return payload;
}
