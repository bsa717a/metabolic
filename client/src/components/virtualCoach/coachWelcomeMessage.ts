import type { VirtualCoach } from '../../data/virtualCoaches';
import type { ProgramMetric } from '../../types';

/** When true, keep the welcome chat open across quick replies — complete only on explicit close. */
export const DEFER_COACH_WELCOME_COMPLETE = true;

export type CoachWelcomeGoals = {
  currentWeight?: number;
  goalWeight?: number;
  currentBodyFat?: number;
  goalBodyFat?: number;
};

function parseOptionalNumber(value: string | number | undefined | null) {
  if (value === undefined || value === null || value === '') return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

export function coachWelcomeGoalsFromForm(form: {
  weight: string;
  goalWeight: string;
  bodyFat: string;
  goalBodyFat: string;
}): CoachWelcomeGoals {
  return {
    currentWeight: parseOptionalNumber(form.weight),
    goalWeight: parseOptionalNumber(form.goalWeight),
    currentBodyFat: parseOptionalNumber(form.bodyFat),
    goalBodyFat: parseOptionalNumber(form.goalBodyFat)
  };
}

export function coachWelcomeGoalsFromMetrics(metrics: ProgramMetric[]): CoachWelcomeGoals {
  const weight = metrics.find((metric) => metric.metricType === 'WEIGHT');
  const bodyFat = metrics.find((metric) => metric.metricType === 'BODY_FAT');
  return {
    currentWeight: parseOptionalNumber(weight?.currentValue),
    goalWeight: parseOptionalNumber(weight?.goalValue),
    currentBodyFat: parseOptionalNumber(bodyFat?.currentValue),
    goalBodyFat: parseOptionalNumber(bodyFat?.goalValue)
  };
}

function formatWeight(value: number) {
  if (!Number.isFinite(value)) return `${value} lb`;
  return Number.isInteger(value) ? `${value} lb` : `${value.toFixed(1)} lb`;
}

function formatBodyFat(value: number) {
  if (!Number.isFinite(value)) return `${value}%`;
  return Number.isInteger(value) ? `${value}%` : `${value.toFixed(1)}%`;
}

function describeGoals(goals: CoachWelcomeGoals) {
  const parts: string[] = [];

  if (goals.currentWeight != null && goals.goalWeight != null) {
    parts.push(`move your weight from ${formatWeight(goals.currentWeight)} to ${formatWeight(goals.goalWeight)}`);
  } else if (goals.goalWeight != null) {
    parts.push(`work toward ${formatWeight(goals.goalWeight)}`);
  }

  if (goals.currentBodyFat != null && goals.goalBodyFat != null) {
    parts.push(`bring body fat from ${formatBodyFat(goals.currentBodyFat)} to ${formatBodyFat(goals.goalBodyFat)}`);
  } else if (goals.goalBodyFat != null) {
    parts.push(`work toward ${formatBodyFat(goals.goalBodyFat)} body fat`);
  }

  return parts;
}

const MOTIVATION =
  "You're taking the hard step most people put off — showing up for yourself. That matters, and every small choice from here builds real momentum.";

const JOURNEY_SUPPORT =
  "I'm here, and the app is here, to help you on your journey.";

const APP_PROMPT =
  "You should probably get to know the app a little. What would you like to know about?";

export const COACH_WELCOME_QUICK_REPLIES = [
  {
    label: 'How to setup SMS',
    message:
      'Check my SMS texting setup with you — is my phone and timezone configured, and how do I text you from the contact I downloaded during setup?'
  },
  { label: 'Reviewing my meals', message: 'Reviewing my meals', action: 'review-meals' as const },
  { label: 'Reviewing my exercises', message: 'How do I review and complete my exercises in the app?' },
  { label: 'How do I log hydration', message: 'How do I log hydration in the app?' }
] as const;

export function buildCoachWelcomeMessage(
  coach: VirtualCoach,
  firstName?: string | null,
  goals?: CoachWelcomeGoals
) {
  const greeting = firstName?.trim() ? `, ${firstName.trim()}` : '';
  const goalParts = goals ? describeGoals(goals) : [];

  const intro = `Welcome to Metabolic${greeting}! I'm ${coach.name}, and I'm really happy to be working with you on this journey.`;

  const sections = [intro];

  if (goalParts.length > 0) {
    const goalsLine =
      goalParts.length === 1
        ? `From what you've shared, our focus is to ${goalParts[0]}.`
        : `From what you've shared, our focus is to ${goalParts.slice(0, -1).join(', ')} and ${goalParts[goalParts.length - 1]}.`;
    sections.push(goalsLine);
  }

  sections.push(MOTIVATION, JOURNEY_SUPPORT, APP_PROMPT);

  return sections.join('\n\n');
}
