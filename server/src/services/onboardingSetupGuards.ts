export function heightFieldsFromProfile(heightInches: number | null | undefined, heightRaw: string | null | undefined) {
  if (heightInches != null && heightInches > 0) {
    return {
      heightFeet: String(Math.floor(heightInches / 12)),
      heightInches: String(heightInches % 12)
    };
  }

  const raw = heightRaw?.trim() ?? '';
  const match = raw.match(/^(\d+)\s*'\s*(\d+)/);
  if (match) {
    return { heightFeet: match[1], heightInches: match[2] };
  }

  return { heightFeet: '', heightInches: '' };
}

export function shouldPreserveImportedProgram(input: {
  mealCount: number;
  exerciseCount: number;
  coachId: string | null;
  hasActiveCoachAssignment: boolean;
}) {
  return (
    input.mealCount > 0 ||
    input.exerciseCount > 0 ||
    Boolean(input.coachId) ||
    input.hasActiveCoachAssignment
  );
}

type ClientProfileSetupInput = {
  heightFeet?: number;
  heightInches?: number;
  occupation?: string;
  activityLevel?: number;
  foodAllergies?: string;
  dietaryPreferences?: string;
};

export function buildClientProfileData(input: ClientProfileSetupInput) {
  const clientProfileData: {
    heightInches?: number;
    heightRaw?: string;
    occupation?: string;
    activityLevel?: number;
    foodConditions?: string;
    dietNotes?: string;
  } = {};
  if (input.heightFeet !== undefined || input.heightInches !== undefined) {
    const feet = input.heightFeet ?? 0;
    const inches = input.heightInches ?? 0;
    clientProfileData.heightInches = feet * 12 + inches;
    clientProfileData.heightRaw = `${feet}'${inches}"`;
  }
  if (input.occupation?.trim()) {
    clientProfileData.occupation = input.occupation.trim();
  }
  if (input.activityLevel !== undefined) {
    clientProfileData.activityLevel = input.activityLevel;
  }
  // Blank answers must not wipe notes the import already stored.
  const foodNotes = input.foodAllergies?.trim();
  if (foodNotes) {
    clientProfileData.foodConditions = foodNotes;
  }
  const dietNotes = input.dietaryPreferences?.trim();
  if (dietNotes) {
    clientProfileData.dietNotes = dietNotes;
  }
  return clientProfileData;
}
