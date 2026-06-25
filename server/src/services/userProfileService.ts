import type { Role } from '@prisma/client';
import { ProgramStatus } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { canAccessProgramClient, canAccessUser, isAdmin, isAssignedCoach } from '../auth/requireRole.js';
import { normalizeGender } from './bloodPanelMetrics.js';
import { parseDateParam } from '../utils/dates.js';
import { normalizePhone } from '../utils/phone.js';

type Actor = { id: string; role: Role };

const clientProfileSelect = {
  medicalConditions: true,
  exerciseConditions: true,
  foodConditions: true,
  dietNotes: true,
  coachNotes: true,
  occupation: true,
  activityLevel: true,
  heightInches: true,
  heightRaw: true
} as const;

type ClientProfileRecord = {
  medicalConditions: string | null;
  exerciseConditions: string | null;
  foodConditions: string | null;
  dietNotes: string | null;
  coachNotes: string | null;
  occupation: string | null;
  activityLevel: number | null;
  heightInches: number | null;
  heightRaw: string | null;
};

function normalizeText(value: string | null | undefined) {
  if (value === undefined) return undefined;
  const trimmed = value?.trim() ?? '';
  return trimmed ? trimmed : null;
}

function inchesToFeetInches(totalInches: number | null) {
  if (totalInches == null) {
    return { heightFeet: null, heightInches: null };
  }
  return {
    heightFeet: Math.floor(totalInches / 12),
    heightInches: totalInches % 12
  };
}


function formatHeightRaw(feet: number, inches: number) {
  return `${feet}'${inches}"`;
}

function serializeDemographics(user: { gender: string | null; birthDate: Date | null }) {
  return {
    gender: user.gender,
    birthDate: user.birthDate?.toISOString().slice(0, 10) ?? null
  };
}

function serializeProfile(
  user: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    gender: string | null;
    birthDate: Date | null;
    timezone: string | null;
    smsRemindersEnabled: boolean;
    clientProfile: ClientProfileRecord | null;
  },
  options: { includeClientNotes: boolean }
) {
  const height = inchesToFeetInches(user.clientProfile?.heightInches ?? null);
  return {
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone,
    timezone: user.timezone,
    smsRemindersEnabled: user.smsRemindersEnabled,
    ...serializeDemographics(user),
    ...height,
    occupation: user.clientProfile?.occupation ?? null,
    activityLevel: user.clientProfile?.activityLevel ?? null,
    medicalConditions: user.clientProfile?.medicalConditions ?? null,
    exerciseRestrictions: user.clientProfile?.exerciseConditions ?? null,
    foodAllergies: user.clientProfile?.foodConditions ?? null,
    dietaryPreferences: user.clientProfile?.dietNotes ?? null,
    clientNotes: options.includeClientNotes ? user.clientProfile?.coachNotes ?? null : null,
    canEditClientNotes: options.includeClientNotes
  };
}

function validateTimezone(value: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return value;
  } catch {
    throw new Error('Enter a valid timezone (for example, America/Denver).');
  }
}

function validateHeight(feet: number | null | undefined, inches: number | null | undefined) {
  if (feet == null && inches == null) {
    return { heightInches: null, heightRaw: null };
  }
  const nextFeet = feet ?? 0;
  const nextInches = inches ?? 0;
  if (!Number.isInteger(nextFeet) || nextFeet < 0 || nextFeet > 8) {
    throw new Error('Height feet must be between 0 and 8.');
  }
  if (!Number.isInteger(nextInches) || nextInches < 0 || nextInches > 11) {
    throw new Error('Height inches must be between 0 and 11.');
  }
  const totalInches = nextFeet * 12 + nextInches;
  return {
    heightInches: totalInches,
    heightRaw: formatHeightRaw(nextFeet, nextInches)
  };
}

async function assertProfileAccess(actor: Actor, userId: string) {
  if (await canAccessUser(actor, userId)) return;

  const program = await prisma.program.findFirst({
    where: { userId, status: ProgramStatus.ACTIVE },
    select: { coachId: true }
  });
  if (program && (await canAccessProgramClient(actor, userId, program.coachId))) return;

  throw new Error('Forbidden');
}

async function canViewClientNotes(actor: Actor, userId: string) {
  if (isAdmin(actor)) return true;
  return isAssignedCoach(actor, userId);
}

async function loadProfileUser(userId: string) {
  return prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      gender: true,
      birthDate: true,
      timezone: true,
      smsRemindersEnabled: true,
      clientProfile: { select: clientProfileSelect }
    }
  });
}

export async function getUserDemographics(actor: Actor, userId: string) {
  await assertProfileAccess(actor, userId);
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { gender: true, birthDate: true }
  });
  return serializeDemographics(user);
}

