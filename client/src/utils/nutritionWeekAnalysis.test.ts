import { describe, expect, it } from 'vitest';
import { analyzeNutritionWeek, previousWeekDates } from './nutritionWeekAnalysis';

function meal(
  overrides: Partial<{
    name: string;
    status: string;
    plannedCalories: number;
    actualCalories: number;
    plannedProtein: number;
    actualProtein: number;
  }> = {}
) {
  return {
    id: 'm1',
    mealNumber: 1,
    name: overrides.name ?? 'Breakfast',
    status: overrides.status ?? 'EATEN_AS_PLANNED',
    plannedCalories: overrides.plannedCalories ?? 500,
    plannedProtein: overrides.plannedProtein ?? 30,
    plannedCarbs: 40,
    plannedFat: 15,
    actualCalories: overrides.actualCalories ?? 500,
    actualProtein: overrides.actualProtein ?? 30,
    actualCarbs: 40,
    actualFat: 15,
    items: []
  };
}

describe('analyzeNutritionWeek', () => {
  it('summarizes adherence and generates coach insights', () => {
    const weekDates = ['2026-06-22', '2026-06-23', '2026-06-24', '2026-06-25', '2026-06-26', '2026-06-27', '2026-06-28'];
    const days = [
      { date: '2026-06-22', meals: [meal(), meal({ name: 'Lunch' })] },
      { date: '2026-06-23', meals: [meal({ status: 'MISSED', actualCalories: 0, actualProtein: 0 })] },
      { date: '2026-06-24', meals: [] },
      {
        date: '2026-06-25',
        meals: [
          meal({
            name: 'Dinner',
            status: 'SKIPPED',
            actualCalories: 0,
            actualProtein: 0
          })
        ]
      }
    ];

    const analysis = analyzeNutritionWeek(days, weekDates);

    expect(analysis.plannedMeals).toBe(4);
    expect(analysis.onPlanMeals).toBe(2);
    expect(analysis.missedMeals).toBe(2);
    expect(analysis.noPlanDays).toBeGreaterThan(0);
    expect(analysis.topMissed.length).toBeGreaterThan(0);
    expect(analysis.insights.length).toBeGreaterThan(0);
    expect(analysis.insights.some((line) => line.includes('on plan'))).toBe(true);
  });

  it('handles an empty week', () => {
    const weekDates = ['2026-06-22', '2026-06-23', '2026-06-24', '2026-06-25', '2026-06-26', '2026-06-27', '2026-06-28'];
    const analysis = analyzeNutritionWeek([], weekDates);

    expect(analysis.plannedMeals).toBe(0);
    expect(analysis.insights[0]).toContain('No meals were planned');
  });

  it('compares against the previous week', () => {
    const weekDates = ['2026-06-22', '2026-06-23', '2026-06-24', '2026-06-25', '2026-06-26', '2026-06-27', '2026-06-28'];
    const prevDates = previousWeekDates('2026-06-22');

    const currentDays = [{ date: '2026-06-22', meals: [meal(), meal({ name: 'Lunch' })] }];
    const previousDays = [
      {
        date: '2026-06-15',
        meals: [meal({ status: 'MISSED', actualCalories: 0, actualProtein: 0 })]
      }
    ];

    const analysis = analyzeNutritionWeek(currentDays, weekDates, {
      previousDays,
      previousWeekDates: prevDates
    });

    expect(analysis.comparison).not.toBeNull();
    expect(analysis.comparison?.trend).toBe('up');
    expect(analysis.insights.some((line) => line.includes('last week'))).toBe(true);
  });
});
