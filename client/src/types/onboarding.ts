export type SetupDraft = {
  weight: string;
  goalWeight: string;
  bodyFat: string;
  goalBodyFat: string;
  gender: string;
  birthDate: string;
  timezone: string;
  wantsCoach: boolean;
  hasExistingWeight: boolean;
};

export type SetupFormState = {
  weight: string;
  goalWeight: string;
  bodyFat: string;
  goalBodyFat: string;
  heightFeet: string;
  heightInches: string;
  occupation: string;
  activityLevel: string;
  coachCode: string;
  wantsCoach: boolean;
  trackingOnly: boolean;
  gender: '' | 'm' | 'f';
  birthDate: string;
  timezone: string;
};
