import { describe, expect, it } from 'vitest';
import type { Meal } from '../types';
import { buildNutritionPlanHtml, buildNutritionHorizontalWeekHtml } from './printNutritionPlan';
import { buildExercisePlanHtml, buildExerciseWeekPlanHtml } from './printExercisePlan';
import type { DayExercises } from './planExportData';

function meal(mealNumber: number, name: string, food: string, portion: string): Meal {
  const [quantity, ...unitParts] = portion.split(' ');
  return {
    id: `${mealNumber}`,
    mealNumber,
    name,
    status: 'PLANNED',
    plannedCalories: 400,
    plannedProtein: 30,
    plannedCarbs: 40,
    plannedFat: 10,
    actualCalories: 0,
    actualProtein: 0,
    actualCarbs: 0,
    actualFat: 0,
    items: [
      {
        id: `item-${mealNumber}`,
        type: 'PLANNED',
        nameSnapshot: food,
        quantity: Number(quantity),
        unit: unitParts.join(' '),
        calories: 150,
        protein: 5,
        carbs: 27,
        fat: 3
      }
    ]
  };
}

const weekDays = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'];

describe('nutrition print orientation', () => {
  it('keeps the current portrait day sheet as the vertical print', () => {
    const html = buildNutritionPlanHtml([meal(1, 'Breakfast', 'Oats', '1 cup')], '2026-10-05');
    expect(html).toContain('Nutrition plan');
    expect(html).toContain('size: portrait');
    expect(html).toContain('repeat(2, minmax(0, 1fr))');
    expect(html).not.toContain('Master Metabolic Plan');
  });

  it('builds a one-page horizontal week sheet without an exercise column', () => {
    const html = buildNutritionHorizontalWeekHtml({
      days: weekDays.map((date) => ({
        date,
        meals:
          date === '2026-10-05'
            ? [
                meal(1, 'Breakfast', 'Oats', '1 cup'),
                meal(2, 'Lunch', 'Chicken', '4 oz'),
                meal(3, 'Snack', 'Apple', '1 medium'),
                meal(4, 'Dinner', 'Salmon', '5 oz')
              ]
            : []
      })),
      weekStart: '2026-10-05',
      selectedDate: '2026-10-05',
      clientName: 'Mona',
      weekNumber: 18,
      waterGoalOz: 80,
      reminders: 'Meat substitutions: turkey for chicken.',
      sourcePlanDate: '2026-10-06'
    });

    expect(html).toContain("Week 18 Mona's Master Metabolic Plan");
    expect(html).toContain('Daily water goal: 80 oz');
    expect(html).toContain('Week of October 5, 2026');
    expect(html).toContain('>Day<');
    expect(html).toContain('>Meal 1<');
    expect(html).toContain('>Meal 2<');
    expect(html).toContain('>Meal 3<');
    expect(html).toContain('>Meal 4<');
    expect(html).toContain('>Water oz<');
    expect(html).toContain('>Sleep<');
    expect(html).toContain('>Notes<');
    expect(html).toContain('>Mon<');
    expect(html).toContain('>Sun<');
    expect(html.toLowerCase()).not.toContain('exercise');
    expect(html).toContain('Oats • 1 cup');
    expect(html).toContain('Salmon • 5 oz');
    expect(html).toContain('grid-template-columns: repeat(4, minmax(0, 1fr))');
    expect(html).toContain('size: letter landscape');
    expect(html).toContain('Substitutions and reminders from the program');
    expect(html).toContain('Source plan date:');
    expect(html).toContain('Meat substitutions: turkey for chicken.');
  });
});

describe('exercise print orientation', () => {
  const exercises: DayExercises[] = weekDays.map((date) => ({
    date,
    exercises:
      date === '2026-10-05'
        ? [
            {
              id: '1',
              status: 'PLANNED',
              sets: 3,
              reps: '10',
              exercise: { name: 'Squat', bodyPart: 'Legs' }
            }
          ]
        : []
  }));

  it('keeps the current day list as the vertical print', () => {
    const html = buildExercisePlanHtml(exercises[0].exercises, '2026-10-05');
    expect(html).toContain('Exercise plan');
    expect(html).toContain('size: portrait');
    expect(html).toContain('Squat');
    expect(html).not.toContain('week-grid');
  });

  it('keeps days and workouts side by side for the horizontal week print', () => {
    const html = buildExerciseWeekPlanHtml(exercises, 'Oct 5 – 11');
    expect(html).toContain('week-grid');
    expect(html).toContain('repeat(7, minmax(0, 1fr))');
    expect(html).toContain('landscape-print');
    expect(html).toContain('Squat');
  });
});
