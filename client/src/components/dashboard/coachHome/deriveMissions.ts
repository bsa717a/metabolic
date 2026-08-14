import type { Exercise, Meal } from '../../../types';
import { countMealProgress } from '../../virtualCoach/coachChatGreeting';

const LOGGED_MEAL_STATUSES = new Set(['EATEN_AS_PLANNED', 'MODIFIED', 'UNPLANNED']);

export function formatPlannedTime(plannedTime?: string | null) {
  if (!plannedTime) return null;
  const match = plannedTime.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return plannedTime;
  const [, hour, minute] = match;
  return new Date(2000, 0, 1, Number(hour), Number(minute))
    .toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    .replace(' AM', 'am')
    .replace(' PM', 'pm');
}

export function nextUnloggedMeal(meals: Meal[]) {
  return [...meals]
    .filter((meal) => meal.status !== 'SKIPPED')
    .sort((a, b) => a.mealNumber - b.mealNumber)
    .find((meal) => !LOGGED_MEAL_STATUSES.has(meal.status));
}

export function workoutLabel(exercises: Exercise[]) {
  if (!exercises.length) return 'No workout planned';
  const focus = exercises.find((item) => item.exercise.bodyPart)?.exercise.bodyPart;
  if (focus) return `Workout – ${focus}`;
  return exercises[0]?.exercise.name ? `Workout – ${exercises[0].exercise.name}` : "Today's workout";
}

export function workoutDone(exercises: Exercise[]) {
  if (!exercises.length) return true;
  return exercises.every((item) => item.status === 'DONE' || item.status === 'SKIPPED');
}

export function mealMissionDone(meals: Meal[]) {
  const { planned } = countMealProgress(meals);
  return planned > 0 && !nextUnloggedMeal(meals);
}

export function mealMissionLabel(meals: Meal[]) {
  const next = nextUnloggedMeal(meals);
  if (!next) {
    const { planned } = countMealProgress(meals);
    return planned > 0 ? 'All meals logged' : 'No meals planned';
  }
  const time = formatPlannedTime(next.plannedTime);
  return time ? `${next.name} – ${time}` : next.name;
}
