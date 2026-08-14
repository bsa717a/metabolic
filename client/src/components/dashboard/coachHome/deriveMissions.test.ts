import { describe, expect, it } from 'vitest';
import type { Exercise, Meal } from '../../../types';
import { mealMissionDone, mealMissionLabel, nextUnloggedMeal, workoutDone, workoutLabel } from './deriveMissions';

function meal(overrides: Partial<Meal> & Pick<Meal, 'status' | 'name' | 'mealNumber'>): Meal {
  return {
    id: overrides.name,
    plannedCalories: 400,
    plannedProtein: 30,
    plannedCarbs: 40,
    plannedFat: 10,
    actualCalories: 0,
    actualProtein: 0,
    actualCarbs: 0,
    actualFat: 0,
    items: [],
    ...overrides
  };
}

function exercise(status: Exercise['status'], bodyPart?: string, name = 'Bench Press'): Exercise {
  return {
    id: name,
    status,
    exercise: { name, bodyPart }
  };
}

describe('deriveMissions', () => {
  it('picks the next unlogged meal and formats its time', () => {
    const meals = [
      meal({ mealNumber: 1, name: 'Breakfast', status: 'EATEN_AS_PLANNED', plannedTime: '06:00' }),
      meal({ mealNumber: 2, name: 'Lunch', status: 'PLANNED', plannedTime: '12:30' })
    ];
    expect(nextUnloggedMeal(meals)?.name).toBe('Lunch');
    expect(mealMissionLabel(meals)).toMatch(/Lunch/);
  });

  it('does not mark the meal mission done when nothing is planned', () => {
    expect(mealMissionDone([])).toBe(false);
    expect(mealMissionLabel([])).toBe('No meals planned');
    expect(
      mealMissionDone([meal({ mealNumber: 1, name: 'Breakfast', status: 'EATEN_AS_PLANNED' })])
    ).toBe(true);
  });

  it('marks a workout done when every exercise is done or skipped', () => {
    expect(workoutDone([exercise('DONE', 'Chest'), exercise('SKIPPED', 'Back')])).toBe(true);
    expect(workoutDone([exercise('PLANNED', 'Chest')])).toBe(false);
    expect(workoutLabel([exercise('PLANNED', 'Chest')])).toBe('Workout – Chest');
  });
});