export async function updateUserDemographics(
  actor: Actor,
  userId: string,
  input: { gender?: string | null; birthDate?: string | null }
) {
  return updateUserProfile(actor, userId, input);
}

export async function getUserProfile(actor: Actor, userId: string) {
  await assertProfileAccess(actor, userId);
  const user = await loadProfileUser(userId);
  const includeClientNotes = await canViewClientNotes(actor, userId);
  return serializeProfile(user, { includeClientNotes });
}

export async function updateUserProfile(
  actor: Actor,
  userId: string,
  input: {
    firstName?: string;
    lastName?: string;
    phone?: string | null;
    gender?: string | null;
    birthDate?: string | null;
    heightFeet?: number | null;
    heightInches?: number | null;
    occupation?: string | null;
    activityLevel?: number | null;
    medicalConditions?: string | null;
    exerciseRestrictions?: string | null;
    foodAllergies?: string | null;
    dietaryPreferences?: string | null;
    clientNotes?: string | null;
    timezone?: string | null;
    smsRemindersEnabled?: boolean;
  }
) {
  await assertProfileAccess(actor, userId);

  const userData: {
    firstName?: string;
    lastName?: string;
    phone?: string | null;
    gender?: string | null;
    birthDate?: Date | null;
    timezone?: string | null;
    smsRemindersEnabled?: boolean;
  } = {};

  if (input.firstName !== undefined || input.lastName !== undefined) {
    if (actor.id !== userId) {
      throw new Error('Forbidden');
    }
  }

  if (input.firstName !== undefined) {
    const firstName = input.firstName.trim();
    if (!firstName) throw new Error('First name is required.');
    userData.firstName = firstName;
  }
  if (input.lastName !== undefined) {
    const lastName = input.lastName.trim();
    if (!lastName) throw new Error('Last name is required.');
    userData.lastName = lastName;
  }
  if (input.phone !== undefined) {
    const trimmed = input.phone?.trim();
    userData.phone = trimmed ? normalizePhone(trimmed) : null;
  }
  if (input.gender !== undefined) {
    userData.gender = input.gender ? normalizeGender(input.gender) : null;
    if (input.gender && !userData.gender) {
      throw new Error('Gender must be male or female.');
    }
  }
  if (input.birthDate !== undefined) {
    userData.birthDate = input.birthDate ? parseDateParam(input.birthDate) : null;
  }
  if (input.timezone !== undefined) {
    const timezone = normalizeText(input.timezone);
    userData.timezone = timezone ? validateTimezone(timezone) : null;
  }
  if (input.smsRemindersEnabled !== undefined) {
    userData.smsRemindersEnabled = input.smsRemindersEnabled;
  }

  const profileData: {
    medicalConditions?: string | null;
    exerciseConditions?: string | null;
    foodConditions?: string | null;
    dietNotes?: string | null;
    coachNotes?: string | null;
    occupation?: string | null;
    activityLevel?: number | null;
    heightInches?: number | null;
    heightRaw?: string | null;
  } = {};

  if (input.heightFeet !== undefined || input.heightInches !== undefined) {
    Object.assign(profileData, validateHeight(input.heightFeet, input.heightInches));
  }
  if (input.occupation !== undefined) {
    profileData.occupation = normalizeText(input.occupation) ?? null;
  }
  if (input.activityLevel !== undefined) {
    profileData.activityLevel = input.activityLevel;
  }

  if (input.medicalConditions !== undefined) {
    profileData.medicalConditions = normalizeText(input.medicalConditions) ?? null;
  }
  if (input.exerciseRestrictions !== undefined) {
    profileData.exerciseConditions = normalizeText(input.exerciseRestrictions) ?? null;
  }
  if (input.foodAllergies !== undefined) {
    profileData.foodConditions = normalizeText(input.foodAllergies) ?? null;
  }
  if (input.dietaryPreferences !== undefined) {
    profileData.dietNotes = normalizeText(input.dietaryPreferences) ?? null;
  }

  if (input.clientNotes !== undefined) {
    if (!(await canViewClientNotes(actor, userId))) {
      throw new Error('Forbidden');
    }
    profileData.coachNotes = normalizeText(input.clientNotes) ?? null;
  }

  if (Object.keys(userData).length) {
    await prisma.user.update({ where: { id: userId }, data: userData });
  }

  if (Object.keys(profileData).length) {
    await prisma.clientProfile.upsert({
      where: { userId },
      create: { userId, ...profileData },
      update: profileData
    });
  }

  const user = await loadProfileUser(userId);
  const includeClientNotes = await canViewClientNotes(actor, userId);
  return serializeProfile(user, { includeClientNotes });
}
