import type { Meal } from '../../types';

const LOGGED_MEAL_STATUSES = new Set(['EATEN_AS_PLANNED', 'MODIFIED', 'UNPLANNED']);

export function countMealProgress(meals: Meal[]) {
  const active = meals.filter((meal) => meal.status !== 'SKIPPED');
  const logged = active.filter((meal) => LOGGED_MEAL_STATUSES.has(meal.status));
  return { logged: logged.length, planned: active.length };
}

const MOTIVATION = {
  perfect: [
    "You're crushing it today — every meal is logged.",
    'Full sweep on meals today. Love to see it.',
    'You logged every meal today — that is real consistency.'
  ],
  strong: [
    "You're on a roll — most of today's meals are in.",
    'Strong day so far. Almost the whole board is checked off.',
    "Nice work — you're close to a perfect meal day."
  ],
  half: [
    "Good momentum — you're halfway through today's meals.",
    'Solid progress today. Keep that going.',
    "You're building a strong day — half your meals are logged."
  ],
  started: [
    "Good start — you've already got meals logged today.",
    'Nice — you have meals on the board already.',
    'Off to a good start today.'
  ]
} as const;

function pickLine(lines: readonly string[], seed: number) {
  return lines[seed % lines.length];
}

function mealProgressMotivation(meals: Meal[]) {
  const { logged, planned } = countMealProgress(meals);
  if (planned === 0 || logged === 0) return null;

  const ratio = logged / planned;
  if (logged >= planned) return pickLine(MOTIVATION.perfect, logged);
  if (ratio >= 0.75) return pickLine(MOTIVATION.strong, logged);
  if (ratio >= 0.5) return pickLine(MOTIVATION.half, logged);
  return pickLine(MOTIVATION.started, logged);
}

export function buildCoachChatOpeningMessage(firstName: string | null | undefined, meals: Meal[]) {
  const name = firstName?.trim();
  const greeting = name ? `Hey ${name}, what can I do for you?` : 'Hey, what can I do for you?';
  const motivation = mealProgressMotivation(meals);
  return motivation ? `${greeting}\n\n${motivation}` : greeting;
}
